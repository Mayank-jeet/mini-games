/* ==================== Run Run Chicken ====================
   Level-based side-scroller. The chicken runs forward over floating rock platforms; tap to jump,
   tap again in the air to flap (twice), hold to glide. Cross the gaps, grab coins and Pandora's Boxes
   (power-ups), avoid hazards, and reach Mama Hen at the end of the level.
   3 seasons x 9 levels (3 easy, 3 medium, 3 hard). Levels are generated from a fixed seed,
   so every attempt at a level is identical.
   Details taken from the player's memory / screenshots (seasons, difficulty grouping, underwater
   levels 7-9 in Monsoon) are easy to change in WORLDS / buildLevel below. */

const W = 960, H = 540, STEP = 1 / 60;
const GRAV = 1700, JUMP = 620, FLAP = 470, GLIDE_G = 0.35, GLIDE_MAX = 260, MAX_FLAPS = 2;
const CHICKEN_X = 230, R = 17, PER = 9;
const SEASON_UNLOCK = 6;                       // levels to finish in a season to open the next one

const WORLDS = [
    { id: "summer",  name: "Summer",  icon: "☀️" },
    { id: "winter",  name: "Winter",  icon: "❄️" },
    { id: "monsoon", name: "Monsoon", icon: "🌧️" },
];
const DIFF = ["Easy", "Medium", "Hard"];

// Hand-drawn style palettes (game art: not themed)
const PAL = {
    summer:  { sky: ["#ffd54a", "#ff9f43"], far: "#ffc93c", mid: "#f7b32b", sil: "rgba(120,70,20,.35)", top: "#9a5b2b", rock: "#f59e0b", rockD: "#c2610c", out: "#5b2a0a" },
    winter:  { sky: ["#0b1026", "#23407a"], far: "#2a3b66", mid: "#3a5088", sil: "rgba(10,16,40,.55)", top: "#f1f5f9", rock: "#8b95a7", rockD: "#5b6578", out: "#141b2e" },
    monsoon: { sky: ["#4b5d73", "#9fb1c2"], far: "#5f7f6a", mid: "#4b7a55", sil: "rgba(20,40,40,.35)", top: "#5a9a3a", rock: "#8a7a66", rockD: "#5e5142", out: "#2a2118" },
    under:   { sky: ["#38bdf8", "#0b4f9c"], far: "#1d6fb8", mid: "#1858a0", sil: "rgba(5,30,80,.45)",  top: "#f6d9a0", rock: "#c98f5a", rockD: "#9a6a3c", out: "#4a2c14" },
};
const palOf = (v) => PAL[v.under ? "under" : WORLDS[v.wi].id];

// Ground hazards: hit circles [dx, dy from ground, radius]
const HAZ = { thorn: [[0, -17, 20]], ice: [[0, -16, 16]], rock: [[0, -14, 18]], urchin: [[0, -16, 16]] };
const hazardOf = (wi, under) => (under ? "urchin" : ["thorn", "ice", "rock"][wi]);
const flyerOf = (wi, under) => (under ? "puffer" : ["bee", "bat", "crow"][wi]);

// ===== Helpers =====
const $ = (id) => document.getElementById(id);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const wrap = (v, m) => ((v % m) + m) % m;
const fmt = (t) => String(Math.floor(t / 60)).padStart(2, "0") + ":" + String(Math.floor(t % 60)).padStart(2, "0");
function mulberry32(a) {
    return function () {
        a |= 0; a = (a + 0x6D2B79F5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

const canvas = $("game");
let ctx = canvas.getContext("2d");               // `let`: level thumbnails temporarily draw to another canvas
const DPR = Math.min(window.devicePixelRatio || 1, 2);
canvas.width = W * DPR;
canvas.height = H * DPR;
const dot = (x, y, r) => { ctx.beginPath(); ctx.arc(x, y, r, 0, 6.3); ctx.fill(); };

// ===== Save data =====
const SAVE_KEY = "run-run-chicken-v2";
const defaults = () => ({
    lv: [0, 1, 2].map(() => Array(PER).fill(null)),            // per level: { stars, score, time }
    set: { sfx: true, music: true, reduce: false, assist: false, unlockAll: false },
});
let save = defaults();
try {
    const s = JSON.parse(localStorage.getItem(SAVE_KEY));
    if (s && s.lv && s.set) {
        save = {
            lv: defaults().lv.map((row, w) => row.map((_, k) => (s.lv[w] && s.lv[w][k]) || null)),
            set: { ...defaults().set, ...s.set },
        };
    }
} catch (e) { /* first visit or storage unavailable */ }
const writeSave = () => { try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (e) { /* ignore */ } };
const done = (w, k) => !!save.lv[w][k];
const completed = (w) => save.lv[w].filter(Boolean).length;
const seasonStars = (w) => save.lv[w].reduce((a, r) => a + (r ? r.stars : 0), 0);
const seasonOpen = (w) => save.set.unlockAll || w === 0 || completed(w - 1) >= SEASON_UNLOCK;
const levelOpen = (w, k) => seasonOpen(w) && (save.set.unlockAll || k === 0 || done(w, k - 1));

// ===== Sound + music (synthesized) =====
const Snd = {
    ctx: null, muted: false,
    init() {
        if (!this.ctx) { try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { /* no audio */ } }
        if (this.ctx && this.ctx.state === "suspended") this.ctx.resume();
    },
    beep(f, d, type = "square", v = 0.04, to = null, music = false) {
        if (!this.ctx || this.muted || (!music && !save.set.sfx)) return;
        const t = this.ctx.currentTime, o = this.ctx.createOscillator(), g = this.ctx.createGain();
        o.type = type;
        o.frequency.setValueAtTime(f, t);
        if (to) o.frequency.exponentialRampToValueAtTime(to, t + d);
        g.gain.setValueAtTime(v, t);
        g.gain.exponentialRampToValueAtTime(0.0001, t + d);
        o.connect(g).connect(this.ctx.destination);
        o.start(t); o.stop(t + d);
    },
    jump()  { this.beep(420, 0.14, "square", 0.03, 820); },
    flap()  { this.beep(560, 0.1, "square", 0.025, 900); },
    coin()  { this.beep(988, 0.07, "triangle", 0.05, 1480); },
    power() { this.beep(500, 0.3, "triangle", 0.05, 1500); },
    hit()   { this.beep(180, 0.3, "sawtooth", 0.06, 50); },
    win()   { [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => this.beep(f, 0.2, "triangle", 0.05), i * 140)); },
};
const Music = {
    timer: null, step: 0,
    start(w) {
        this.stop();
        if (Snd.muted || !save.set.music || !Snd.ctx) return;
        const scale = [[523, 587, 659, 784, 880], [392, 466, 523, 587, 698], [440, 494, 587, 659, 784]][w];
        const pat = [0, 2, 4, 2, 3, 1, 4, 2, 0, 3, 2, 4, 3, 1, 2, 0];
        this.timer = setInterval(() => {
            Snd.beep(scale[pat[this.step % pat.length]], 0.2, "triangle", 0.014, null, true);
            if (this.step % 4 === 0) Snd.beep(scale[0] / 2, 0.38, "sine", 0.02, null, true);
            this.step++;
        }, [230, 280, 250][w]);
    },
    stop() { clearInterval(this.timer); this.timer = null; },
};

// ===== Level generation =====
function buildLevel(wi, k) {
    const rnd = mulberry32(wi * 977 + k * 131 + 17), d = k / 8, under = wi === 2 && k >= 6;
    const L = {
        wi, k, under, speed: 235 + d * 70, len: 8000 + k * 800, gravScale: under ? 0.75 : 1,
        segs: [], coins: [], crates: [], hazards: [], flyers: [], winds: [],
    };
    const gapChance = 0.3 + 0.45 * d, gapMax = 150 + 170 * d, hz = 0.22 + 0.38 * d, fl = 0.05 + 0.25 * d;
    const cy = (v) => clamp(v, 300, 440);
    const gyOf = (s, xx) => s.y0 + (s.y1 - s.y0) * ((xx - s.x) / s.w);
    let x = 0, y = 400;
    const add = (w, y0, y1) => {                  // a floating rock platform (sloped top)
        const s = { x, w, y0, y1, jag: [], stones: [] };
        for (let i = 0; i <= Math.ceil(w / 36); i++) s.jag.push(52 + rnd() * 50);
        for (let i = 0; i < 3; i++) s.stones.push({ u: rnd(), v: 0.25 + rnd() * 0.5, r: 5 + rnd() * 8 });
        L.segs.push(s);
        x += w; y = y1;
        return s;
    };
    add(900, y, y);                               // a long, safe start
    while (x < L.len) {
        const prev = L.segs[L.segs.length - 1];
        let gap = 0;
        if (rnd() < gapChance) gap = 110 + rnd() * (gapMax - 110);
        const gx = x;
        x += gap;
        const w = 220 + rnd() * (300 - 110 * d);
        const y0 = gap ? cy(y + (rnd() - 0.5) * 110) : y;
        const s = add(w, y0, cy(y0 + (rnd() - 0.5) * 90));
        if (gap) {                                // a rainbow of coins across the gap
            const n = Math.ceil((gap + 100) / 38), base = (gyOf(prev, gx) + y0) / 2;
            for (let i = 0; i < n; i++) {
                L.coins.push({ x: gx - 50 + i * 38, y: base - 62 - Math.sin(Math.PI * i / (n - 1)) * 125, got: false });
            }
            if (wi === 2 && k >= 2 && rnd() < 0.35) L.winds.push({ x: gx - 60, w: gap + 120, f: rnd() < 0.6 ? -650 : 500 });
        }
        if (rnd() < 0.75) {                       // coins along the platform
            const n = Math.max(2, Math.floor((w - 100) / 42));
            for (let i = 0; i < n; i++) {
                const cx = s.x + 50 + i * 42;
                L.coins.push({ x: cx, y: gyOf(s, cx) - 42 - Math.sin(i * 0.7) * 14, got: false });
            }
        }
        if (L.segs.length > 3 && w >= 300 && rnd() < hz) {
            L.hazards.push({ type: hazardOf(wi, under), x: s.x + w * (0.45 + rnd() * 0.2) });
        }
        if (rnd() < fl) {
            const fx = s.x + w * 0.5;
            L.flyers.push({ type: flyerOf(wi, under), x: fx, y0: gyOf(s, fx) - 130 - rnd() * 70, amp: 25 + rnd() * 25, ph: rnd() * 6 });
        }
    }
    const fin = add(1300, y, y);                  // the finish platform with Mama Hen
    L.goalX = fin.x + 700;
    let nextCrate = 1700;
    L.segs.forEach((s) => {                       // Pandora's Boxes
        const mx = s.x + s.w / 2;
        if (mx >= nextCrate && mx < L.goalX - 1200) {
            L.crates.push({ x: mx, y: gyOf(s, mx) - 95, got: false });
            nextCrate += 2300 + rnd() * 1300;
        }
    });
    L.totalCoins = L.coins.length;
    L.par = (L.len / L.speed) * 1.25;
    L.groundAt = (xx) => {                        // null = a gap
        const S = L.segs;
        for (let i = 0; i < S.length; i++) {
            const s = S[i];
            if (xx < s.x) return null;
            if (xx <= s.x + s.w) return gyOf(s, xx);
        }
        return null;
    };
    return L;
}

// ===== Game state =====
let mode = "menu";                                // menu | seasons | levels | settings | play | pause | result
let G = null, demo = null;
let cur = { w: 0, k: 0 }, selSeason = 0;
let acc = 0, last = 0;

function startLevel(w, k) {
    cur = { w, k };
    const L = buildLevel(w, k), lives = save.set.assist ? 5 : 3;
    G = {
        L, wi: w, under: L.under, wx: 0, y: L.groundAt(0) - R, vy: 0, grounded: true, coyote: 0, buffer: 0,
        flaps: 0, holding: false, lives, maxLives: lives, lost: 0, coins: 0, time: 0, invuln: 0, shield: false,
        magnet: 0, rainbow: 0, wings: 0, particles: [], shake: 0, trail: 0, finishing: false, fin: 0, won: false, popup: null, hud: true,
    };
    acc = 0;
    setMode("play");
}

// ===== Update =====
function spawn(type, x, y, vx, vy, life, extra = {}) { G.particles.push({ type, x, y, vx, vy, life, max: life, ...extra }); }
function burst(x, y, n, color) {
    if (save.set.reduce) n = Math.ceil(n / 3);
    for (let i = 0; i < n; i++) {
        const a = Math.random() * 6.28, s = 60 + Math.random() * 160;
        spawn("spark", x, y, Math.cos(a) * s, Math.sin(a) * s - 40, 0.5 + Math.random() * 0.3, { color });
    }
}
const flyerPos = (f, t) => [f.x - 30 * t, f.y0 + Math.sin(t * 2 + f.ph) * f.amp];

function jump() {
    G.grounded = false;
    G.coyote = 0;
    G.vy = -JUMP;
    G.flaps = 0;
    G.buffer = 0;
    Snd.jump();
    for (let i = 0; i < 5; i++) spawn("dust", G.wx, G.y + R, (Math.random() - 0.5) * 80, -20 - Math.random() * 40, 0.35);
}

function hurt() {
    const g = G;
    if (g.invuln > 0 || g.finishing || g.rainbow > 0) return;
    if (g.shield) {
        g.shield = false;
        g.invuln = 1;
        burst(g.wx, g.y, 14, "#60a5fa");
        Snd.hit();
        return;
    }
    g.lives--;
    g.lost++;
    g.invuln = 1.6;
    g.shake = 0.3;
    burst(g.wx, g.y, 12, "#ef4444");
    Snd.hit();
    if (g.lives <= 0) endLevel(false);
}

function fall() {
    const g = G;
    g.lives--;
    g.lost++;
    g.shake = 0.3;
    Snd.hit();
    if (g.lives <= 0) return endLevel(false);
    let s = g.L.segs[0];                          // respawn on the platform before the gap
    for (const q of g.L.segs) { if (q.x + q.w <= g.wx) s = q; else break; }
    g.wx = Math.max(0, s.x + 40);
    g.y = g.L.groundAt(g.wx) - R;
    g.vy = 0;
    g.grounded = true;
    g.flaps = 0;
    g.invuln = 2;
}

function openCrate(c) {
    const g = G, opts = ["rainbow", "magnet", "shield", "wings", "coins"];
    if (g.lives < g.maxLives) opts.push("heart", "heart");
    const t = GameKit.pick(opts);
    const names = { rainbow: "Rainbow Dash!", magnet: "Coin Magnet!", shield: "Bubble Shield!", wings: "Super Wings!", coins: "Treasure!", heart: "Extra Life!" };
    if (t === "rainbow") g.rainbow = 5;
    else if (t === "magnet") g.magnet = 8;
    else if (t === "shield") g.shield = true;
    else if (t === "wings") g.wings = 8;
    else if (t === "coins") g.coins += 15;
    else g.lives++;
    g.popup = { t: 1.9, max: 1.9, sub: names[t] };
    Snd.power();
    burst(c.x, c.y, 18, "#fde047");
}

function update(dt) {
    const g = G, L = g.L;
    const speed = L.speed * (g.rainbow > 0 ? 1.22 : 1) * (save.set.assist ? 0.85 : 1);
    if (!g.finishing) g.time += dt;
    g.invuln = Math.max(0, g.invuln - dt);
    g.magnet = Math.max(0, g.magnet - dt);
    g.rainbow = Math.max(0, g.rainbow - dt);
    g.wings = Math.max(0, g.wings - dt);
    g.shake = Math.max(0, g.shake - dt);
    if (g.popup && (g.popup.t -= dt) <= 0) g.popup = null;

    for (const p of g.particles) {
        p.life -= dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        if (p.type === "spark" || p.type === "dust") p.vy += 500 * dt;
    }
    g.particles = g.particles.filter((p) => p.life > 0);

    if (g.finishing) {                            // walk over to Mama Hen
        g.fin += dt;
        g.wx = Math.min(g.wx + speed * 0.5 * dt, L.goalX - 80);
        g.y = L.groundAt(g.wx) - R;
        g.grounded = true;
        g.vy = 0;
        if (Math.random() < 0.15) spawn("heart", L.goalX - 40 + Math.random() * 80, g.y - 50, 0, -60, 1.2);
        if (g.fin > 1.8) endLevel(true);
        return;
    }
    g.wx += speed * dt;
    if (g.wx >= L.goalX - 80) { g.finishing = true; Snd.win(); return; }

    // tap = jump / flap (early taps are remembered for a moment)
    g.buffer = Math.max(0, g.buffer - dt);
    if (g.buffer > 0) {
        if (g.grounded || g.coyote > 0) jump();
        else if (g.flaps < MAX_FLAPS || g.wings > 0) {
            g.flaps++;
            g.vy = -FLAP;
            g.buffer = 0;
            Snd.flap();
            burst(g.wx, g.y + 10, 5, "#fde68a");
        }
    }

    const gy = L.groundAt(g.wx);
    if (g.grounded) {
        if (gy === null) { g.grounded = false; g.vy = 0; g.coyote = 0.1; }
        else { g.y = gy - R; g.vy = 0; g.coyote = 0.1; }
    } else {
        g.coyote = Math.max(0, g.coyote - dt);
        const glide = g.holding && g.vy > 0;
        let a = GRAV * L.gravScale * (glide ? GLIDE_G : 1);
        for (const w of L.winds) if (g.wx > w.x && g.wx < w.x + w.w) a += w.f;     // monsoon gusts
        g.vy += a * dt;
        if (glide) g.vy = Math.min(g.vy, GLIDE_MAX);
        g.vy = clamp(g.vy, -900, 1100);
        const prevBottom = g.y + R;
        g.y += g.vy * dt;
        const gy2 = L.groundAt(g.wx);
        if (gy2 !== null && g.vy >= 0 && g.y + R >= gy2 && prevBottom <= gy2 + 60) {   // lands (and grabs a ledge)
            g.y = gy2 - R;
            g.vy = 0;
            g.grounded = true;
            g.flaps = 0;
            for (let i = 0; i < 4; i++) spawn("dust", g.wx, gy2, (Math.random() - 0.5) * 100, -30, 0.3);
            if (g.buffer > 0) jump();
        }
        if (g.y < R + 6) { g.y = R + 6; g.vy = Math.max(g.vy, 0); }
        if (g.y > H + 60) return fall();
    }
    // sparkly trail while flying (rainbow rings during Rainbow Dash)
    g.trail -= dt;
    if (g.trail <= 0 && (!g.grounded || g.rainbow > 0)) {
        g.trail = save.set.reduce ? 0.12 : 0.05;
        if (g.rainbow > 0) spawn("ring", g.wx - 12, g.y, -40, 0, 0.6, { hue: (g.time * 400) % 360 });
        else spawn("star", g.wx - 10, g.y + 4, -30, 10, 0.7, { rot: Math.random() * 6, hue: Math.random() * 360 });
    }

    // coins, crates
    const near = (o, d) => Math.abs(o.x - g.wx) < d;
    for (const c of L.coins) {
        if (c.got || !near(c, 260)) continue;
        const dx = g.wx - c.x, dy = g.y - c.y;
        let dist = Math.hypot(dx, dy);
        if (g.magnet > 0 && dist < 230) {
            c.x += (dx / dist) * 650 * dt;
            c.y += (dy / dist) * 650 * dt;
            dist = Math.hypot(g.wx - c.x, g.y - c.y);
        }
        if (dist < R + 13) { c.got = true; g.coins++; Snd.coin(); burst(c.x, c.y, 4, "#fbbf24"); }
    }
    for (const c of L.crates) {
        if (!c.got && near(c, 60) && Math.hypot(g.wx - c.x, g.y - c.y) < R + 24) { c.got = true; openCrate(c); }
    }

    // hazards and flyers (Rainbow Dash makes you invincible)
    if (g.rainbow > 0) return;
    const hr = R - 2;
    for (const h of L.hazards) {
        if (!near(h, 80)) continue;
        const gyh = L.groundAt(h.x);
        if (gyh === null) continue;
        for (const [dx, dy, r] of HAZ[h.type]) {
            if (Math.hypot(g.wx - (h.x + dx), g.y - (gyh + dy)) < hr + r * 0.9) { hurt(); break; }
        }
    }
    for (const f of L.flyers) {
        const [fx, fy] = flyerPos(f, g.time);
        if (Math.abs(fx - g.wx) < 60 && Math.hypot(g.wx - fx, g.y - fy) < hr + 13) hurt();
    }
}

function endLevel(won) {
    const g = G;
    g.won = won;
    if (won) {
        const pct = g.coins / Math.max(1, g.L.totalCoins);
        let stars = 1;                                // 1: finish · 2: 60% of coins · 3: 85% of coins and at most 1 life lost
        if (pct >= 0.6) stars = 2;
        if (pct >= 0.85 && g.lost <= 1) stars = 3;
        const score = g.coins * 10 + g.lives * 100 + Math.max(0, Math.round((g.L.par - g.time) * 5));
        g.stars = stars;
        g.score = score;
        const old = save.lv[cur.w][cur.k];
        save.lv[cur.w][cur.k] = {
            stars: Math.max(stars, old ? old.stars : 0),
            score: Math.max(score, old ? old.score : 0),
            time: old ? Math.min(old.time, g.time) : g.time,
        };
        writeSave();
    }
    setMode("result");
}

// ===== Drawing: background =====
function ridge(off, color, base, amp, f, f2) {
    ctx.beginPath();
    ctx.moveTo(0, H);
    for (let x = 0; x <= W; x += 10) {
        const wx = x + off;
        ctx.lineTo(x, base - amp * (Math.sin(wx * f) + 0.5 * Math.sin(wx * f2 + 1.3)));
    }
    ctx.lineTo(W, H);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
}

function swirlCloud(x, y, s) {
    ctx.fillStyle = "#fffdf5";
    dot(x, y, 22 * s); dot(x + 26 * s, y - 10 * s, 28 * s); dot(x + 56 * s, y, 22 * s);
    ctx.strokeStyle = "#f3cf8c"; ctx.lineWidth = 2.5 * s;
    ctx.beginPath(); ctx.arc(x + 26 * s, y - 8 * s, 12 * s, 0.5, 4.8); ctx.stroke();
}

function drawBackground(v, cam) {
    const P = palOf(v), t = v.time || 0, id = v.under ? "under" : WORLDS[v.wi].id;
    const gr = ctx.createLinearGradient(0, 0, 0, H);
    gr.addColorStop(0, P.sky[0]);
    gr.addColorStop(1, P.sky[1]);
    ctx.fillStyle = gr;
    ctx.fillRect(0, 0, W, H);

    if (id === "summer") {
        ctx.fillStyle = "#fff1a8"; dot(790, 105, 46);
        ctx.strokeStyle = "rgba(255,255,255,.75)"; ctx.lineWidth = 3; ctx.setLineDash([3, 10]);
        ctx.beginPath(); ctx.arc(790, 105, 70, 0, 6.3); ctx.stroke(); ctx.setLineDash([]);
        for (let i = 0; i < 4; i++) swirlCloud(wrap(i * 380 - cam * 0.12 - t * 6, W + 400) - 150, 70 + ((i * 53) % 90), 0.9 + (i % 2) * 0.4);
    } else if (id === "winter") {
        for (let i = 0; i < 60; i++) {
            ctx.fillStyle = `rgba(255,255,255,${0.5 + 0.5 * Math.sin(t * 2 + i)})`;
            ctx.fillRect((i * 151.7) % W, (i * 73.3) % 300, 1 + (i % 3) * 0.7, 1 + (i % 3) * 0.7);
        }
        ctx.fillStyle = "#4a5a93"; dot(250, 130, 38);                      // the planet in the night sky
        ctx.strokeStyle = "#8fa3d8"; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.ellipse(250, 130, 62, 14, -0.4, 0, 6.3); ctx.stroke();
        ridge(cam * 0.25, "#1a2a55", 360, 90, 0.004, 0.009);
    } else if (id === "monsoon") {
        ctx.fillStyle = "#3d4a5c";
        for (let i = 0; i < 6; i++) {
            const x = wrap(i * 300 - cam * 0.1 - t * 8, W + 400) - 200, y = 70 + ((i * 37) % 70);
            dot(x, y, 40); dot(x + 50, y - 12, 50); dot(x + 100, y, 38);
        }
    } else {                                                               // underwater
        ctx.fillStyle = "rgba(255,255,255,.12)";
        for (let i = 0; i < 4; i++) {
            const x = 100 + i * 250 + Math.sin(t * 0.5 + i) * 20;
            ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x + 90, 0); ctx.lineTo(x + 40, H); ctx.lineTo(x - 80, H); ctx.fill();
        }
        const sx = wrap(600 - cam * 0.25, 2200) - 300;                     // sunken ship silhouette
        ctx.fillStyle = P.sil;
        ctx.beginPath(); ctx.moveTo(sx, 410); ctx.lineTo(sx + 260, 410); ctx.lineTo(sx + 220, 345); ctx.lineTo(sx + 40, 345); ctx.fill();
        ctx.fillRect(sx + 90, 270, 8, 80); ctx.fillRect(sx + 170, 285, 8, 65); ctx.fillRect(sx + 70, 290, 120, 6);
    }
    if (id !== "winter") ridge(cam * 0.2, P.far, 330, 60, 0.0045, 0.011);
    if (id === "summer") {                                                 // tree + bird silhouettes
        ctx.fillStyle = P.sil;
        for (let i = 0; i < 4; i++) {
            const x = wrap(i * 470 - cam * 0.3, 1900) - 200;
            ctx.fillRect(x - 4, 340, 8, 80); dot(x, 330, 34);
        }
        const bx = wrap(300 - cam * 0.18 - t * 25, W + 300) - 100;
        ctx.beginPath(); ctx.moveTo(bx, 190); ctx.lineTo(bx + 36, 170); ctx.lineTo(bx + 70, 192); ctx.lineTo(bx + 36, 200); ctx.fill();
    }
    ridge(cam * 0.45, P.mid, 400, 45, 0.007, 0.017);

    // ambient particles
    if (id === "winter") {
        ctx.fillStyle = "rgba(255,255,255,.85)";
        for (let i = 0; i < 70; i++) dot(wrap(i * 131.7 - cam * 0.5 + Math.sin(t + i) * 20, W), (i * 53.3 + t * 55) % H, 1.5 + (i % 3) * 0.6);
    } else if (id === "monsoon") {
        ctx.strokeStyle = "rgba(210,225,255,.5)"; ctx.lineWidth = 1.5;
        ctx.beginPath();
        for (let i = 0; i < 90; i++) {
            const x = wrap(i * 97.3 - cam * 0.7 - t * 180, W + 100), y = (i * 41.7 + t * 600) % H;
            ctx.moveTo(x, y); ctx.lineTo(x - 10, y + 22);
        }
        ctx.stroke();
    } else if (id === "under") {
        ctx.strokeStyle = "rgba(255,255,255,.55)"; ctx.lineWidth = 1.5;
        for (let i = 0; i < 28; i++) {
            ctx.beginPath();
            ctx.arc(wrap(i * 83.1 - cam * 0.4, W), H - ((i * 47 + t * 40) % H), 2 + (i % 4), 0, 6.3);
            ctx.stroke();
        }
    } else {
        ctx.fillStyle = "rgba(251,146,60,.8)";
        for (let i = 0; i < 18; i++) {
            ctx.beginPath();
            ctx.ellipse(wrap(i * 119 - cam * 0.5 - t * 20, W), (i * 67 + t * 25 + Math.sin(t + i) * 12) % H, 5, 3, t + i, 0, 6.3);
            ctx.fill();
        }
    }
}

// ===== Drawing: platforms, hazards, items =====
function drawPlatform(s, cam, P) {
    const x0 = s.x - cam, x1 = x0 + s.w;
    if (x1 < -20 || x0 > W + 20) return;
    const n = s.jag.length - 1;
    ctx.beginPath();
    ctx.moveTo(x0, s.y0);
    ctx.lineTo(x1, s.y1);
    ctx.lineTo(x1 - 12, s.y1 + 30);
    for (let i = n; i >= 0; i--) {                // jagged rocky underside
        const u = i / n;
        ctx.lineTo(x0 + s.w * u, s.y0 + (s.y1 - s.y0) * u + s.jag[i] * (i % 2 ? 1 : 0.62));
    }
    ctx.lineTo(x0 + 12, s.y0 + 30);
    ctx.closePath();
    ctx.fillStyle = P.rock; ctx.fill();
    ctx.lineJoin = "round"; ctx.strokeStyle = P.out; ctx.lineWidth = 4; ctx.stroke();
    ctx.fillStyle = P.rockD;
    for (const st of s.stones) dot(x0 + st.u * s.w, s.y0 + (s.y1 - s.y0) * st.u + 14 + st.v * 44, st.r);
    ctx.lineCap = "round";                        // grass / snow / mud / sand band on top
    ctx.beginPath(); ctx.moveTo(x0, s.y0 + 6); ctx.lineTo(x1, s.y1 + 6);
    ctx.strokeStyle = P.top; ctx.lineWidth = 16; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x0, s.y0 - 2); ctx.lineTo(x1, s.y1 - 2);
    ctx.strokeStyle = P.out; ctx.lineWidth = 3; ctx.stroke();
    ctx.lineCap = "butt";
    if (P === PAL.under) {                        // a little kelp on flooded levels
        ctx.strokeStyle = "#16a34a"; ctx.lineWidth = 4;
        for (const st of s.stones) {
            const kx = x0 + st.u * s.w, ky = s.y0 + (s.y1 - s.y0) * st.u;
            ctx.beginPath(); ctx.moveTo(kx, ky); ctx.quadraticCurveTo(kx + 8, ky - 14, kx, ky - 22 - st.r); ctx.stroke();
        }
    }
}

function drawHazards(v, cam) {
    const L = v.L;
    for (const h of L.hazards) {
        const sx = h.x - cam;
        if (sx < -60 || sx > W + 60) continue;
        const gy = L.groundAt(h.x);
        if (gy === null) continue;
        ctx.lineJoin = "round"; ctx.lineWidth = 3; ctx.strokeStyle = "#3b1d08";
        if (h.type === "thorn") {
            ctx.fillStyle = "#4d7c0f";
            [[-14, -12, 14], [0, -20, 17], [14, -12, 14]].forEach(([dx, dy, r]) => { ctx.beginPath(); ctx.arc(sx + dx, gy + dy, r, 0, 6.3); ctx.fill(); ctx.stroke(); });
            ctx.strokeStyle = "#fde68a"; ctx.lineWidth = 2;
            for (let a = 0; a < 7; a++) { ctx.beginPath(); ctx.moveTo(sx - 20 + a * 7, gy - 22 - (a % 2) * 6); ctx.lineTo(sx - 24 + a * 7, gy - 32 - (a % 2) * 6); ctx.stroke(); }
        } else if (h.type === "ice") {
            for (let i = -1; i <= 1; i++) {
                ctx.beginPath(); ctx.moveTo(sx + i * 17 - 10, gy); ctx.lineTo(sx + i * 17, gy - 40 + Math.abs(i) * 8); ctx.lineTo(sx + i * 17 + 10, gy);
                ctx.fillStyle = "#bae6fd"; ctx.fill(); ctx.strokeStyle = "#1e3a8a"; ctx.lineWidth = 3; ctx.stroke();
            }
        } else if (h.type === "rock") {
            ctx.beginPath(); ctx.moveTo(sx - 24, gy); ctx.lineTo(sx - 14, gy - 30); ctx.lineTo(sx - 2, gy - 18); ctx.lineTo(sx + 8, gy - 38); ctx.lineTo(sx + 24, gy);
            ctx.closePath(); ctx.fillStyle = "#6b7280"; ctx.fill(); ctx.stroke();
        } else {                                  // sea urchin
            ctx.strokeStyle = "#581c87"; ctx.lineWidth = 3;
            for (let a = 0; a < 12; a++) {
                const an = (a / 12) * 6.28;
                ctx.beginPath(); ctx.moveTo(sx + Math.cos(an) * 10, gy - 16 + Math.sin(an) * 10); ctx.lineTo(sx + Math.cos(an) * 22, gy - 16 + Math.sin(an) * 22); ctx.stroke();
            }
            ctx.fillStyle = "#7e22ce"; dot(sx, gy - 16, 12);
        }
    }
}

function drawFlyers(v, cam) {
    const t = v.time || 0;
    for (const f of v.L.flyers) {
        const [wx, y] = flyerPos(f, t), x = wx - cam;
        if (x < -50 || x > W + 50) continue;
        const wing = Math.sin(t * 10 + f.ph) * 14;
        ctx.lineJoin = "round"; ctx.lineWidth = 2.5; ctx.strokeStyle = "#1f1308";
        if (f.type === "bee") {
            ctx.fillStyle = "rgba(255,255,255,.85)";
            ctx.beginPath(); ctx.ellipse(x - 2, y - 12 - wing * 0.4, 9, 12, -0.4, 0, 6.3); ctx.fill(); ctx.stroke();
            ctx.fillStyle = "#facc15"; ctx.beginPath(); ctx.ellipse(x, y, 16, 11, 0, 0, 6.3); ctx.fill(); ctx.stroke();
            ctx.fillStyle = "#1f1308"; ctx.fillRect(x - 4, y - 10, 5, 20); ctx.fillRect(x + 5, y - 9, 4, 18);
            ctx.fillStyle = "#fff"; dot(x - 10, y - 2, 3);
        } else if (f.type === "puffer") {
            ctx.fillStyle = "#fb923c"; dot(x, y, 15); ctx.stroke();
            ctx.strokeStyle = "#7c2d12"; for (let a = 0; a < 8; a++) { const an = (a / 8) * 6.28; ctx.beginPath(); ctx.moveTo(x + Math.cos(an) * 15, y + Math.sin(an) * 15); ctx.lineTo(x + Math.cos(an) * 22, y + Math.sin(an) * 22); ctx.stroke(); }
            ctx.fillStyle = "#fff"; dot(x - 6, y - 3, 4); ctx.fillStyle = "#000"; dot(x - 7, y - 3, 2);
        } else {                                  // bat / crow
            ctx.fillStyle = f.type === "bat" ? "#4c1d95" : "#1f2937";
            ctx.beginPath(); ctx.moveTo(x - 4, y); ctx.lineTo(x - 30, y - 10 - wing); ctx.lineTo(x - 10, y + 4); ctx.fill(); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(x + 4, y); ctx.lineTo(x + 30, y - 10 - wing); ctx.lineTo(x + 10, y + 4); ctx.fill(); ctx.stroke();
            ctx.beginPath(); ctx.ellipse(x, y + 2, 14, 11, 0, 0, 6.3); ctx.fill(); ctx.stroke();
            ctx.fillStyle = f.type === "bat" ? "#f87171" : "#fbbf24"; dot(x - 6, y - 2, 3);
        }
    }
}

function drawWinds(v, cam) {
    const t = v.time || 0;
    for (const w of v.L.winds) {
        const sx = w.x - cam;
        if (sx + w.w < 0 || sx > W) continue;
        ctx.strokeStyle = w.f < 0 ? "rgba(255,255,255,.65)" : "rgba(30,41,59,.5)";
        ctx.lineWidth = 3; ctx.lineCap = "round";
        ctx.beginPath();
        for (let i = 0; i < 10; i++) {
            const lx = sx + 10 + i * (w.w / 10), ly = 150 + wrap(i * 83 + t * (w.f < 0 ? -170 : 170), 240), dy = w.f < 0 ? -26 : 26;
            ctx.moveTo(lx, ly); ctx.lineTo(lx, ly + dy);
        }
        ctx.stroke();
        ctx.lineCap = "butt";
    }
}

function drawCollectibles(v, cam) {
    const t = v.time || 0;
    for (const c of v.L.coins) {
        if (c.got) continue;
        const sx = c.x - cam;
        if (sx < -20 || sx > W + 20) continue;
        const w = Math.abs(Math.cos(t * 3 + c.x * 0.01)) * 8 + 3;
        ctx.fillStyle = "#fbbf24"; ctx.strokeStyle = "#92400e"; ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.ellipse(sx, c.y, w, 11, 0, 0, 6.3); ctx.fill(); ctx.stroke();
        ctx.fillStyle = "#fde68a"; ctx.beginPath(); ctx.ellipse(sx, c.y, w * 0.45, 6, 0, 0, 6.3); ctx.fill();
    }
    for (const c of v.L.crates) {                 // Pandora's Box
        if (c.got) continue;
        const sx = c.x - cam, y = c.y + Math.sin(t * 3 + c.x) * 5;
        if (sx < -60 || sx > W + 60) continue;
        const glow = ctx.createRadialGradient(sx, y, 4, sx, y, 52);
        glow.addColorStop(0, "rgba(255,248,200,.85)"); glow.addColorStop(1, "rgba(255,248,200,0)");
        ctx.fillStyle = glow; dot(sx, y, 52);
        ctx.fillStyle = "#e8bb82"; ctx.strokeStyle = "#7c4a12"; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.roundRect(sx - 20, y - 20, 40, 40, 5); ctx.fill(); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(sx - 20, y - 7); ctx.lineTo(sx + 20, y - 7); ctx.moveTo(sx - 20, y + 7); ctx.lineTo(sx + 20, y + 7); ctx.stroke();
        ctx.font = "900 26px sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.fillStyle = "#7c4a12"; ctx.fillText("?", sx, y + 1);
    }
}

function drawChicken(x, y, o) {
    const s = o.s || 1;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(o.ang || 0);
    ctx.scale(s, s);
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#7c4a12"; ctx.lineWidth = 2.5;
    ctx.fillStyle = o.tail || "#f59e0b";          // tail feathers
    ctx.beginPath(); ctx.moveTo(-18, -6); ctx.lineTo(-36, -16); ctx.lineTo(-30, -2); ctx.lineTo(-38, 6); ctx.lineTo(-18, 6); ctx.fill(); ctx.stroke();
    ctx.fillStyle = o.body || "#facc15";          // body
    ctx.beginPath(); ctx.arc(0, 0, 22, 0, 6.3); ctx.fill(); ctx.stroke();
    ctx.fillStyle = o.belly || "#fef08a";
    ctx.beginPath(); ctx.ellipse(2, 8, 15, 11, 0, 0, 6.3); ctx.fill();
    ctx.fillStyle = "#ef4444";                    // comb
    [[2, -23, 5], [9, -24, 6], [16, -20, 5]].forEach(([dx, dy, r]) => { ctx.beginPath(); ctx.arc(dx, dy, r, 0, 6.3); ctx.fill(); ctx.stroke(); });
    ctx.fillStyle = "#fb923c";                    // beak
    ctx.beginPath(); ctx.moveTo(19, -4); ctx.lineTo(32, 0); ctx.lineTo(19, 5); ctx.fill(); ctx.stroke();
    ctx.fillStyle = "rgba(251,113,133,.9)"; dot(10, 4, 4);
    ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(9, -7, 6.5, 0, 6.3); ctx.fill(); ctx.stroke();   // big cartoon eye
    ctx.fillStyle = "#111"; dot(11, -7, 3);
    ctx.save();                                   // wing
    ctx.translate(-4, 3);
    ctx.rotate(Math.sin(o.flap || 0) * 0.55 - 0.2);
    ctx.fillStyle = o.wing || "#fbbf24";
    ctx.beginPath(); ctx.ellipse(-4, 4, 13, 8, 0.4, 0, 6.3); ctx.fill(); ctx.stroke();
    ctx.restore();
    if (!o.air) {                                 // little running feet
        ctx.strokeStyle = "#fb923c"; ctx.lineWidth = 3; ctx.lineCap = "round";
        const f = Math.sin(o.flap || 0) * 5;
        ctx.beginPath(); ctx.moveTo(-4, 21); ctx.lineTo(-4 + f, 28); ctx.moveTo(6, 21); ctx.lineTo(6 - f, 28); ctx.stroke();
    }
    ctx.restore();
}

function drawGoal(v, cam) {
    const L = v.L, sx = L.goalX - cam, gy = L.groundAt(L.goalX);
    if (sx < -200 || sx > W + 200) return;
    ctx.fillStyle = "#92400e"; ctx.strokeStyle = "#451a03"; ctx.lineWidth = 3;     // nest
    ctx.beginPath(); ctx.ellipse(sx, gy - 4, 56, 16, 0, 0, 6.3); ctx.fill(); ctx.stroke();
    drawChicken(sx, gy - 46, { s: 1.5, body: "#fb923c", belly: "#fed7aa", wing: "#f97316", tail: "#c2410c", flap: (v.time || 0) * 3, air: true });
    for (let i = 0; i < 3; i++) drawChicken(sx - 70 + i * 24, gy - 18, { s: 0.45, flap: (v.time || 0) * 5 + i, air: true });
    ctx.fillStyle = "#fff"; ctx.fillRect(sx + 200, gy - 120, 4, 120);               // goal flag
    ctx.fillStyle = "#ef4444"; ctx.beginPath(); ctx.moveTo(sx + 204, gy - 120); ctx.lineTo(sx + 246, gy - 105); ctx.lineTo(sx + 204, gy - 90); ctx.fill();
}

function star(x, y, r, rot) {
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
        const a = rot + (i * Math.PI) / 5, rr = i % 2 ? r * 0.45 : r;
        ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    }
    ctx.closePath();
    ctx.fill();
}

function drawParticles(v, cam) {
    for (const p of v.particles || []) {
        const sx = p.x - cam, a = clamp(p.life / p.max, 0, 1);
        ctx.globalAlpha = a;
        if (p.type === "star") { ctx.fillStyle = `hsl(${p.hue},95%,62%)`; star(sx, p.y, 7 * a + 2, p.rot + p.life * 3); }
        else if (p.type === "ring") { ctx.strokeStyle = `hsl(${p.hue},95%,58%)`; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(sx, p.y, 6 + (1 - a) * 16, 0, 6.3); ctx.stroke(); }
        else if (p.type === "heart") { ctx.font = "22px sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText("❤️", sx, p.y); }
        else { ctx.fillStyle = p.color || "#e5e7eb"; dot(sx, p.y, p.type === "dust" ? 4 * a + 1 : 3.5); }
        ctx.globalAlpha = 1;
    }
}

function drawScene(v) {
    const cam = v.wx - CHICKEN_X, P = palOf(v);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    if (v.shake > 0 && !save.set.reduce) ctx.translate((Math.random() - 0.5) * 10, (Math.random() - 0.5) * 10);
    drawBackground(v, cam);
    drawWinds(v, cam);
    v.L.segs.forEach((s) => drawPlatform(s, cam, P));
    if (!v.demo) drawGoal(v, cam);
    drawHazards(v, cam);
    drawFlyers(v, cam);
    drawCollectibles(v, cam);

    const air = !v.grounded;
    const ang = air ? clamp(v.vy / 900, -0.5, 0.6) : Math.atan2(v.L.groundAt(v.wx + 4) - v.L.groundAt(v.wx - 4), 8) * 0.6 || 0;
    const blink = v.invuln > 0 && Math.floor(v.invuln * 10) % 2 === 0;
    if (!blink) drawChicken(CHICKEN_X, v.y, { ang, flap: (v.time || 0) * (air ? 16 : 14), air });
    if (v.shield) {
        ctx.strokeStyle = "rgba(96,165,250,.9)"; ctx.fillStyle = "rgba(96,165,250,.2)"; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(CHICKEN_X, v.y, 32, 0, 6.3); ctx.fill(); ctx.stroke();
    }
    drawParticles(v, cam);

    if (v.wi === 2 && !v.under && !save.set.reduce && v.time > 0) {        // monsoon lightning flash
        const ph = v.time % 9;
        if (ph < 0.15) { ctx.fillStyle = `rgba(255,255,255,${0.55 * (1 - ph / 0.15)})`; ctx.fillRect(0, 0, W, H); }
    }
    if (v.hud) drawHUD(v);
}

// ===== Drawing: HUD (chunky lettering like the original) =====
const PAUSE_RECT = { x: W - 84, y: 14, w: 62, h: 58 };

function chunk(s, x, y, size, align = "left", fill = "#fde047") {
    ctx.font = `900 ${size}px "Trebuchet MS","Comic Sans MS",sans-serif`;
    ctx.textAlign = align;
    ctx.textBaseline = "middle";
    ctx.lineJoin = "round";
    ctx.lineWidth = size * 0.26;
    ctx.strokeStyle = "#7c2d12";
    ctx.strokeText(s, x, y);
    ctx.fillStyle = fill;
    ctx.fillText(s, x, y);
}

function faceIcon(x, y, r) {
    ctx.lineJoin = "round"; ctx.strokeStyle = "#7c4a12"; ctx.lineWidth = 3;
    ctx.fillStyle = "#ef4444";
    [[-5, -1.05, .28], [0, -1.15, .3], [5, -1.05, .28]].forEach(([dx, dy, k]) => { ctx.beginPath(); ctx.arc(x + dx * r / 14, y + dy * r, r * k, 0, 6.3); ctx.fill(); });
    ctx.fillStyle = "#facc15"; ctx.beginPath(); ctx.arc(x, y, r, 0, 6.3); ctx.fill(); ctx.stroke();
    ctx.fillStyle = "#fff";
    [[-.4, -.15], [.4, -.15]].forEach(([dx, dy]) => { ctx.beginPath(); ctx.arc(x + dx * r, y + dy * r, r * .3, 0, 6.3); ctx.fill(); ctx.stroke(); });
    ctx.fillStyle = "#111";
    [[-.35, -.15], [.45, -.15]].forEach(([dx, dy]) => dot(x + dx * r, y + dy * r, r * .13));
    ctx.fillStyle = "#fb923c";
    ctx.beginPath(); ctx.moveTo(x - r * .15, y + r * .15); ctx.lineTo(x + r * .15, y + r * .15); ctx.lineTo(x, y + r * .4); ctx.fill();
}

function drawHUD(v) {
    faceIcon(46, 48, 28);
    chunk("×", 88, 52, 24);
    chunk(String(v.lives), 120, 48, 50);
    chunk(fmt(v.time), 22, 98, 30);
    const px0 = 250, px1 = 700, p = clamp(v.wx / v.L.goalX, 0, 1);      // progress bar
    ctx.lineCap = "round";
    ctx.strokeStyle = "#5b2a0a"; ctx.lineWidth = 10; ctx.beginPath(); ctx.moveTo(px0, 44); ctx.lineTo(px1, 44); ctx.stroke();
    ctx.strokeStyle = "#65a30d"; ctx.lineWidth = 6; ctx.beginPath(); ctx.moveTo(px0, 41); ctx.lineTo(px1, 41); ctx.stroke();
    ctx.lineCap = "butt";
    faceIcon(px0 + (px1 - px0) * p, 24, 13);
    ctx.fillStyle = "#fff"; ctx.fillRect(px1 + 2, 18, 3, 34);
    ctx.fillStyle = "#ef4444"; ctx.beginPath(); ctx.moveTo(px1 + 5, 18); ctx.lineTo(px1 + 24, 26); ctx.lineTo(px1 + 5, 34); ctx.fill();
    ctx.fillStyle = "#e9c58f"; ctx.strokeStyle = "#8a4b18"; ctx.lineWidth = 3;      // pause button (two planks)
    [PAUSE_RECT.x + 4, PAUSE_RECT.x + 34].forEach((x) => { ctx.beginPath(); ctx.roundRect(x, PAUSE_RECT.y + 4, 22, 50, 4); ctx.fill(); ctx.stroke(); });
    chunk(String(v.coins).padStart(3, "0"), W - 56, 98, 30, "right");               // coin counter
    ctx.fillStyle = "#fbbf24"; ctx.strokeStyle = "#92400e"; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(W - 36, 98, 13, 0, 6.3); ctx.fill(); ctx.stroke();

    let y = 140;                                  // active power-ups
    const pw = [[v.rainbow > 0, `🌈 ${Math.ceil(v.rainbow)}`], [v.magnet > 0, `🧲 ${Math.ceil(v.magnet)}`], [v.wings > 0, `🪽 ${Math.ceil(v.wings)}`], [v.shield, "🛡️"]];
    pw.forEach(([on, label]) => { if (on) { chunk(label, 22, y, 24, "left", "#fff"); y += 34; } });

    if (v.popup) {                                // "Pandora's Box" banner
        ctx.globalAlpha = clamp(v.popup.t / 0.4, 0, 1);
        chunk("PANDORA'S BOX", W / 2, H - 120, 56, "center");
        chunk(v.popup.sub, W / 2, H - 66, 36, "center", "#fff");
        ctx.globalAlpha = 1;
    }
    if (v.L.k === 0 && v.L.wi === 0 && v.time < 6 && mode === "play") {
        chunk("TAP to jump · tap again to flap · hold to glide", W / 2, 170, 26, "center", "#fff");
    }
}

// ===== Menu thumbnails =====
function drawThumb(cv, wi, k) {
    const prev = ctx, c = cv.getContext("2d");
    ctx = c;
    c.setTransform(cv.width / W, 0, 0, cv.height / H, 0, 0);
    const v = { wi, under: wi === 2 && k >= 6, time: 0 };
    drawBackground(v, 0);
    drawPlatform({ x: -60, w: W + 120, y0: 400, y1: 400, jag: Array(30).fill(70), stones: [{ u: 0.3, v: 0.4, r: 8 }, { u: 0.7, v: 0.5, r: 6 }] }, 0, palOf(v));
    ctx = prev;
}

// ===== Screens =====
const screens = { menu: $("menu"), seasons: $("seasons"), levels: $("levels"), settings: $("settings"), pause: $("pause"), result: $("result") };

function setMode(m) {
    mode = m;
    for (const k in screens) screens[k].classList.toggle("gone", k !== m);
    if (["menu", "seasons", "levels", "settings"].includes(m)) G = null;
    if (m === "seasons") buildSeasons();
    if (m === "levels") buildLevels(selSeason);
    if (m === "settings") buildSettings();
    if (m === "result") showResult();
    if (m === "play") Music.start(cur.w); else Music.stop();
    $("pausebtn").disabled = m !== "play";
}

function buildSeasons() {
    const row = $("season_row");
    row.textContent = "";
    WORLDS.forEach((wd, w) => {
        const open = seasonOpen(w), b = document.createElement("button");
        b.className = "wood season";
        b.disabled = !open;
        b.innerHTML = `<canvas width="300" height="170"></canvas><b>${wd.icon} ${wd.name}</b>` +
            `<small>${open ? `★ ${seasonStars(w)}/27 · ${completed(w)}/9 done` : `🔒 Finish ${SEASON_UNLOCK} ${WORLDS[w - 1].name} levels`}</small>`;
        row.appendChild(b);
        drawThumb(b.querySelector("canvas"), w, 0);
        b.addEventListener("click", () => { selSeason = w; setMode("levels"); });
    });
}

function buildLevels(w) {
    $("lvl_title").textContent = `${WORLDS[w].icon} ${WORLDS[w].name}`;
    const track = $("lvl_track");
    track.textContent = "";
    let focus = null;
    for (let k = 0; k < PER; k++) {
        const open = levelOpen(w, k), rec = save.lv[w][k], g = Math.floor(k / 3);
        const b = document.createElement("button");
        b.className = "wood lcard";
        b.disabled = !open;
        const stars = rec ? rec.stars : 0;
        b.innerHTML = `<div class="lhead chunky">LEVEL ${k + 1}</div><span class="diff d${g}">${DIFF[g]}</span>` +
            `<canvas class="lthumb" width="320" height="160"></canvas>` +
            `<div class="lfoot"><span class="lstars">${"★".repeat(stars)}<span class="off">${"★".repeat(3 - stars)}</span></span>` +
            `<span class="lscore">${String(rec ? rec.score : 0).padStart(5, "0").slice(-5).split("").map((d) => `<i>${d}</i>`).join("")}</span></div>` +
            (open ? "" : `<div class="lock">🔒</div>`);
        track.appendChild(b);
        drawThumb(b.querySelector("canvas"), w, k);
        b.addEventListener("click", () => { Snd.init(); startLevel(w, k); });
        if (open && !rec && !focus) focus = b;
        if (open && !focus && k === PER - 1) focus = b;
    }
    requestAnimationFrame(() => {                 // start at the first level you haven't beaten yet
        if (focus) track.scrollLeft = focus.offsetLeft - (track.clientWidth - focus.offsetWidth) / 2;
    });
}

const SETTINGS = [
    ["sfx", "Sound effects"],
    ["music", "Music"],
    ["reduce", "Reduce motion (no shake or flashes)"],
    ["assist", "Assist mode (5 lives, slower)"],
    ["unlockAll", "Unlock all levels"],
];
function buildSettings() {
    const box = $("settings_list");
    box.textContent = "";
    SETTINGS.forEach(([key, label]) => {
        const b = document.createElement("button");
        b.className = "wbtn toggle";
        b.innerHTML = `<span>${label}</span><b>${save.set[key] ? "ON" : "OFF"}</b>`;
        b.addEventListener("click", () => { save.set[key] = !save.set[key]; writeSave(); buildSettings(); });
        box.appendChild(b);
    });
    const r = document.createElement("button");
    r.className = "wbtn";
    r.textContent = "Reset progress";
    r.addEventListener("click", () => {
        if (confirm("Erase all stars, scores and unlocked levels?")) { save.lv = defaults().lv; writeSave(); buildSettings(); }
    });
    box.appendChild(r);
}

function showResult() {
    const g = G, won = g.won;
    $("res_title").textContent = won ? (cur.k === PER - 1 ? "Season complete!" : "Level complete!") : "Oh no! Out of lives";
    $("res_stars").textContent = won ? "★".repeat(g.stars) + "☆".repeat(3 - g.stars) : "💔";
    $("res_stats").innerHTML = won
        ? `Time: ${fmt(g.time)}<br>Coins: ${g.coins} / ${g.L.totalCoins}<br>Score: ${g.score}`
        : `Time: ${fmt(g.time)}<br>Coins: ${g.coins} / ${g.L.totalCoins}<br>Try again, you can do it!`;
    $("res_next").classList.toggle("gone", !(won && cur.k < PER - 1));
}

function togglePause() {
    if (mode === "play") setMode("pause");
    else if (mode === "pause") { acc = 0; setMode("play"); }
}

// ===== Input =====
function press() {
    if (mode !== "play" || !G) return;
    Snd.init();
    G.buffer = 0.12;
    G.holding = true;
}
function release() { if (G) G.holding = false; }

$("stage").addEventListener("pointerdown", (e) => {
    if (mode !== "play" || e.target.closest(".overlay")) return;
    e.preventDefault();
    const r = canvas.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * W, y = ((e.clientY - r.top) / r.height) * H;
    if (x >= PAUSE_RECT.x && x <= PAUSE_RECT.x + PAUSE_RECT.w && y >= PAUSE_RECT.y && y <= PAUSE_RECT.y + PAUSE_RECT.h) return togglePause();
    press();
});
window.addEventListener("pointerup", release);
window.addEventListener("pointercancel", release);
window.addEventListener("keydown", (e) => {
    if (["Space", "ArrowUp", "KeyW"].includes(e.code)) {
        if (mode === "play") e.preventDefault();
        if (!e.repeat) press();
    } else if (e.code === "KeyP" || e.code === "Escape") togglePause();
});
window.addEventListener("keyup", (e) => { if (["Space", "ArrowUp", "KeyW"].includes(e.code)) release(); });
document.addEventListener("visibilitychange", () => { if (document.hidden && mode === "play") setMode("pause"); });

$("play").addEventListener("click", () => { Snd.init(); setMode("seasons"); });
$("open_settings").addEventListener("click", () => setMode("settings"));
$("seasons_back").addEventListener("click", () => setMode("menu"));
$("levels_back").addEventListener("click", () => setMode("seasons"));
$("settings_back").addEventListener("click", () => setMode("menu"));
$("prev").addEventListener("click", () => $("lvl_track").scrollBy({ left: -$("lvl_track").clientWidth * 0.5, behavior: "smooth" }));
$("next").addEventListener("click", () => $("lvl_track").scrollBy({ left: $("lvl_track").clientWidth * 0.5, behavior: "smooth" }));
$("resume").addEventListener("click", togglePause);
$("pausebtn").addEventListener("click", togglePause);
$("pause_restart").addEventListener("click", () => startLevel(cur.w, cur.k));
$("pause_levels").addEventListener("click", () => { selSeason = cur.w; setMode("levels"); });
$("res_next").addEventListener("click", () => startLevel(cur.w, cur.k + 1));
$("res_again").addEventListener("click", () => startLevel(cur.w, cur.k));
$("res_levels").addEventListener("click", () => { selSeason = cur.w; setMode("levels"); });
$("mute").addEventListener("click", () => {
    Snd.muted = !Snd.muted;
    $("mute").textContent = Snd.muted ? "🔇 Sound off" : "🔊 Sound on";
    if (Snd.muted) Music.stop(); else if (mode === "play") Music.start(cur.w);
});

// ===== Main loop =====
function makeDemo() {                             // background scene for the menus: a chick running over a platform
    const wi = GameKit.rand(3);
    return {
        demo: true, wi, under: false, time: 0, wx: 300, y: 0, vy: 0, grounded: true, invuln: 0, shield: false,
        particles: [], shake: 0, hud: false,
        L: { wi, k: 0, segs: [{ x: 0, w: W + 120, y0: 420, y1: 420, jag: Array(30).fill(70), stones: [{ u: 0.2, v: 0.4, r: 8 }, { u: 0.6, v: 0.5, r: 6 }, { u: 0.85, v: 0.3, r: 9 }] }],
              hazards: [], flyers: [], coins: [], crates: [], winds: [], groundAt: () => 420, goalX: 1e9 },
    };
}

function frame(t) {
    requestAnimationFrame(frame);
    const dt = Math.min(0.05, (t - last) / 1000 || 0);
    last = t;
    let view = G;
    if (mode === "play") {
        acc += dt;
        while (acc >= STEP && mode === "play") { update(STEP); acc -= STEP; }
        view = G;
    } else if (!G) {
        if (!demo) demo = makeDemo();
        demo.time += dt;
        demo.wx += 190 * dt;
        demo.L.segs[0].x = demo.wx - CHICKEN_X - 60;
        const hop = Math.max(0, Math.sin(demo.time * 2.4));
        demo.y = 420 - R - hop * 70;
        demo.grounded = hop < 0.05;
        demo.vy = Math.cos(demo.time * 2.4) * -300;
        view = demo;
    }
    if (view) drawScene(view);
}

setMode("menu");
requestAnimationFrame(frame);
