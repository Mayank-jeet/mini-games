/* ==========================================================
   js/data.js  -  the "rules and content" layer of the game.

   WHY IT EXISTS
   Everything that is DATA (physics numbers, the three seasons,
   the difficulty tiers, and the 27 levels) lives here, with no
   drawing and no DOM. That keeps the game testable: sim.js can
   run a whole level in Node without a browser.

   WHAT IT GIVES THE REST OF THE GAME  (one global: RRC)
     RRC.PHYS               jump / gravity / glide tuning
     RRC.WORLDS             Summer, Winter, Monsoon (hazard skins + features)
     RRC.getLevel(w, i)     builds (and caches) level i of world w
     RRC.surfaceY(p, x)     height of a platform's top surface at world x
     RRC.platformAt(L, x)   which platform (if any) is under world x

   HOW LEVELS ARE MADE
   Levels are generated from a seeded random number generator, so
   "Summer 4" is identical on every device and every visit. The
   generator is physics-aware: every gap is measured as a fraction
   of the distance a plain jump covers at that level's speed, so a
   level can never ask for an impossible jump.

   Seasons / difficulty grouping (3 seasons x 9 levels, each season
   = Easy 1-3, Medium 4-6, Hard 7-9) come from the original game as
   remembered by the player: easy to change below if footage shows
   a different layout.
   ========================================================== */
const RRC = (() => {
    const VIEW_W = 800, VIEW_H = 450, STEP = 40;   // logical screen; platforms are sampled every STEP px

    /* Physics (pixels and seconds). A plain jump rises ~115px and stays up ~0.68s. */
    const PHYS = {
        gravity: 2000,
        jumpV: -680,          // launch speed of the first jump
        flapV: -520,          // launch speed of the mid-air flap
        glideScale: 0.22,     // gravity multiplier while holding to glide
        glideMaxFall: 120,    // fall-speed cap while gliding
        glideTime: 1.6,       // seconds of glide per jump
        coyote: 0.09,         // can still jump this long after running off an edge
        buffer: 0.12,         // a tap this early before landing still counts
    };
    const JUMP_AIR = (2 * -PHYS.jumpV) / PHYS.gravity;   // airtime of a plain jump on flat ground

    /* The three seasons. `spike/flyer/roller` pick the art skin; the flags enable season features. */
    const WORLDS = [
        { id: "summer",  name: "Summer",  icon: "☀️", tagline: "Golden hills and busy bees",
          spike: "thorn", flyer: "bee",     roller: "rock",     ice: false, drop: false, puddle: false, gust: false,
          powerups: ["shield", "magnet", "wings"] },
        { id: "winter",  name: "Winter",  icon: "❄️", tagline: "Snow, ice and slippery roofs",
          spike: "ice",   flyer: "icebird", roller: "snowball", ice: true,  drop: true,  puddle: false, gust: false,
          powerups: ["wings", "shield", "magnet"] },
        { id: "monsoon", name: "Monsoon", icon: "🌧️", tagline: "Puddles, gusts and storm crows",
          spike: "rock",  flyer: "crow",    roller: "log",      ice: false, drop: false, puddle: true,  gust: true,
          powerups: ["magnet", "shield", "wings"] },
    ];

    /* Difficulty tiers. gap = fraction of a plain jump; dy = max height change between platforms. */
    const DIFFS = [
        { name: "Easy",   gap: [0.34, 0.52], dy: 34, run: [480, 900], island: 0.08, islandLen: [260, 340], hazard: 0.45, maxPer: 1, spikeMax: 1, hill: 12 },
        { name: "Medium", gap: [0.50, 0.80], dy: 52, run: [420, 800], island: 0.22, islandLen: [200, 280], hazard: 0.60, maxPer: 1, spikeMax: 2, hill: 20 },
        { name: "Hard",   gap: [0.68, 1.00], dy: 66, run: [380, 760], island: 0.32, islandLen: [170, 240], hazard: 0.75, maxPer: 2, spikeMax: 3, hill: 24 },
    ];

    /* ---------- small helpers ---------- */
    const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
    const lerp = (a, b, t) => a + (b - a) * t;
    const snap = (v) => Math.round(v / STEP) * STEP;
    function mulberry32(a) {            // tiny seeded RNG: same seed -> same level forever
        return function () {
            a |= 0; a = (a + 0x6D2B79F5) | 0;
            let t = Math.imul(a ^ (a >>> 15), 1 | a);
            t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    }

    /* Height of platform p's top surface at world x (linear between sample points). */
    function surfaceY(p, x) {
        const f = (x - p.x0) / STEP;
        let i = Math.floor(f);
        const n = p.ys.length - 1;
        if (i < 0) i = 0;
        if (i >= n) return p.ys[n];
        return p.ys[i] + (p.ys[i + 1] - p.ys[i]) * (f - i);
    }

    /* Binary search: the platform whose [x0, x1] contains x, or null (= a gap). */
    function platformAt(level, x) {
        const ps = level.platforms;
        let lo = 0, hi = ps.length - 1, found = -1;
        while (lo <= hi) {
            const mid = (lo + hi) >> 1;
            if (ps[mid].x0 <= x) { found = mid; lo = mid + 1; } else hi = mid - 1;
        }
        if (found < 0) return null;
        return x <= ps[found].x1 ? ps[found] : null;
    }

    /* ---------- the level generator ---------- */
    function generate(w, i) {
        const world = WORLDS[w], g = Math.floor(i / 3), j = i % 3, D = DIFFS[g];
        const rng = mulberry32(1000 + w * 977 + i * 131);
        const speed = 236 + g * 30 + j * 9;          // px/s: Easy 236-254, Medium 266-284, Hard 296-314
        const D1 = speed * JUMP_AIR;                 // how far a plain jump travels
        const length = 6400 + i * 620;

        const L = {
            id: `${world.id}-${i + 1}`, name: `${world.name} ${i + 1}`,
            world: w, index: i, group: g, diff: D.name, speed,
            platforms: [], coins: [], gems: [], powerups: [], hazards: [],
            checkpoints: [{ x: 100 }],
        };
        const surf = (p, x) => surfaceY(p, x);

        /* A platform is a polyline of heights sampled every STEP px. Edges are kept flat so
           takeoffs and landings are always readable. */
        const makePlatform = (x0, len, baseY, shape, style) => {
            const n = len / STEP, ys = [];
            const per = 6 + Math.floor(rng() * 4);
            const amp = shape === "hill" ? Math.min(D.hill, 2.4 * per) : 0;
            const drop = shape === "slope" ? (rng() < 0.5 ? -1 : 1) * (30 + rng() * 40) : 0;
            for (let k = 0; k <= n; k++) {
                const win = Math.min(1, Math.min(k, n - k) / 3);
                const sm = k / n, smooth = sm * sm * (3 - 2 * sm);
                ys.push(clamp(baseY + amp * Math.sin((k / per) * Math.PI * 2) * win + drop * smooth, 250, 390));
            }
            const p = { id: L.platforms.length, x0, x1: x0 + len, ys, style };
            L.platforms.push(p);
            return p;
        };
        const pickShape = () => {
            const r = rng();
            if (g === 0) return r < 0.5 ? "flat" : r < 0.8 ? "hill" : "slope";
            return r < 0.35 ? "flat" : r < 0.75 ? "hill" : "slope";
        };

        /* ----- hazards ----- */
        const marginIn = Math.max(160, speed * 0.55);    // quiet zone after landing
        const marginOut = Math.max(210, speed * 0.75);   // quiet zone before the next takeoff
        const kindsFor = () => {
            const k = [["spike", 5]];
            if (i >= 2) k.push(["flyer", 3]);
            if (i >= 1 && world.drop) k.push(["drop", 3]);
            if (i >= 1 && world.puddle) k.push(["puddle", 3]);
            return k;
        };
        const wpick = (list) => {
            let r = rng() * list.reduce((a, b) => a + b[1], 0);
            for (const [k, wt] of list) { if ((r -= wt) < 0) return k; }
            return list[0][0];
        };
        const blockedFor = new Map();     // platform id -> x ranges the coin row must skip
        const placeHazards = (p, extraIn) => {
            const blocked = [];
            blockedFor.set(p.id, blocked);
            let cursor = p.x0 + marginIn + extraIn, placed = 0;
            const hi = p.x1 - marginOut;
            while (placed < D.maxPer && cursor + 60 < hi) {
                if (rng() > (placed === 0 ? D.hazard + j * 0.05 : 0.5)) break;
                const kind = wpick(kindsFor());
                const hx = cursor + rng() * Math.max(0, hi - cursor - 100);
                let width = 40;
                if (kind === "spike") {
                    const n = 1 + Math.floor(rng() * D.spikeMax);
                    for (let k = 0; k < n; k++) {
                        const x = hx + k * 34;
                        L.hazards.push({ type: "spike", x, y: surf(p, x), skin: world.spike });
                    }
                    width = n * 34;
                    const cx = hx + width / 2 - 17, by = surf(p, cx);      // reward arc over the cluster
                    for (let k = -2; k <= 2; k++) {
                        L.coins.push({ x: cx + k * 34, y: by - 40 - (1 - (k / 2) * (k / 2)) * 50 });
                    }
                } else if (kind === "flyer") {
                    width = 60;
                    L.hazards.push({ type: "flyer", x: hx, y: surf(p, hx) - (30 + rng() * 12),
                        amp: 10 + rng() * 6, freq: 1.6 + rng() * 0.8, ph: rng() * 6.28, skin: world.flyer });
                } else if (kind === "drop") {
                    L.hazards.push({ type: "drop", x: hx, y: surf(p, hx), fy: surf(p, hx) - 420, state: "idle" });
                } else if (kind === "puddle") {
                    width = snap(120 + rng() * 80);
                    if (hx + width > p.x1 - 120) break;
                    L.hazards.push({ type: "puddle", x0: hx, x1: hx + width, y: surf(p, hx + width / 2), x: hx });
                }
                blocked.push([hx - 30, hx + width + 30]);
                cursor = hx + width + D1 * 1.3;
                placed++;
            }
            return placed;
        };

        /* ----- the walk from left to right ----- */
        const start = makePlatform(0, 840, 330, "flat", "normal");
        let prev = start;
        const endLen = 1240;
        const calm = [];                                  // hazard-free platforms (power-up spots)
        const cpTargets = [length / 3, (2 * length) / 3];

        while (prev.x1 < length - endLen - 600) {
            const island = rng() < D.island && length - prev.x1 > 2400;
            const count = island ? 2 + Math.floor(rng() * 2) + (g > 0 ? 1 : 0) : 1;
            for (let k = 0; k < count; k++) {
                const frac = lerp(D.gap[0], D.gap[1], rng()) * (island ? 0.9 : 1);
                const gap = snap(Math.max(80, D1 * frac));
                let dy = (rng() * 2 - 1) * D.dy;
                const maxRise = frac > 0.85 ? 10 : frac > 0.6 ? 28 : 46;    // wide gaps never climb much
                dy = Math.max(dy, -maxRise);
                const y = clamp(prev.ys[prev.ys.length - 1] + dy, 250, 390);

                const wantRoller = !island && i >= 3 && rng() < 0.18;
                let len = island ? snap(lerp(D.islandLen[0], D.islandLen[1], rng()))
                                 : snap(lerp(D.run[0], D.run[1], rng()));
                if (wantRoller) len = Math.max(len, 840);
                const style = world.ice && rng() < 0.3 + 0.1 * g ? "ice" : "normal";
                const p = makePlatform(prev.x1 + gap, len, y, island ? "flat" : pickShape(), style);

                /* coins along the jump arc across the gap */
                const xa = prev.x1 - 20, xb = p.x0 + 20, ya = prev.ys[prev.ys.length - 1], yb = p.ys[0];
                const nArc = Math.max(3, Math.floor(gap / 50));
                for (let c = 0; c < nArc; c++) {
                    const s = nArc === 1 ? 0.5 : c / (nArc - 1);
                    L.coins.push({ x: lerp(xa, xb, s), y: lerp(ya, yb, s) - 30 - 56 * 4 * s * (1 - s) });
                }
                /* monsoon gusts over the gap: an updraft floats you (landing comes later, so the
                   platform keeps hazards away a bit longer); a headwind only appears on short gaps */
                let extraIn = 0;
                if (world.gust && i >= 2 && rng() < 0.35) {
                    L.hazards.push({ type: "gust", dir: frac <= 0.5 && rng() < 0.5 ? "back" : "up",
                        x0: prev.x1 - 40, x1: p.x0 + 20 });
                    extraIn = 140;
                }

                let hazardCount = 0;
                if (wantRoller) {
                    const home = p.x1 - 90;
                    L.hazards.push({ type: "roller", home, x: home, y: surf(p, home), r: 20, skin: world.roller, spin: 0, active: false });
                    blockedFor.set(p.id, []);
                    hazardCount = 1;
                } else if (!island && len >= 380) {
                    hazardCount = placeHazards(p, extraIn);
                }
                if (hazardCount === 0 && !island) calm.push(p);

                /* coin row along the platform, skipping hazard zones, in short runs */
                const blocked = blockedFor.get(p.id) || [];
                let on = true, cnt = 0, lim = 3 + Math.floor(rng() * 5);
                for (let cx = p.x0 + 60; cx <= p.x1 - 60; cx += 36) {
                    if (blocked.some((b) => cx > b[0] && cx < b[1])) continue;
                    if (cnt++ >= lim) { on = !on; cnt = 0; lim = on ? 3 + Math.floor(rng() * 5) : 2 + Math.floor(rng() * 3); }
                    if (on) L.coins.push({ x: cx, y: surf(p, cx) - 34 });
                }
                /* a gem high above the middle of some long platforms */
                if (len >= 520 && rng() < 0.28) {
                    const gx = (p.x0 + p.x1) / 2;
                    L.gems.push({ x: gx, y: surf(p, gx) - 100 });
                }
                /* checkpoints: first long platform after 1/3 and 2/3 of the level */
                if (cpTargets.length && p.x0 >= cpTargets[0] && len >= 500 && !island) {
                    L.checkpoints.push({ x: p.x0 + 60 });
                    cpTargets.shift();
                }
                prev = p;
            }
        }

        /* ----- final platform with Mama Hen's nest ----- */
        const endGap = snap(D1 * 0.4);
        const fin = makePlatform(prev.x1 + endGap, endLen, clamp(prev.ys[prev.ys.length - 1], 300, 360), "flat", "normal");
        const nestX = fin.x1 - 360;
        L.nest = { x: nestX, y: surf(fin, nestX) };
        L.finishX = nestX - 40;
        L.length = fin.x1;
        for (let c = 0; c < 6; c++) L.coins.push({ x: fin.x0 + 100 + c * 36, y: surf(fin, fin.x0 + 100 + c * 36) - 34 });

        /* ----- power-ups on calm platforms, spread through the level ----- */
        const pcount = 2 + g;
        for (let k = 0; k < pcount && calm.length; k++) {
            const p = calm[Math.min(calm.length - 1, Math.floor(((k + 1) * calm.length) / (pcount + 1)))];
            const px = p.x0 + marginIn + 40;
            L.powerups.push({ x: px, y: surf(p, px) - 46, type: world.powerups[(k + i) % world.powerups.length] });
        }

        L.timeLimit = Math.ceil((L.finishX / speed) * 1.6 + 15);
        L.coinTotal = L.coins.length;
        return L;
    }

    const cache = {};
    function getLevel(w, i) {
        const key = w + "-" + i;
        return cache[key] || (cache[key] = generate(w, i));
    }

    return {
        VIEW_W, VIEW_H, STEP, HERO_X: 210, PHYS, JUMP_AIR, WORLDS, DIFFS,
        START_LIVES: 3, UNLOCK_SEASON_AT: 6, LEVELS_PER_WORLD: 9,
        surfaceY, platformAt, getLevel,
    };
})();
