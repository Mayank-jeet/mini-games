/* ==========================================================
   js/art.js  -  every picture in the game, drawn with code.

   WHY IT EXISTS
   The game ships with NO image files. This module paints the
   world with Canvas 2D calls: lit sky, hazy mountains, parallax
   hills with trees, volumetric clouds, floating rock islands,
   the chicken, Mama Hen, hazards and pickups. Keeping all
   drawing here means sim.js (rules) and ui.js (screens) never
   need to know how anything looks.

   HOW IT IS USED  (global: Art)
     Art.drawLevel(ctx, sim, camX, opts)   one frame of gameplay
     Art.drawDemo(ctx, world, t, reduce)   the animated menu scene
     Art.weather(ctx, world, t, reduce)    snow / rain / pollen overlay
     Art.chicken(ctx, x, y, pose)          also reused for menu art

   REALISM TRICKS USED HERE
     - Atmospheric perspective: far layers are mixed toward the
       horizon colour, so distance reads as haze.
     - One light source (upper left): left faces are lit, right faces
       shaded, undersides darkened, soft shadows under islands.
     - Each rock island is detailed ONCE (strata, cracks, grain, soil,
       grass/snow, crystals) into an offscreen canvas and then simply
       copied every frame, so the richer look costs almost nothing.

   It only READS the sim; it never changes game state. Drawing happens
   in logical 800x450 units; ui.js scales the canvas to fit the screen.
   ========================================================== */
const Art = (() => {
    const TAU = Math.PI * 2;
    const VW = RRC.VIEW_W, VH = RRC.VIEW_H, STEP = RRC.STEP;
    const hash = (n) => { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };
    const mod = (a, n) => ((a % n) + n) % n;
    const lerp = (a, b, t) => a + (b - a) * t;
    const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

    /* ---- colour helpers (inputs are always #rrggbb) ---- */
    const rgbOf = (hex) => { const n = parseInt(hex.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
    const rgba = (hex, a) => { const c = rgbOf(hex); return `rgba(${c[0]},${c[1]},${c[2]},${a})`; };
    const toHex = (r, g, b) => "#" + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, "0")).join("");
    const mixc = (a, b, t) => {
        const A = rgbOf(a), B = rgbOf(b);
        return toHex(A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t);   // returns #rrggbb so calls can be chained
    };
    const shade = (hex, f) => (f < 0 ? mixc(hex, "#000000", -f) : mixc(hex, "#ffffff", f));

    /* One palette per season (same order as RRC.WORLDS). */
    const PAL = [
        { // Summer: golden-hour sky, warm greens
            sky: [[0, "#5db4ea"], [0.5, "#a8dcf2"], [0.85, "#ffe3a1"], [1, "#ffc864"]], haze: "#ffe0a0",
            mount: ["#9bbbe0", "#7597c4"], hills: ["#9bc46a", "#6fae4a", "#4a8f35"], tree: "#3f9a3a",
            grass: ["#9be85f", "#58b83a", "#2f8a2a"], soil: ["#8a5a32", "#5e3a1e"],
            rock: ["#d2b88e", "#9a7b55", "#644a31", "#38281a"], crystal: ["#ff7ad9", "#7ae8ff"], tint: "rgba(255,196,110,0.07)",
        },
        { // Winter: deep blue night to icy horizon
            sky: [[0, "#07123a"], [0.45, "#1b3a78"], [0.8, "#5b8fcf"], [1, "#a9d0f0"]], haze: "#a9d0f0",
            mount: ["#7d9bcb", "#a6bfe2"], hills: ["#cfe4f7", "#a8c8e8", "#86aad4"], tree: "#2f5c7a",
            grass: ["#ffffff", "#e3f1ff", "#b9d6f2"], soil: ["#6b7f9c", "#46587a"],
            rock: ["#a9bdd8", "#7a8ea8", "#4d5e78", "#2b374c"], crystal: ["#8ff0ff", "#c9a8ff"], tint: "rgba(110,150,255,0.07)",
        },
        { // Monsoon: stormy slate, wet greens
            sky: [[0, "#222c3d"], [0.5, "#4a5b72"], [0.85, "#8fa4b6"], [1, "#b4c4cf"]], haze: "#9fb2c0",
            mount: ["#587486", "#3f5766"], hills: ["#4a8a6a", "#357558", "#245f46"], tree: "#2a8a4a",
            grass: ["#6fd27a", "#2f9a4c", "#17683a"], soil: ["#4e3d30", "#2c2119"],
            rock: ["#928f87", "#625f58", "#403d38", "#201e1b"], crystal: ["#6fe0b0", "#7ab8ff"], tint: "rgba(40,80,90,0.12)",
        },
    ];
    /* Pre-computed hill colours: far layers blend toward the haze colour. */
    PAL.forEach((P) => {
        P.hl = [0, 1, 2].map((k) => ({
            top: mixc(shade(P.hills[k], 0.22), P.haze, [0.5, 0.28, 0.08][k]),
            bot: mixc(shade(P.hills[k], -0.18), P.haze, [0.35, 0.15, 0][k]),
            line: mixc(shade(P.hills[k], -0.32), P.haze, [0.4, 0.2, 0.05][k]),
            tree: mixc(shade(P.tree, [0.25, 0.1, -0.05][k]), P.haze, [0.45, 0.22, 0][k]),
        }));
    });

    const outline = (ctx, fill, stroke, lw) => {
        if (fill) { ctx.fillStyle = fill; ctx.fill(); }
        if (stroke) { ctx.lineWidth = lw || 3; ctx.strokeStyle = stroke; ctx.lineJoin = "round"; ctx.stroke(); }
    };
    const ellipse = (ctx, x, y, rx, ry, rot) => { ctx.beginPath(); ctx.ellipse(x, y, rx, ry, rot || 0, 0, TAU); };
    const star = (ctx, x, y, r, pts) => {
        ctx.beginPath();
        for (let k = 0; k < pts * 2; k++) {
            const a = (k * Math.PI) / pts - Math.PI / 2, rr = k % 2 ? r * 0.45 : r;
            ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
        }
        ctx.closePath();
    };

    /* ============================ BACKGROUND ============================ */
    function cloud(ctx, x, y, s, w) {
        const col = w === 2 ? ["#7d8ca2", "#56657a", "#34404f"] : w === 1 ? ["#eef4ff", "#c1d2ee", "#8fa8d2"] : ["#ffffff", "#f3f8fc", "#c6d6ea"];
        const puffs = [[-40, 6, 26], [-18, -8, 32], [10, -14, 36], [38, -4, 30], [58, 8, 22], [0, 10, 34]];
        ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
        ctx.fillStyle = col[2];
        for (const [px, py, r] of puffs) { ctx.beginPath(); ctx.arc(px, py + 8, r, 0, TAU); ctx.fill(); }
        ctx.fillStyle = col[1];
        for (const [px, py, r] of puffs) { ctx.beginPath(); ctx.arc(px, py + 2, r * 0.96, 0, TAU); ctx.fill(); }
        ctx.fillStyle = col[0];
        for (const [px, py, r] of puffs) { ctx.beginPath(); ctx.arc(px - 4, py - 5, r * 0.78, 0, TAU); ctx.fill(); }
        ctx.restore();
    }

    const mtn = (x, off, seed, base, amp) => base - amp * (
        0.55 * (1 - Math.abs(Math.sin((x + off) * 0.0042 + seed))) +
        0.30 * (1 - Math.abs(Math.sin((x + off) * 0.0113 + seed * 2))) +
        0.12 * Math.sin((x + off) * 0.031 + seed));

    function mountains(ctx, w, camX, P) {
        const off = camX * 0.05, seed = w * 3 + 1, base = 292, amp = 150;
        const g = ctx.createLinearGradient(0, base - amp, 0, base + 10);
        g.addColorStop(0, P.mount[0]); g.addColorStop(1, P.mount[1]);
        ctx.beginPath(); ctx.moveTo(0, VH);
        for (let x = 0; x <= VW + 10; x += 10) ctx.lineTo(x, mtn(x, off, seed, base, amp));
        ctx.lineTo(VW, VH); ctx.closePath();
        ctx.fillStyle = g; ctx.fill();
        ctx.save(); ctx.clip();
        if (w === 1) {                                   // snow caps with a ragged lower edge
            const capY = base - amp * 0.52;
            ctx.beginPath(); ctx.moveTo(0, 0);
            for (let x = 0; x <= VW + 10; x += 6) ctx.lineTo(x, capY + 9 * Math.sin((x + off) * 0.09) + 14 * hash(Math.floor((x + off) / 6)));
            ctx.lineTo(VW, 0); ctx.closePath();
            ctx.fillStyle = "rgba(245,250,255,0.92)"; ctx.fill();
        }
        ctx.beginPath();                                 // sunlit ridge line
        for (let x = 0; x <= VW + 10; x += 10) { const y = mtn(x, off, seed, base, amp); x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y); }
        ctx.strokeStyle = "rgba(255,255,255,0.28)"; ctx.lineWidth = 2; ctx.stroke();
        ctx.restore();
        const h = ctx.createLinearGradient(0, base - amp, 0, base + 10);      // haze swallows the bottom
        h.addColorStop(0, rgba(P.haze, 0)); h.addColorStop(1, rgba(P.haze, 0.7));
        ctx.fillStyle = h; ctx.fillRect(0, base - amp - 4, VW, amp + 20);
    }

    function tree(ctx, w, k, x, y, hv, P) {
        const s = [0.55, 0.8, 1.15][k] * (0.85 + hv * 0.4), col = P.hl[k].tree;
        ctx.save(); ctx.translate(x, y);
        if (w === 0) {                                   // leafy tree or bush
            if (hv > 0.55) {
                ctx.fillStyle = mixc(shade(P.tree, -0.1), P.haze, [0.4, 0.2, 0][k]);
                ctx.beginPath(); ctx.arc(-9 * s, -8 * s, 11 * s, 0, TAU); ctx.arc(8 * s, -9 * s, 12 * s, 0, TAU); ctx.fill();
                ctx.fillStyle = col; ctx.beginPath(); ctx.arc(-3 * s, -14 * s, 11 * s, 0, TAU); ctx.fill();
            } else {
                ctx.fillStyle = "#6b4426"; ctx.fillRect(-3 * s, -30 * s, 6 * s, 32 * s);
                ctx.fillStyle = shade(P.tree, -0.25);
                ctx.beginPath(); ctx.arc(0, -44 * s, 22 * s, 0, TAU); ctx.arc(-15 * s, -34 * s, 15 * s, 0, TAU); ctx.arc(15 * s, -34 * s, 15 * s, 0, TAU); ctx.fill();
                ctx.fillStyle = col; ctx.beginPath(); ctx.arc(-3 * s, -47 * s, 19 * s, 0, TAU); ctx.arc(-16 * s, -37 * s, 12 * s, 0, TAU); ctx.fill();
                ctx.fillStyle = "rgba(255,255,200,0.28)"; ctx.beginPath(); ctx.arc(-9 * s, -53 * s, 9 * s, 0, TAU); ctx.fill();
            }
        } else if (w === 1) {                            // snow-laden pine
            ctx.fillStyle = "#3a2c22"; ctx.fillRect(-2.5 * s, -10 * s, 5 * s, 12 * s);
            for (let t = 0; t < 4; t++) {
                const yy = -8 * s - t * 15 * s, ww = (23 - t * 4.5) * s;
                ctx.beginPath(); ctx.moveTo(-ww, yy); ctx.lineTo(0, yy - 24 * s); ctx.lineTo(ww, yy); ctx.closePath();
                ctx.fillStyle = col; ctx.fill();
                ctx.beginPath(); ctx.moveTo(0, yy - 24 * s); ctx.lineTo(ww, yy); ctx.lineTo(ww * 0.15, yy); ctx.closePath();
                ctx.fillStyle = "rgba(0,0,30,0.22)"; ctx.fill();
                ctx.beginPath(); ctx.moveTo(-ww * 0.7, yy - 7 * s); ctx.lineTo(0, yy - 24 * s); ctx.lineTo(ww * 0.55, yy - 10 * s); ctx.lineTo(0, yy - 8 * s); ctx.closePath();
                ctx.fillStyle = "rgba(255,255,255,0.88)"; ctx.fill();
            }
        } else {                                         // palm in the rain
            ctx.strokeStyle = "#5b4430"; ctx.lineWidth = 4.5 * s; ctx.lineCap = "round";
            ctx.beginPath(); ctx.moveTo(0, 2); ctx.quadraticCurveTo(7 * s, -32 * s, 12 * s, -62 * s); ctx.stroke();
            ctx.strokeStyle = col; ctx.lineWidth = 5 * s;
            for (let a = 0; a < 7; a++) {
                const an = -2.9 + a * 0.44, lx = 12 * s + Math.cos(an) * 34 * s, ly = -62 * s + Math.sin(an) * 22 * s + 12 * s;
                ctx.beginPath(); ctx.moveTo(12 * s, -62 * s); ctx.quadraticCurveTo(12 * s + Math.cos(an) * 18 * s, -62 * s - 16 * s, lx, ly); ctx.stroke();
            }
        }
        ctx.restore();
    }

    function background(ctx, w, camX, t, reduce) {
        const P = PAL[w];
        const g = ctx.createLinearGradient(0, 0, 0, VH);
        P.sky.forEach(([s, c]) => g.addColorStop(s, c));
        ctx.fillStyle = g; ctx.fillRect(0, 0, VW, VH);

        /* ----- sun / moon / storm light ----- */
        if (w === 0) {
            const sx = VW - 130, sy = 118;
            const halo = ctx.createRadialGradient(sx, sy, 10, sx, sy, 300);
            halo.addColorStop(0, "rgba(255,246,190,0.95)"); halo.addColorStop(0.25, "rgba(255,225,140,0.45)"); halo.addColorStop(1, "rgba(255,210,120,0)");
            ctx.fillStyle = halo; ctx.fillRect(0, 0, VW, VH);
            ctx.save(); ctx.globalCompositeOperation = "lighter";          // soft god rays
            for (let r = 0; r < 7; r++) {
                const a = 1.75 + r * 0.2 + (reduce ? 0 : Math.sin(t * 0.3 + r) * 0.02);
                ctx.beginPath(); ctx.moveTo(sx, sy);
                ctx.lineTo(sx + Math.cos(a - 0.05) * 700, sy + Math.sin(a - 0.05) * 700);
                ctx.lineTo(sx + Math.cos(a + 0.05) * 700, sy + Math.sin(a + 0.05) * 700); ctx.closePath();
                ctx.fillStyle = "rgba(255,240,180,0.05)"; ctx.fill();
            }
            ctx.restore();
            ctx.beginPath(); ctx.arc(sx, sy, 34, 0, TAU); ctx.fillStyle = "#fffbe0"; ctx.fill();
        } else if (w === 1) {
            ctx.fillStyle = "#fff";
            for (let k = 0; k < 60; k++) {
                const tw = reduce ? 0.8 : 0.5 + 0.5 * Math.sin(t * 2 + k);
                ctx.globalAlpha = 0.3 + 0.55 * tw;
                ellipse(ctx, hash(k) * VW, hash(k + 50) * 230, 0.8 + hash(k + 9) * 1.3, 0.8 + hash(k + 9) * 1.3); ctx.fill();
            }
            ctx.globalAlpha = 1;
            for (let r = 0; r < 3; r++) {                                   // aurora ribbons
                const col = ["80,255,190", "90,200,255", "170,130,255"][r];
                ctx.beginPath();
                for (let x = 0; x <= VW; x += 16) {
                    const y = 70 + r * 34 + 34 * Math.sin(x * 0.011 + (reduce ? 0 : t * 0.4) + r * 1.7);
                    x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
                }
                for (let x = VW; x >= 0; x -= 16) ctx.lineTo(x, 70 + r * 34 + 34 * Math.sin(x * 0.011 + (reduce ? 0 : t * 0.4) + r * 1.7) + 56);
                ctx.closePath();
                const ag = ctx.createLinearGradient(0, 40 + r * 34, 0, 170 + r * 34);
                ag.addColorStop(0, `rgba(${col},0)`); ag.addColorStop(0.4, `rgba(${col},0.22)`); ag.addColorStop(1, `rgba(${col},0)`);
                ctx.fillStyle = ag; ctx.fill();
            }
            const mx = VW - 140, my = 92;
            const halo = ctx.createRadialGradient(mx, my, 8, mx, my, 170);
            halo.addColorStop(0, "rgba(210,225,255,0.55)"); halo.addColorStop(1, "rgba(210,225,255,0)");
            ctx.fillStyle = halo; ctx.fillRect(0, 0, VW, 300);
            ctx.beginPath(); ctx.arc(mx, my, 28, 0, TAU); ctx.fillStyle = "#f6f8ff"; ctx.fill();
            ctx.fillStyle = "rgba(150,165,205,0.45)";
            ellipse(ctx, mx - 8, my - 6, 6, 5); ctx.fill(); ellipse(ctx, mx + 9, my + 8, 5, 4); ctx.fill(); ellipse(ctx, mx + 4, my - 12, 3, 3); ctx.fill();
        } else {
            const halo = ctx.createRadialGradient(VW * 0.7, 120, 10, VW * 0.7, 120, 320);
            halo.addColorStop(0, "rgba(205,222,238,0.38)"); halo.addColorStop(1, "rgba(205,222,238,0)");
            ctx.fillStyle = halo; ctx.fillRect(0, 0, VW, VH);
            if (!reduce) {
                const cyc = mod(t * 0.35, 7), n = Math.floor(t * 0.35 / 7);
                if (cyc < 0.16) {                                            // lightning flash + bolt
                    ctx.fillStyle = "rgba(235,242,255,0.32)"; ctx.fillRect(0, 0, VW, VH);
                    let bx = 120 + hash(n * 3.3) * 560, by = 0;
                    ctx.beginPath(); ctx.moveTo(bx, by);
                    for (let s = 0; s < 7; s++) { bx += (hash(n + s * 1.9) - 0.5) * 70; by += 36; ctx.lineTo(bx, by); }
                    ctx.lineJoin = "round"; ctx.strokeStyle = "rgba(200,220,255,0.45)"; ctx.lineWidth = 9; ctx.stroke();
                    ctx.strokeStyle = "#ffffff"; ctx.lineWidth = 2.5; ctx.stroke();
                }
            }
        }

        /* ----- clouds and (summer) birds ----- */
        for (let k = 0; k < 5; k++) {
            const x = mod(k * 330 - camX * 0.1 - (reduce ? 0 : t * 9), VW + 340) - 170;
            cloud(ctx, x, (w === 2 ? 50 : 70) + hash(k + 3) * 90, (w === 2 ? 1.5 : 0.95) + hash(k + 8) * 0.7, w);
        }
        if (w === 0) {
            ctx.strokeStyle = "rgba(50,45,60,0.55)"; ctx.lineWidth = 2; ctx.lineCap = "round";
            for (let b = 0; b < 4; b++) {
                const bx = mod(b * 190 + (reduce ? 0 : t * 38), VW + 200) - 100, by = 80 + b * 26 + (reduce ? 0 : Math.sin(t * 1.5 + b) * 8);
                const fl = reduce ? 0.6 : Math.sin(t * 9 + b) * 5;
                ctx.beginPath(); ctx.moveTo(bx - 9, by + fl); ctx.quadraticCurveTo(bx - 4, by - 5, bx, by); ctx.quadraticCurveTo(bx + 4, by - 5, bx + 9, by + fl); ctx.stroke();
            }
        }

        mountains(ctx, w, camX, P);

        /* ----- three parallax hill layers with trees, fog drifting between ----- */
        for (let k = 0; k < 3; k++) {
            const f = 0.14 + k * 0.17, base = 268 + k * 50, amp = 34 + k * 10, wl = 560 - k * 90;
            const yAt = (wx) => base + amp * Math.sin((wx / wl) * TAU + k * 1.7) + amp * 0.45 * Math.sin((wx / (wl * 0.43)) * TAU + k);
            const off = camX * f, C = P.hl[k];
            const hg = ctx.createLinearGradient(0, base - amp, 0, base + amp + 90);
            hg.addColorStop(0, C.top); hg.addColorStop(1, C.bot);
            ctx.beginPath(); ctx.moveTo(0, VH);
            for (let x = 0; x <= VW + 8; x += 8) ctx.lineTo(x, yAt(x + off));
            ctx.lineTo(VW, VH); ctx.closePath();
            ctx.fillStyle = hg; ctx.fill();
            ctx.beginPath();
            for (let x = 0; x <= VW + 8; x += 8) { const y = yAt(x + off); x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y); }
            ctx.lineWidth = 2.5; ctx.strokeStyle = C.line; ctx.stroke();
            const spacing = 120 + k * 36, i0 = Math.floor(off / spacing) - 1;
            for (let i = i0; i < i0 + VW / spacing + 3; i++) {
                const hv = hash(i * 3 + k * 17);
                if (hv < 0.22) continue;
                const wx = i * spacing + hash(i + k * 31) * 70, sx = wx - off;
                if (sx > -70 && sx < VW + 70) tree(ctx, w, k, sx, yAt(wx) + 4, hv, P);
            }
            if (w !== 0 && k < 2) {                                         // drifting mist
                ctx.fillStyle = rgba(P.haze, w === 2 ? 0.2 : 0.16);
                for (let m = 0; m < 4; m++) {
                    const mx = mod(m * 260 - off * 0.6 - (reduce ? 0 : t * (10 + k * 6)), VW + 400) - 200;
                    ellipse(ctx, mx, base + amp * 0.4, 230, 20 + k * 8); ctx.fill();
                }
            }
        }
    }

    /* ============================ ROCK ISLANDS ============================ */
    /* drawBody paints one island in WORLD coordinates (caller sets the transform). */
    function drawBody(c, p, w, k0, k1, withShadow) {
        const P = PAL[w], flat = p.flat !== undefined, ice = p.style === "ice";
        const n = flat ? 1e9 : p.ys.length - 1;
        const salt = flat ? 3 : p.id * 7 + 1;
        const len = p.x1 - p.x0;
        const yAt = (k) => (flat ? p.flat : p.ys[Math.min(Math.max(k, 0), n)]);
        const X = (k) => p.x0 + k * STEP;
        const ySurf = (x) => (flat ? p.flat : RRC.surfaceY(p, x));
        const taper = (x) => (flat ? 1 : Math.pow(Math.sin(Math.PI * clamp((x - p.x0) / len, 0.03, 0.97)), 0.5));
        const depth = (k) => (28 + 78 * taper(X(k))) * (0.72 + 0.55 * hash(k * 1.7 + salt));

        /* outline: top edge left->right, then a jagged hanging underside right->left */
        const top = [], under = [];
        for (let k = k0; k <= k1; k++) top.push([X(k), yAt(k)]);
        for (let k = k1; k >= k0; k--) {
            const d = depth(k);
            under.push([X(k), yAt(k) + d]);
            if (k > k0) {
                const xa = X(k), xb = X(k - 1), ya = yAt(k), yb = yAt(k - 1), dn = depth(k - 1);
                const h1 = hash(k * 3.1 + salt + 2), h2 = hash(k * 5.3 + salt + 4);
                under.push([xa - (xa - xb) * 0.33, lerp(ya, yb, 0.33) + lerp(d, dn, 0.33) * (0.45 + 0.8 * h1)]);
                under.push([xa - (xa - xb) * 0.66, lerp(ya, yb, 0.66) + lerp(d, dn, 0.66) * (0.35 + 0.9 * h2)]);
            }
        }
        const bodyPath = () => {
            c.beginPath();
            top.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y)));
            under.forEach(([x, y]) => c.lineTo(x, y));
            c.closePath();
        };
        let minY = 1e9;
        for (const [, y] of top) minY = Math.min(minY, y);

        /* soft drop shadow (only in the cached version; shadow blur is costly per frame) */
        if (withShadow) {
            c.save(); c.shadowColor = "rgba(0,0,0,0.38)"; c.shadowBlur = 24; c.shadowOffsetY = 18;
            bodyPath(); c.fillStyle = P.rock[2]; c.fill(); c.restore();
        }
        /* rock gradient: lit on top, dark underneath */
        const rg = c.createLinearGradient(0, minY, 0, minY + 210);
        rg.addColorStop(0, ice ? "#d4f2ff" : P.rock[0]);
        rg.addColorStop(0.3, ice ? "#9fd8f5" : P.rock[1]);
        rg.addColorStop(1, ice ? "#4f8fc4" : P.rock[2]);
        bodyPath(); c.fillStyle = rg; c.fill();

        c.save(); bodyPath(); c.clip();
        /* strata: wavy sedimentary bands */
        for (let j = 1; j <= 3; j++) {
            c.beginPath();
            for (let k = k0; k <= k1; k++) {
                const y = yAt(k) + 24 * j + 7 * Math.sin(k * 0.9 + j * 2 + salt);
                k === k0 ? c.moveTo(X(k), y) : c.lineTo(X(k), y);
            }
            c.strokeStyle = rgba(P.rock[3], 0.22); c.lineWidth = 2.4; c.stroke();
            c.translate(0, 2.5);
            c.strokeStyle = "rgba(255,255,255,0.12)"; c.lineWidth = 1.5; c.stroke();
            c.translate(0, -2.5);
        }
        /* per-column faceting, cracks and grain */
        for (let k = k0; k < k1; k++) {
            const x = X(k), y = yAt(k);
            const a = hash(k * 2.3 + salt), b = hash(k * 4.1 + salt + 3), d = hash(k * 6.7 + salt + 8);
            c.fillStyle = a > 0.5 ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.11)";
            c.fillRect(x, y, STEP, 280);
            c.beginPath(); c.moveTo(x, y + 6); c.lineTo(x + STEP * (0.3 + 0.5 * b), y + 34 + 60 * d); c.lineTo(x + STEP, y + 6); c.closePath();
            c.fillStyle = b > 0.5 ? "rgba(0,0,0,0.13)" : "rgba(255,255,255,0.09)"; c.fill();
            c.beginPath(); c.moveTo(x + 6 + a * 20, y + 14); c.lineTo(x + 2 + b * 30, y + 14 + 26 + 44 * d);
            if (d > 0.45) c.lineTo(x + 10 + a * 22, y + 14 + 56 + 40 * b);
            c.strokeStyle = rgba(P.rock[3], 0.5); c.lineWidth = 1.8; c.stroke();
            c.translate(1.6, 0); c.strokeStyle = "rgba(255,255,255,0.22)"; c.lineWidth = 1; c.stroke(); c.translate(-1.6, 0);
            for (let q = 0; q < 6; q++) {
                const hx = hash(k * 11 + q * 3.7 + salt), hy = hash(k * 7 + q * 5.1 + salt + 1);
                c.fillStyle = hx > 0.5 ? rgba(P.rock[3], 0.3) : "rgba(255,255,255,0.22)";
                c.fillRect(x + hx * STEP, y + 14 + hy * 90, 1.6 + hy * 1.6, 1.4 + hx * 1.4);
            }
        }
        if (ice) {                                           // frozen: cold tint + glossy streaks
            c.fillStyle = "rgba(150,225,255,0.3)"; c.fillRect(X(k0), minY - 10, X(k1) - X(k0), 320);
            c.strokeStyle = "rgba(255,255,255,0.4)"; c.lineWidth = 2.5;
            for (let k = k0; k < k1; k += 2) {
                if (hash(k * 1.9 + salt) > 0.45) { c.beginPath(); c.moveTo(X(k) + 6, yAt(k) + 22); c.lineTo(X(k) + 26, yAt(k) + 52); c.stroke(); }
            }
        }
        const bg = c.createLinearGradient(0, minY + 30, 0, minY + 230);      // underside falls into shadow
        bg.addColorStop(0, "rgba(0,0,0,0)"); bg.addColorStop(1, "rgba(5,8,20,0.42)");
        c.fillStyle = bg; c.fillRect(X(k0) - 4, minY, X(k1) - X(k0) + 8, 330);
        c.restore();

        /* crisp dark outline on the underside and the two end walls */
        c.beginPath();
        under.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y)));
        c.lineJoin = "round"; c.lineCap = "round";
        c.strokeStyle = rgba(P.rock[3], 0.85); c.lineWidth = 2.6; c.stroke();
        c.beginPath(); c.moveTo(top[0][0], top[0][1]); c.lineTo(under[under.length - 1][0], under[under.length - 1][1]);
        c.moveTo(top[top.length - 1][0], top[top.length - 1][1]); c.lineTo(under[0][0], under[0][1]); c.stroke();

        /* ----- soil band under the turf ----- */
        c.beginPath();
        for (let k = k0; k <= k1; k++) { const x = X(k), y = yAt(k) + 1; k === k0 ? c.moveTo(x, y) : c.lineTo(x, y); }
        for (let k = k1; k >= k0; k--) c.lineTo(X(k), yAt(k) + 9 + 8 * hash(k * 1.3 + salt));
        c.closePath();
        const sg = c.createLinearGradient(0, minY, 0, minY + 40);
        sg.addColorStop(0, P.soil[0]); sg.addColorStop(1, P.soil[1]);
        c.fillStyle = sg; c.fill();
        c.fillStyle = "rgba(0,0,0,0.25)";
        for (let k = k0; k < k1; k++) {
            if (hash(k * 2.7 + salt) > 0.5) c.fillRect(X(k) + hash(k + salt) * 30, yAt(k) + 6, 3, 3);
        }

        /* ----- turf / snow cap ----- */
        const cap = () => {
            c.beginPath();
            for (let k = k0; k <= k1; k++) { const x = X(k), y = yAt(k) - 2; k === k0 ? c.moveTo(x, y) : c.lineTo(x, y); }
            for (let k = k1; k >= k0; k--) {
                const y = yAt(k) + 5 + 8 * hash(k * 7 + salt);
                c.lineTo(X(k), y);
                if (k > k0) c.lineTo(X(k) - STEP / 2, yAt(k) + 9 + 14 * hash(k * 9 + salt + 2));
            }
            c.closePath();
        };
        c.save(); c.translate(0, 2); cap(); c.fillStyle = P.grass[2]; c.fill(); c.restore();
        cap(); c.fillStyle = ice ? "#e9fbff" : P.grass[1]; c.fill();
        c.beginPath();
        for (let k = k0; k <= k1; k++) { const x = X(k), y = yAt(k) - 2; k === k0 ? c.moveTo(x, y) : c.lineTo(x, y); }
        c.strokeStyle = ice ? "#ffffff" : P.grass[0]; c.lineWidth = 3.2; c.lineCap = "round"; c.stroke();

        for (let x = X(k0); x <= X(k1); x += 4.5) {
            const hh = hash(x * 0.37 + salt), y0 = ySurf(x);
            if (w === 1 || ice) {                            // snow lumps / ice shards
                if (ice) {
                    if (hh > 0.55) {
                        c.beginPath(); c.moveTo(x - 2.5, y0 - 1); c.lineTo(x + 0.5, y0 - 6 - hh * 9); c.lineTo(x + 3, y0 - 1); c.closePath();
                        c.fillStyle = hh > 0.8 ? "#ffffff" : "#bdeeff"; c.fill();
                    }
                } else {
                    c.beginPath(); c.arc(x, y0 - 1, 3 + hh * 4.5, Math.PI, 0); c.fillStyle = "#ffffff"; c.fill();
                    c.beginPath(); c.arc(x + 1, y0 + 1, 2.5 + hh * 3, 0, Math.PI); c.fillStyle = "rgba(150,190,235,0.55)"; c.fill();
                }
            } else {                                         // grass blades, two tones, leaning in the wind
                const h = 6 + hh * 11, lean = (hh - 0.5) * 6;
                c.beginPath(); c.moveTo(x - 2, y0 + 1);
                c.quadraticCurveTo(x - 0.5, y0 - h * 0.6, x + lean, y0 - h);
                c.quadraticCurveTo(x + 1.5, y0 - h * 0.4, x + 2, y0 + 1);
                c.fillStyle = hh > 0.5 ? P.grass[0] : P.grass[1]; c.fill();
            }
            if (w === 0 && hh > 0.955) {                     // wild flowers
                c.strokeStyle = P.grass[2]; c.lineWidth = 1.6;
                c.beginPath(); c.moveTo(x, y0); c.lineTo(x, y0 - 13); c.stroke();
                c.fillStyle = hh > 0.98 ? "#ff7a8a" : "#fff27a";
                for (let q = 0; q < 5; q++) { c.beginPath(); c.arc(x + Math.cos(q * 1.257) * 3.4, y0 - 14 + Math.sin(q * 1.257) * 3.4, 2.2, 0, TAU); c.fill(); }
                c.beginPath(); c.arc(x, y0 - 14, 1.8, 0, TAU); c.fillStyle = "#e8922a"; c.fill();
            }
            if (w === 2 && hh > 0.93) {                      // ferns
                c.strokeStyle = P.grass[0]; c.lineWidth = 1.8;
                for (let q = -2; q <= 2; q++) { c.beginPath(); c.moveTo(x, y0); c.quadraticCurveTo(x + q * 3, y0 - 9, x + q * 6.5, y0 - 11 + Math.abs(q) * 3); c.stroke(); }
            }
        }
        if (w === 2 && !ice) {                               // rain-wet sheen on the grass
            c.beginPath();
            for (let k = k0; k <= k1; k++) { const x = X(k), y = yAt(k) - 4; k === k0 ? c.moveTo(x, y) : c.lineTo(x, y); }
            c.strokeStyle = "rgba(255,255,255,0.28)"; c.lineWidth = 1.4; c.stroke();
        }
        if (w === 1 && !ice) {                               // icicles under the snow cap
            for (let k = k0; k < k1; k++) {
                const hh = hash(k * 3.9 + salt + 6);
                if (hh > 0.62) {
                    const x = X(k) + hash(k + salt) * STEP, y = yAt(k) + 12;
                    c.beginPath(); c.moveTo(x - 2.5, y); c.lineTo(x, y + 8 + hh * 12); c.lineTo(x + 2.5, y); c.closePath();
                    c.fillStyle = "rgba(220,244,255,0.9)"; c.fill();
                }
            }
        }

        /* ----- things hanging from the underside: crystals, roots, icicles ----- */
        for (let k = k0; k < k1; k++) {
            const hh = hash(k * 9.1 + salt + 5);
            const bx = X(k) + STEP * 0.5, by = yAt(k) + depth(k) * 0.82;
            if (hh > 0.85) {                                 // glowing crystal cluster
                const cc = P.crystal[hash(k + salt) > 0.5 ? 0 : 1];
                const gl = c.createRadialGradient(bx, by + 8, 2, bx, by + 8, 30);
                gl.addColorStop(0, rgba(cc, 0.5)); gl.addColorStop(1, rgba(cc, 0));
                c.fillStyle = gl; c.fillRect(bx - 30, by - 22, 60, 60);
                for (let q = -1; q <= 1; q++) {
                    const hgt = 12 + hash(k * 3 + q + salt) * 14, wd = 4.2 - Math.abs(q) * 0.7, ang = q * 0.35;
                    c.save(); c.translate(bx + q * 6, by); c.rotate(ang);
                    c.beginPath(); c.moveTo(-wd, 0); c.lineTo(-wd * 0.7, hgt * 0.7); c.lineTo(0, hgt); c.lineTo(wd * 0.7, hgt * 0.7); c.lineTo(wd, 0); c.closePath();
                    const cg = c.createLinearGradient(-wd, 0, wd, hgt);
                    cg.addColorStop(0, "#ffffff"); cg.addColorStop(0.35, cc); cg.addColorStop(1, shade(cc, -0.35));
                    c.fillStyle = cg; c.fill(); c.lineWidth = 1.2; c.strokeStyle = shade(cc, -0.5); c.stroke();
                    c.restore();
                }
            } else if (hh < 0.14 && w !== 1) {               // dangling roots with leaves
                const rl = 24 + hash(k + salt) * 32;
                c.strokeStyle = shade(P.soil[0], -0.1); c.lineWidth = 2; c.lineCap = "round";
                c.beginPath(); c.moveTo(bx, by - 10); c.quadraticCurveTo(bx + 7, by + rl * 0.5, bx + 2, by + rl); c.stroke();
                c.fillStyle = P.grass[1];
                for (let q = 1; q <= 3; q++) { ellipse(c, bx + (q % 2 ? 4 : -2) + 2, by + q * rl / 4, 4.5, 2.4, q % 2 ? 0.6 : -0.6); c.fill(); }
            } else if (w === 1 && hh > 0.3 && hh < 0.5) {    // big icicles
                const il = 14 + hh * 40;
                c.beginPath(); c.moveTo(bx - 4, by - 6); c.lineTo(bx, by + il); c.lineTo(bx + 4, by - 6); c.closePath();
                c.fillStyle = "rgba(210,242,255,0.88)"; c.fill(); c.lineWidth = 1.2; c.strokeStyle = "rgba(90,160,210,0.9)"; c.stroke();
            }
        }
    }

    /* Detail an island once into an offscreen canvas, then just copy it each frame. */
    const platCache = new WeakMap();
    function platformImage(p, w) {
        let e = platCache.get(p);
        if (e && e.w === w) return e;
        if (typeof document === "undefined") return null;
        const S = 1.5;
        let minY = 1e9, maxY = -1e9;
        for (const y of p.ys) { minY = Math.min(minY, y); maxY = Math.max(maxY, y); }
        const ox = p.x0 - 40, oy = minY - 52;
        const cv = document.createElement("canvas");
        cv.width = Math.ceil(((p.x1 - p.x0) + 80) * S);
        cv.height = Math.ceil(((maxY - minY) + 52 + 270) * S);
        const c = cv.getContext("2d");
        if (!c) return null;
        c.setTransform(S, 0, 0, S, -ox * S, -oy * S);
        drawBody(c, p, w, 0, p.ys.length - 1, true);
        e = { cv, ox, oy, S, w };
        platCache.set(p, e);
        return e;
    }
    function platform(ctx, p, w, camX) {
        const flat = p.flat !== undefined;
        if (!flat) {
            const e = platformImage(p, w);
            if (e) { ctx.drawImage(e.cv, e.ox - camX, e.oy, e.cv.width / e.S, e.cv.height / e.S); return; }
        }
        let k0 = Math.floor((camX - 80 - p.x0) / STEP), k1 = Math.ceil((camX + VW + 80 - p.x0) / STEP);
        if (!flat) { k0 = Math.max(0, k0); k1 = Math.min(p.ys.length - 1, k1); }
        if (k1 <= k0) return;
        ctx.save(); ctx.translate(-camX, 0);
        drawBody(ctx, p, w, k0, k1, false);
        ctx.restore();
    }

    /* ============================ THE CHICKEN ============================ */
    function chicken(ctx, x, y, o) {
        const t = o.t || 0, s = o.scale || 1.15;
        ctx.save();
        ctx.translate(x, y); ctx.scale(s, s);
        if (o.invuln > 0 && Math.floor(t * 14) % 2 === 0) ctx.globalAlpha = 0.45;
        const grounded = o.grounded !== false;
        const run = grounded ? Math.sin(t * 22) : 0;
        const bob = grounded ? -Math.abs(run) * 2.5 : 0;

        if (o.power && o.power.wings > 0) {                  // golden aura
            const gl = ctx.createRadialGradient(0, -17, 4, 0, -17, 38);
            gl.addColorStop(0, "rgba(255,230,90,0.7)"); gl.addColorStop(1, "rgba(255,230,90,0)");
            ctx.fillStyle = gl; ellipse(ctx, 0, -17, 38, 38); ctx.fill();
        }
        if (grounded) { ctx.fillStyle = "rgba(0,0,0,0.22)"; ellipse(ctx, 0, 1, 14, 3.5); ctx.fill(); }

        /* legs */
        ctx.strokeStyle = "#f08a1c"; ctx.lineWidth = 3; ctx.lineCap = "round";
        const l1 = grounded ? run * 7 : -5, l2 = grounded ? -run * 7 : 5, ly = grounded ? 0 : -4;
        ctx.beginPath(); ctx.moveTo(-3, -7 + bob); ctx.lineTo(-3 + l1, ly); ctx.moveTo(4, -7 + bob); ctx.lineTo(4 + l2, ly); ctx.stroke();

        /* tail tuft */
        ellipse(ctx, -16, -18 + bob, 6, 3.5, -0.6); outline(ctx, "#ffcb2b", "#d99a12", 2);
        ellipse(ctx, -15, -13 + bob, 5, 3, -0.2); outline(ctx, "#ffcb2b", "#d99a12", 2);
        /* body and head */
        ellipse(ctx, -2, -15 + bob, 14, 12); outline(ctx, "#ffd93b", "#d99a12", 3);
        ellipse(ctx, 0, -10 + bob, 8, 6); ctx.fillStyle = "#fff0a0"; ctx.fill();
        ctx.beginPath(); ctx.arc(6, -26 + bob, 10, 0, TAU); outline(ctx, "#ffd93b", "#d99a12", 3);
        /* comb */
        ctx.fillStyle = "#ff4040"; ctx.strokeStyle = "#b32020"; ctx.lineWidth = 1.5;
        for (const [cx, cy, r] of [[2, -36, 3.5], [6.5, -37.5, 4], [11, -35, 3.5]]) {
            ctx.beginPath(); ctx.arc(cx, cy + bob, r, 0, TAU); ctx.fill(); ctx.stroke();
        }
        /* beak, eye, cheek */
        ctx.beginPath(); ctx.moveTo(14, -28 + bob); ctx.lineTo(22, -25 + bob); ctx.lineTo(14, -22 + bob); ctx.closePath();
        outline(ctx, "#ff9a1f", "#c76a0a", 1.5);
        ellipse(ctx, 9.5, -28 + bob, 3.6, 4); ctx.fillStyle = "#fff"; ctx.fill();
        ellipse(ctx, 10.5, -27.5 + bob, 1.9, 2.2); ctx.fillStyle = "#222"; ctx.fill();
        ellipse(ctx, 11, -20 + bob, 3, 2); ctx.fillStyle = "rgba(255,110,130,0.55)"; ctx.fill();
        /* wing: flutters when flapping, spreads while gliding */
        const flapping = o.flapT !== undefined && o.flapT < 0.25;
        let ang = grounded ? Math.sin(t * 22 + 1) * 0.25 - 0.1 : -0.5;
        if (flapping) ang = Math.sin(t * 38) * 0.9 - 0.7;
        if (o.gliding) ang = -1.15;
        ctx.save(); ctx.translate(-5, -17 + bob); ctx.rotate(ang);
        ellipse(ctx, -2, 0, o.gliding ? 15 : 10, o.gliding ? 5 : 6.5); outline(ctx, "#ffc61f", "#d99a12", 2.5);
        ctx.restore();
        if (o.power && o.power.wings > 0) {
            ctx.save(); ctx.translate(-5, -20 + bob); ctx.rotate(ang - 0.6);
            ellipse(ctx, -5, 0, 14, 5); outline(ctx, "#fff7c2", "#e8c030", 2); ctx.restore();
        }
        if (o.power && o.power.shield > 0) {                 // bubble
            ellipse(ctx, 0, -18, 27, 27); ctx.fillStyle = "rgba(120,220,255,0.22)"; ctx.fill();
            ctx.lineWidth = 2.5; ctx.strokeStyle = "rgba(255,255,255,0.85)"; ctx.stroke();
            ctx.beginPath(); ctx.arc(-8, -28, 7, Math.PI * 1.1, Math.PI * 1.6); ctx.stroke();
        }
        if (o.power && o.power.magnet > 0) {
            ctx.save(); ctx.translate(0, -18); ctx.rotate(t * 3); ctx.lineWidth = 3;
            ctx.setLineDash([8, 8]); ctx.strokeStyle = "#ff5a5a"; ctx.beginPath(); ctx.arc(0, 0, 30, 0, TAU); ctx.stroke();
            ctx.restore();
        }
        ctx.restore();
    }

    function motherHen(ctx, x, y, t, happy) {
        ctx.save(); ctx.translate(x, y);
        /* nest */
        ellipse(ctx, 0, -2, 46, 12); outline(ctx, "#f2c14e", "#a8741a", 3);
        ctx.strokeStyle = "#c28a22"; ctx.lineWidth = 2;
        for (let k = -3; k <= 3; k++) { ctx.beginPath(); ctx.moveTo(k * 12, -2); ctx.lineTo(k * 12 + 6, -12); ctx.stroke(); }
        /* hen */
        const b = Math.sin(t * 3) * 1.2;
        ellipse(ctx, 0, -26 + b, 30, 24); outline(ctx, "#f4a53c", "#a8601a", 3.5);
        ctx.beginPath(); ctx.arc(20, -46 + b, 15, 0, TAU); outline(ctx, "#f4a53c", "#a8601a", 3.5);
        ctx.fillStyle = "#ff3b3b"; ctx.strokeStyle = "#a82020"; ctx.lineWidth = 2;
        for (const [cx, cy, r] of [[11, -61, 5], [19, -64, 6], [28, -60, 5]]) { ctx.beginPath(); ctx.arc(cx, cy + b, r, 0, TAU); ctx.fill(); ctx.stroke(); }
        ctx.beginPath(); ctx.moveTo(32, -48 + b); ctx.lineTo(44, -44 + b); ctx.lineTo(32, -39 + b); ctx.closePath(); outline(ctx, "#ffb21f", "#b86f0a", 2);
        ellipse(ctx, 24, -50 + b, 4, 5); ctx.fillStyle = "#fff"; ctx.fill();
        ellipse(ctx, 25.5, -49 + b, 2.2, 2.6); ctx.fillStyle = "#222"; ctx.fill();
        ellipse(ctx, -6, -26 + b, 16, 11, -0.3); outline(ctx, "#e68a22", "#a8601a", 2.5);
        if (happy) {
            for (let k = 0; k < 3; k++) {
                const ph = mod(t * 0.8 + k / 3, 1);
                ctx.globalAlpha = 1 - ph; ctx.fillStyle = "#ff5a8a"; ctx.font = "bold 22px sans-serif";
                ctx.fillText("♥", -14 + k * 22 + Math.sin(ph * 6) * 5, -70 - ph * 50);
            }
            ctx.globalAlpha = 1;
        }
        ctx.restore();
    }

    /* ============================ PICKUPS ============================ */
    function coin(ctx, x, y, t, ph) {
        const sx = Math.max(0.22, Math.abs(Math.cos(t * 4 + ph)));
        ctx.save(); ctx.translate(x, y); ctx.scale(sx, 1);
        ellipse(ctx, 0, 0, 11, 11); outline(ctx, "#ffd23a", "#b8780c", 2.5);
        star(ctx, 0, 0, 6.5, 5); ctx.fillStyle = "#ff9d1f"; ctx.fill();
        ctx.restore();
    }
    function gem(ctx, x, y, t) {
        const bob = Math.sin(t * 3) * 3;
        ctx.save(); ctx.translate(x, y + bob);
        const gl = ctx.createRadialGradient(0, 0, 2, 0, 0, 26);
        gl.addColorStop(0, "rgba(120,255,255,0.65)"); gl.addColorStop(1, "rgba(120,255,255,0)");
        ctx.fillStyle = gl; ellipse(ctx, 0, 0, 26, 26); ctx.fill();
        ctx.beginPath(); ctx.moveTo(0, -15); ctx.lineTo(13, -3); ctx.lineTo(0, 15); ctx.lineTo(-13, -3); ctx.closePath();
        outline(ctx, "#32d6ff", "#0b6fa8", 2.5);
        ctx.beginPath(); ctx.moveTo(0, -15); ctx.lineTo(-5, -3); ctx.lineTo(0, 15); ctx.moveTo(-13, -3); ctx.lineTo(13, -3);
        ctx.strokeStyle = "rgba(255,255,255,0.75)"; ctx.lineWidth = 1.5; ctx.stroke();
        ctx.restore();
    }
    function powerup(ctx, x, y, type, t) {
        const bob = Math.sin(t * 3 + x) * 4;
        ctx.save(); ctx.translate(x, y + bob);
        ellipse(ctx, 0, 0, 20, 20); ctx.fillStyle = "rgba(255,255,255,0.55)"; ctx.fill();
        ctx.lineWidth = 3; ctx.strokeStyle = "#fff"; ctx.stroke();
        ctx.lineCap = "round";
        if (type === "shield") {
            ctx.beginPath(); ctx.moveTo(0, -11); ctx.lineTo(10, -7); ctx.quadraticCurveTo(10, 7, 0, 12); ctx.quadraticCurveTo(-10, 7, -10, -7); ctx.closePath();
            outline(ctx, "#4cc3ff", "#0d6aa8", 2.5);
        } else if (type === "magnet") {
            ctx.lineWidth = 6; ctx.strokeStyle = "#e33";
            ctx.beginPath(); ctx.arc(0, 0, 8, Math.PI, TAU); ctx.moveTo(-8, 0); ctx.lineTo(-8, 5); ctx.moveTo(8, 0); ctx.lineTo(8, 5); ctx.stroke();
            ctx.strokeStyle = "#e8e8e8";
            ctx.beginPath(); ctx.moveTo(-8, 5); ctx.lineTo(-8, 9); ctx.moveTo(8, 5); ctx.lineTo(8, 9); ctx.stroke();
        } else {
            ellipse(ctx, -5, 0, 10, 4.5, -0.5); outline(ctx, "#fff7c2", "#d9a820", 2);
            ellipse(ctx, 5, 0, 10, 4.5, 0.5); outline(ctx, "#fff7c2", "#d9a820", 2);
        }
        ctx.restore();
    }

    /* ============================ HAZARDS ============================ */
    function halo(ctx, x, y, r) {                       // "high-visibility hazards" accessibility option
        const g = ctx.createRadialGradient(x, y, r * 0.3, x, y, r);
        g.addColorStop(0, "rgba(255,40,40,0.55)"); g.addColorStop(1, "rgba(255,40,40,0)");
        ctx.fillStyle = g; ellipse(ctx, x, y, r, r); ctx.fill();
        ctx.setLineDash([6, 5]); ctx.lineWidth = 2.5; ctx.strokeStyle = "#ff2a2a";
        ellipse(ctx, x, y, r * 0.78, r * 0.78); ctx.stroke(); ctx.setLineDash([]);
    }

    function spike(ctx, x, y, skin) {
        ctx.save(); ctx.translate(x, y);
        if (skin === "thorn") {                         // thorny bush
            ellipse(ctx, 0, -6, 17, 9); outline(ctx, "#3d8f2a", "#1f5a14", 2.5);
            for (const [dx, h] of [[-9, 24], [0, 30], [9, 24]]) {
                ctx.beginPath(); ctx.moveTo(dx - 6, -4); ctx.lineTo(dx, -h); ctx.lineTo(dx + 6, -4); ctx.closePath();
                outline(ctx, "#59b83a", "#1f5a14", 2.5);
            }
        } else if (skin === "ice") {                    // ice crystals
            for (const [dx, h] of [[-9, 22], [0, 31], [9, 22]]) {
                ctx.beginPath(); ctx.moveTo(dx - 7, 0); ctx.lineTo(dx, -h); ctx.lineTo(dx + 7, 0); ctx.closePath();
                outline(ctx, "#a8ecff", "#2f86b8", 2.5);
                ctx.beginPath(); ctx.moveTo(dx - 2, -3); ctx.lineTo(dx, -h + 6); ctx.strokeStyle = "#fff"; ctx.lineWidth = 2; ctx.stroke();
            }
        } else {                                        // jagged wet rocks
            ctx.beginPath(); ctx.moveTo(-16, 0); ctx.lineTo(-10, -22); ctx.lineTo(-4, -10); ctx.lineTo(2, -31); ctx.lineTo(9, -12); ctx.lineTo(16, -20); ctx.lineTo(17, 0); ctx.closePath();
            outline(ctx, "#8f9aa6", "#3d4650", 2.5);
            ctx.strokeStyle = "rgba(255,255,255,0.4)"; ctx.lineWidth = 2;
            ctx.beginPath(); ctx.moveTo(2, -28); ctx.lineTo(-1, -12); ctx.stroke();
        }
        ctx.restore();
    }

    function flyer(ctx, x, y, t, skin) {
        const fl = Math.sin(t * 28);
        ctx.save(); ctx.translate(x, y);
        if (skin === "bee") {
            ctx.fillStyle = "rgba(230,250,255,0.85)"; ctx.strokeStyle = "#7aa8b8"; ctx.lineWidth = 1.5;
            ellipse(ctx, -3, -11, 7, 10 * (0.5 + 0.5 * Math.abs(fl)), -0.4); ctx.fill(); ctx.stroke();
            ellipse(ctx, 5, -11, 7, 10 * (0.5 + 0.5 * Math.abs(fl)), 0.4); ctx.fill(); ctx.stroke();
            ellipse(ctx, 0, 0, 15, 11); outline(ctx, "#ffd22a", "#3a2a08", 2.5);
            ctx.fillStyle = "#3a2a08"; ctx.fillRect(-5, -10, 4, 20); ctx.fillRect(3, -9, 4, 18);
            ctx.beginPath(); ctx.moveTo(-15, 0); ctx.lineTo(-22, 0); ctx.lineTo(-15, 3); ctx.closePath(); ctx.fill();
            ellipse(ctx, 9, -3, 3.4, 3.8); ctx.fillStyle = "#fff"; ctx.fill();
            ellipse(ctx, 10, -3, 1.6, 1.8); ctx.fillStyle = "#111"; ctx.fill();
        } else {
            const body = skin === "icebird" ? ["#e8f6ff", "#4a8ac0"] : ["#3a3f4c", "#14161c"];
            ctx.save(); ctx.translate(-2, -2); ctx.rotate(fl * 0.55 - 0.3);
            ellipse(ctx, -6, -9, 7, 16, -0.3); outline(ctx, body[0], body[1], 2.5); ctx.restore();
            ellipse(ctx, 0, 0, 16, 10); outline(ctx, body[0], body[1], 2.5);
            ctx.beginPath(); ctx.arc(11, -4, 8, 0, TAU); outline(ctx, body[0], body[1], 2.5);
            ctx.beginPath(); ctx.moveTo(17, -6); ctx.lineTo(26, -3); ctx.lineTo(17, -1); ctx.closePath(); outline(ctx, "#ffb21f", "#a8620a", 1.5);
            ellipse(ctx, 12, -6, 2.8, 3); ctx.fillStyle = "#fff"; ctx.fill();
            ellipse(ctx, 12.8, -6, 1.4, 1.6); ctx.fillStyle = "#c00"; ctx.fill();
        }
        ctx.restore();
    }

    function roller(ctx, h) {
        ctx.save(); ctx.translate(h.x, h.y - h.r); ctx.rotate(-h.spin);
        const r = h.r;
        if (h.skin === "snowball") {
            ellipse(ctx, 0, 0, r, r); outline(ctx, "#f4faff", "#7fa6d6", 3);
            ctx.fillStyle = "#cfe3f8"; ellipse(ctx, -6, 5, 5, 4); ctx.fill(); ellipse(ctx, 7, -6, 4, 3); ctx.fill();
        } else if (h.skin === "log") {
            ellipse(ctx, 0, 0, r, r); outline(ctx, "#b87a3c", "#5a3516", 3);
            ellipse(ctx, 0, 0, r * 0.62, r * 0.62); ctx.lineWidth = 2; ctx.strokeStyle = "#7a4a1e"; ctx.stroke();
            ellipse(ctx, 0, 0, r * 0.28, r * 0.28); ctx.stroke();
        } else {
            ellipse(ctx, 0, 0, r, r); outline(ctx, "#a7a39b", "#4b4741", 3);
            ctx.strokeStyle = "#6b675f"; ctx.lineWidth = 2;
            ctx.beginPath(); ctx.moveTo(-8, -6); ctx.lineTo(0, 2); ctx.lineTo(7, -3); ctx.moveTo(2, 2); ctx.lineTo(4, 11); ctx.stroke();
        }
        ctx.restore();
    }

    function icicle(ctx, x, fy, state, t) {
        ctx.save(); ctx.translate(x, fy);
        const sh = state === "falling" ? 0 : Math.sin(t * 50) * 2;
        ctx.translate(sh, 0);
        ctx.beginPath(); ctx.moveTo(-9, -34); ctx.lineTo(0, 0); ctx.lineTo(9, -34); ctx.closePath();
        outline(ctx, "#a8ecff", "#2f86b8", 2.5);
        ctx.restore();
    }

    function puddle(ctx, h, t, reduce) {
        const cx = (h.x0 + h.x1) / 2, w = (h.x1 - h.x0) / 2;
        ellipse(ctx, cx, h.y + 1, w, 7); outline(ctx, "rgba(110,190,255,0.85)", "#2f78b8", 2);
        ellipse(ctx, cx - w * 0.25, h.y - 1, w * 0.45, 2.2); ctx.fillStyle = "rgba(255,255,255,0.5)"; ctx.fill();
        if (!reduce) {
            ctx.strokeStyle = "rgba(255,255,255,0.7)"; ctx.lineWidth = 1.5;
            for (let k = 0; k < 2; k++) {
                const ph = mod(t * 0.9 + k * 0.5, 1);
                ellipse(ctx, cx + (k ? 20 : -26), h.y + 1, 4 + ph * 14, 1.5 + ph * 3); ctx.globalAlpha = 1 - ph; ctx.stroke();
            }
            ctx.globalAlpha = 1;
        }
    }

    function gust(ctx, h, camX, t, reduce) {
        const x0 = h.x0 - camX, x1 = h.x1 - camX;
        ctx.fillStyle = h.dir === "up" ? "rgba(255,255,255,0.14)" : "rgba(40,60,90,0.16)";
        ctx.fillRect(x0, 90, x1 - x0, 300);
        ctx.strokeStyle = h.dir === "up" ? "rgba(255,255,255,0.8)" : "rgba(210,225,245,0.85)";
        ctx.lineWidth = 3; ctx.lineCap = "round";
        const n = Math.max(2, Math.floor((x1 - x0) / 38));
        for (let k = 0; k < n; k++) {
            const ph = reduce ? 0.4 : mod(t * 0.8 + k * 0.37, 1);
            const x = x0 + 18 + k * 38 + ((k * 13) % 7);
            if (h.dir === "up") {
                const y = 380 - ph * 280;
                ctx.globalAlpha = Math.sin(ph * Math.PI);
                ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y - 24); ctx.moveTo(x - 6, y - 16); ctx.lineTo(x, y - 24); ctx.lineTo(x + 6, y - 16); ctx.stroke();
            } else {
                const y = 140 + ((k * 53) % 200), dx = (1 - ph) * 40;
                ctx.globalAlpha = Math.sin(ph * Math.PI);
                ctx.beginPath(); ctx.moveTo(x + dx, y); ctx.lineTo(x + dx - 30, y); ctx.moveTo(x + dx - 22, y - 6); ctx.lineTo(x + dx - 30, y); ctx.lineTo(x + dx - 22, y + 6); ctx.stroke();
            }
        }
        ctx.globalAlpha = 1;
    }

    /* ============================ SCENERY ============================ */
    function signpost(ctx, x, y) {
        ctx.save(); ctx.translate(x, y);
        ctx.fillStyle = "#b8742e"; ctx.fillRect(-4, -52, 8, 52);
        ctx.strokeStyle = "#5a3516"; ctx.lineWidth = 2.5; ctx.strokeRect(-4, -52, 8, 52);
        ctx.beginPath(); ctx.moveTo(-26, -52); ctx.lineTo(18, -52); ctx.lineTo(30, -41); ctx.lineTo(18, -30); ctx.lineTo(-26, -30); ctx.closePath();
        outline(ctx, "#e8a559", "#5a3516", 3);
        ctx.restore();
    }
    function flag(ctx, x, y, reached, t) {
        ctx.save(); ctx.translate(x, y);
        ctx.strokeStyle = "#5a3516"; ctx.lineWidth = 4; ctx.lineCap = "round";
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -58); ctx.stroke();
        const wave = Math.sin(t * 5) * 3;
        ctx.beginPath(); ctx.moveTo(2, -58); ctx.quadraticCurveTo(16, -62 + wave, 30, -52); ctx.quadraticCurveTo(16, -46 - wave, 2, -42); ctx.closePath();
        outline(ctx, reached ? "#5ad65a" : "#ff6b6b", "#5a3516", 2.5);
        ctx.restore();
    }

    /* ============================ WEATHER + FINISHING ============================ */
    function weather(ctx, w, t, reduce) {
        if (reduce) return;
        if (w === 1) {                                   // snow, two depths
            for (let layer = 0; layer < 2; layer++) {
                ctx.fillStyle = layer ? "rgba(255,255,255,0.95)" : "rgba(255,255,255,0.55)";
                const cnt = layer ? 26 : 60;
                for (let k = 0; k < cnt; k++) {
                    const sp = layer ? 70 + hash(k + 3) * 70 : 28 + hash(k + 3) * 30;
                    const x = mod(hash(k + layer * 99) * VW + Math.sin(t * 0.9 + k) * (layer ? 26 : 12) - t * (layer ? 40 : 18), VW);
                    const y = mod(hash(k + 70 + layer * 99) * VH + t * sp, VH);
                    const r = layer ? 2.2 + hash(k + 9) * 2.4 : 1.2 + hash(k + 9) * 1.2;
                    ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
                }
            }
        } else if (w === 2) {                            // rain, two depths + ground mist
            for (let layer = 0; layer < 2; layer++) {
                ctx.strokeStyle = layer ? "rgba(215,232,255,0.7)" : "rgba(200,225,255,0.35)";
                ctx.lineWidth = layer ? 2 : 1.2;
                ctx.beginPath();
                const cnt = layer ? 50 : 80;
                for (let k = 0; k < cnt; k++) {
                    const sp = layer ? 760 : 520;
                    const x = mod(hash(k + layer * 90) * (VW + 100) - t * (layer ? 150 : 100), VW + 100) - 20;
                    const y = mod(hash(k + 90 + layer * 90) * VH + t * sp, VH + 40) - 20;
                    ctx.moveTo(x, y); ctx.lineTo(x - (layer ? 8 : 5), y + (layer ? 22 : 15));
                }
                ctx.stroke();
            }
            const mg = ctx.createLinearGradient(0, VH - 110, 0, VH);
            mg.addColorStop(0, "rgba(170,190,205,0)"); mg.addColorStop(1, "rgba(170,190,205,0.28)");
            ctx.fillStyle = mg; ctx.fillRect(0, VH - 110, VW, 110);
        } else {                                         // summer: dust motes in the light + petals
            for (let k = 0; k < 24; k++) {
                const x = mod(hash(k) * VW - t * 14 + Math.sin(t * 0.7 + k) * 14, VW), y = mod(hash(k + 40) * VH * 0.8 + Math.sin(t * 0.5 + k * 2) * 18, VH);
                ctx.fillStyle = `rgba(255,248,200,${0.25 + 0.35 * Math.abs(Math.sin(t * 1.3 + k))})`;
                ctx.beginPath(); ctx.arc(x, y, 1.4 + hash(k + 7) * 1.4, 0, TAU); ctx.fill();
            }
            for (let k = 0; k < 10; k++) {
                const x = mod(hash(k + 60) * VW - t * 30, VW), y = mod(hash(k + 20) * VH + t * 22 + Math.sin(t + k) * 20, VH);
                ctx.fillStyle = k % 2 ? "rgba(255,255,255,0.8)" : "rgba(255,150,120,0.75)";
                ellipse(ctx, x, y, 4, 2.2, t + k); ctx.fill();
            }
        }
    }

    /* Colour grade + soft vignette so the whole frame feels like one lit scene. */
    function finish(ctx, w) {
        ctx.fillStyle = PAL[w].tint; ctx.fillRect(0, 0, VW, VH);
        const v = ctx.createRadialGradient(VW / 2, VH / 2, VH * 0.5, VW / 2, VH / 2, VW * 0.72);
        v.addColorStop(0, "rgba(0,0,0,0)"); v.addColorStop(1, w === 1 ? "rgba(0,5,25,0.4)" : "rgba(10,5,0,0.3)");
        ctx.fillStyle = v; ctx.fillRect(0, 0, VW, VH);
    }

    /* ============================ SCENES ============================ */
    function drawLevel(ctx, sim, camX, o) {
        const L = sim.level, w = L.world, t = sim.t, reduce = !!o.reduce, hiVis = !!o.hiVis;
        const inView = (x, pad) => x > camX - (pad || 80) && x < camX + VW + (pad || 80);
        background(ctx, w, camX, t, reduce);

        for (const h of sim.hazards) if (h.type === "gust" && h.x1 > camX && h.x0 < camX + VW) gust(ctx, h, camX, t, reduce);
        for (const p of L.platforms) if (p.x1 > camX - 80 && p.x0 < camX + VW + 80) platform(ctx, p, w, camX);

        /* scenery: start sign, checkpoint flags, Mama Hen and her nest */
        signpost(ctx, 250 - camX, RRC.surfaceY(L.platforms[0], 250));
        L.checkpoints.forEach((c, k) => {
            if (k === 0 || !inView(c.x)) return;
            const p = RRC.platformAt(L, c.x);
            if (p) flag(ctx, c.x - camX, RRC.surfaceY(p, c.x), sim.cpIndex >= k, t);
        });
        if (inView(L.nest.x, 140)) motherHen(ctx, L.nest.x - camX, L.nest.y, t, sim.status === "won");

        for (const h of sim.hazards) if (h.type === "puddle" && h.x1 > camX - 40 && h.x0 < camX + VW + 40) puddle(ctx, h, t, reduce);

        for (const c of sim.coins) if (!c.got && inView(c.x, 30)) coin(ctx, c.x - camX, c.y, t, c.x * 0.013);
        for (const c of sim.gems) if (!c.got && inView(c.x, 40)) gem(ctx, c.x - camX, c.y, t);
        for (const c of sim.powerups) if (!c.got && inView(c.x, 40)) powerup(ctx, c.x - camX, c.y, c.type, t);

        for (const h of sim.hazards) {
            if (h.type === "spike" && inView(h.x, 50)) {
                if (hiVis) halo(ctx, h.x - camX, h.y - 14, 34);
                spike(ctx, h.x - camX, h.y, h.skin);
            } else if (h.type === "drop" && h.state !== "idle" && inView(h.x, 50)) {
                if (h.state === "falling") {          // a dark spot warns where it will land
                    ctx.fillStyle = "rgba(0,0,0,0.22)"; ellipse(ctx, h.x - camX, h.y + 2, 16, 4); ctx.fill();
                    icicle(ctx, h.x - camX, h.fy, "falling", t);
                } else {
                    if (hiVis) halo(ctx, h.x - camX, h.y - 14, 34);
                    spike(ctx, h.x - camX, h.y, "ice");
                }
            } else if (h.type === "roller" && h.active && !h.gone && inView(h.x, 60)) {
                if (hiVis) halo(ctx, h.x - camX, h.y - h.r, 44);
                roller(ctx, { x: h.x - camX, y: h.y, r: h.r, spin: h.spin, skin: h.skin });
            } else if (h.type === "flyer" && inView(h.x, 80)) {
                const f = sim.constructor.flyerPos(h, t);
                if (hiVis) halo(ctx, f.x - camX, f.y, 36);
                flyer(ctx, f.x - camX, f.y, t, h.skin);
            }
        }

        const flapT = t - sim.lastFlap;
        chicken(ctx, RRC.HERO_X, sim.y, {
            t, grounded: sim.grounded, gliding: sim.gliding, flapT, invuln: sim.invuln, power: sim.power,
            scale: 1.2,
        });
        weather(ctx, w, t, reduce);
        finish(ctx, w);
    }

    /* The animated scene behind the menus: the chosen season scrolling past a hopping chicken. */
    const DEMO_PLATFORM = { id: 0, x0: -1e7, x1: 1e7, flat: 330, style: "normal" };
    function drawDemo(ctx, w, t, reduce) {
        const camX = t * 150;
        background(ctx, w, camX, t, reduce);
        platform(ctx, DEMO_PLATFORM, w, camX);
        const hop = mod(t, 1.8), jumping = hop < 0.68;
        const hy = jumping ? 330 - (680 * hop - 1000 * hop * hop) : 330;
        chicken(ctx, 250, hy, { t, grounded: !jumping, gliding: false, scale: 1.7, power: {} });
        weather(ctx, w, t, reduce);
        finish(ctx, w);
    }

    return { drawLevel, drawDemo, weather, chicken, background, PAL };
})();
