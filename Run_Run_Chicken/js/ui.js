/* ==========================================================
   js/ui.js  -  the "conductor": screens, input, save data, game loop.

   WHY IT EXISTS
   data.js knows the levels, sim.js knows the rules, art.js knows
   how things look, audio.js knows how things sound. Nothing in
   those talks to the player or the page. This file wires them
   together:

     1. SAVE DATA   stars/score/best time per level + settings, kept
                    in localStorage so progress survives a refresh.
     2. SCREENS     menu -> seasons -> levels -> game, settings, and
                    the pause / result signs (plain HTML over the canvas).
     3. INPUT       tap/click/Space = jump (again = flap, hold = glide),
                    P / Esc = pause. Input is only recorded here and
                    handed to the sim as { press, held }.
     4. GAME LOOP   requestAnimationFrame -> fixed 1/120 s sim steps ->
                    read sim events (sounds, particles) -> draw -> update HUD.

   UNLOCK RULES (change in data.js / here):
     level n opens after level n-1 is completed;
     the next season opens after RRC.UNLOCK_SEASON_AT levels of the one before.
     Add ?unlock=1 to the URL to open everything (handy for testing).
   ========================================================== */
(() => {
    "use strict";
    const $ = (s) => document.querySelector(s);
    const stage = $("#stage"), canvas = $("#view"), ctx = canvas.getContext("2d");
    const UNLOCK_ALL = new URLSearchParams(location.search).get("unlock") === "1";
    const H = 1 / 120;                                   // fixed physics step

    /* ---------------------------------------------------------- 1. save data */
    const KEY = "run-run-chicken-save-v1";
    const defaults = () => ({
        levels: {},
        settings: { music: true, sfx: true, reduceMotion: false, hiVis: false, assist: false },
    });
    function loadSave() {
        try {
            const s = JSON.parse(localStorage.getItem(KEY));
            if (s && s.levels && s.settings) return { levels: s.levels, settings: Object.assign(defaults().settings, s.settings) };
        } catch (e) { /* private mode or corrupt data: start fresh */ }
        return defaults();
    }
    let save = loadSave();
    const persist = () => { try { localStorage.setItem(KEY, JSON.stringify(save)); } catch (e) { /* ignore */ } };

    const rec = (w, i) => save.levels[w + "-" + i];
    const isDone = (w, i) => { const r = rec(w, i); return !!r && r.stars >= 1; };
    const doneCount = (w) => { let n = 0; for (let i = 0; i < 9; i++) if (isDone(w, i)) n++; return n; };
    const starsIn = (w) => { let n = 0; for (let i = 0; i < 9; i++) { const r = rec(w, i); if (r) n += r.stars; } return n; };
    const worldUnlocked = (w) => UNLOCK_ALL || w === 0 || doneCount(w - 1) >= RRC.UNLOCK_SEASON_AT;
    const levelUnlocked = (w, i) => UNLOCK_ALL || (worldUnlocked(w) && (i === 0 || isDone(w, i - 1)));

    function applySettings() {
        Snd.setMusic(save.settings.music);
        Snd.setSfx(save.settings.sfx);
    }

    /* ---------------------------------------------------------- canvas sizing */
    let scale = 1;
    function fit() {
        const r = stage.getBoundingClientRect();
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        canvas.width = Math.max(2, Math.round(r.width * dpr));
        canvas.height = Math.max(2, Math.round(r.height * dpr));
        scale = canvas.width / RRC.VIEW_W;
        stage.style.setProperty("--u", r.width / 100 + "px");
    }
    if (window.ResizeObserver) new ResizeObserver(fit).observe(stage);
    window.addEventListener("resize", fit);
    fit();

    /* ---------------------------------------------------------- 2. screens */
    const SCREENS = ["menu", "seasons", "levels", "settings"];
    let mode = "menu";            // "menu" | "play" | "pause" | "result"
    let demoWorld = 0;            // which season the animated menu background shows
    let selWorld = 0;

    function show(name) {
        for (const s of SCREENS) $("#screen-" + s).classList.toggle("active", s === name);
        $("#hud").classList.toggle("gone", name !== "game");
        $("#overlay-pause").classList.remove("active");
        $("#overlay-result").classList.remove("active");
        if (name !== "game") { mode = "menu"; sim = null; Snd.duck(false); }
    }

    function renderSeasons() {
        const grid = $("#season-grid");
        grid.innerHTML = "";
        RRC.WORLDS.forEach((w, wi) => {
            const unlocked = worldUnlocked(wi);
            const b = document.createElement("button");
            b.className = "season-card" + (unlocked ? "" : " locked");
            b.dataset.act = "world";
            b.dataset.w = wi;
            b.innerHTML =
                `<div class="s-icon">${w.icon}</div><div class="s-name">${w.name}</div>` +
                `<div class="s-tag">${w.tagline}</div>` +
                `<div class="s-stat">⭐ ${starsIn(wi)}/27 &nbsp; ✔ ${doneCount(wi)}/9</div>` +
                (unlocked ? "" : `<div class="s-lock">🔒 Finish ${RRC.UNLOCK_SEASON_AT} ${RRC.WORLDS[wi - 1].name} levels</div>`);
            b.addEventListener("pointerenter", () => { demoWorld = wi; });
            grid.appendChild(b);
        });
    }

    function renderLevels() {
        const w = selWorld, world = RRC.WORLDS[w];
        $("#levels-title").textContent = `${world.icon} ${world.name}`;
        $("#levels-sub").textContent = `⭐ ${starsIn(w)}/27 stars  ·  ✔ ${doneCount(w)}/9 complete`;
        const wrap = $("#level-groups");
        wrap.innerHTML = "";
        RRC.DIFFS.forEach((d, g) => {
            const box = document.createElement("div");
            box.className = "group " + d.name.toLowerCase();
            box.innerHTML = `<h4>${d.name}</h4>`;
            const row = document.createElement("div");
            row.className = "group-row";
            for (let k = 0; k < 3; k++) {
                const i = g * 3 + k, r = rec(w, i), open = levelUnlocked(w, i);
                const b = document.createElement("button");
                b.className = "lvl" + (open ? "" : " locked") + (r ? " done" : "");
                b.dataset.act = "level"; b.dataset.w = w; b.dataset.i = i;
                const stars = r ? "★".repeat(r.stars) + "☆".repeat(3 - r.stars) : open ? "☆☆☆" : "🔒";
                b.innerHTML = `<span class="n">${i + 1}</span><span class="st">${stars}</span><span class="sc">${r ? r.score.toLocaleString() : ""}</span>`;
                row.appendChild(b);
            }
            box.appendChild(row);
            wrap.appendChild(box);
        });
    }

    function renderSettings() {
        document.querySelectorAll(".toggle").forEach((b) => {
            const on = !!save.settings[b.dataset.key];
            b.setAttribute("aria-pressed", on);
            b.querySelector("b").textContent = on ? "On" : "Off";
        });
    }

    /* ---------------------------------------------------------- 3. input */
    const input = { press: false, held: false };
    canvas.addEventListener("pointerdown", (e) => {
        if (mode !== "play") return;
        e.preventDefault();
        input.press = true; input.held = true;
    });
    const release = () => { input.held = false; };
    window.addEventListener("pointerup", release);
    window.addEventListener("pointercancel", release);
    window.addEventListener("blur", release);

    window.addEventListener("keydown", (e) => {
        if (["Space", "ArrowUp", "KeyW"].includes(e.code)) {
            if (mode === "play") { e.preventDefault(); if (!e.repeat) input.press = true; input.held = true; }
        } else if ((e.code === "KeyP" || e.code === "Escape") && !e.repeat) {
            if (mode === "play") pause(); else if (mode === "pause") resume();
        }
    });
    window.addEventListener("keyup", (e) => {
        if (["Space", "ArrowUp", "KeyW"].includes(e.code)) input.held = false;
    });
    /* Browsers only allow sound after a gesture: unlock on the first touch/key. */
    const unlockOnce = () => { Snd.unlock(); };
    document.addEventListener("pointerdown", unlockOnce, { once: true, capture: true });
    document.addEventListener("keydown", unlockOnce, { once: true, capture: true });
    document.addEventListener("visibilitychange", () => { if (document.hidden && mode === "play") pause(); });

    /* ---------------------------------------------------------- game state */
    let sim = null, curW = 0, curI = 0, readyT = 0, acc = 0, shake = 0, resultShown = false;
    let particles = [];

    function startLevel(w, i) {
        curW = w; curI = i;
        sim = new Sim(RRC.getLevel(w, i), { assist: save.settings.assist });
        particles = []; acc = 0; shake = 0; readyT = 1.4; resultShown = false;
        input.press = false; input.held = false;
        show("game");
        mode = "play";
        Snd.music(w);
        Snd.duck(false);
        if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
        lastHud = "";
    }
    function pause() {
        if (mode !== "play" || readyT > 0) return;
        mode = "pause";
        $("#overlay-pause").classList.add("active");
        Snd.duck(true);
    }
    function resume() {
        if (mode !== "pause") return;
        mode = "play";
        $("#overlay-pause").classList.remove("active");
        Snd.duck(false);
    }
    function nextTarget() {
        if (curI < 8) return [curW, curI + 1];
        if (curW < 2 && worldUnlocked(curW + 1)) return [curW + 1, 0];
        return null;
    }

    /* ---------------------------------------------------------- results */
    function showResult() {
        resultShown = true;
        mode = "result";
        Snd.duck(true);
        const r = sim.results();
        const reduce = save.settings.reduceMotion;
        let best = "";
        $("#hud").classList.add("gone");
        if (r.won) {
            const key = curW + "-" + curI, prev = save.levels[key];
            const newBest = !prev || r.score > prev.score;
            save.levels[key] = {
                stars: Math.max(prev ? prev.stars : 0, r.stars),
                score: Math.max(prev ? prev.score : 0, r.score),
                time: prev ? Math.min(prev.time, r.timeUsed) : r.timeUsed,
            };
            persist();
            best = newBest ? "★ New best! ★" : "Best: " + save.levels[key].score.toLocaleString();
            $("#res-title").textContent = `Level ${curI + 1} Complete`;
        } else {
            $("#res-title").textContent = sim.lostReason === "time" ? "Time's up!" : "Oh no!";
            best = "Mama Hen is waiting. Try again!";
        }
        const stars = $("#res-stars");
        stars.innerHTML = "";
        for (let k = 0; k < 3; k++) {
            const s = document.createElement("span");
            s.textContent = "★";
            if (r.won && k < r.stars) s.classList.add("on");
            stars.appendChild(s);
            setTimeout(() => s.classList.add("show"), reduce ? 0 : 350 + k * 350);
        }
        const mm = (sec) => Math.floor(sec / 60) + ":" + String(Math.floor(sec % 60)).padStart(2, "0");
        const rows = r.won
            ? [["Coins", `${r.coins}/${r.coinTotal}`], ["Gems", `${r.gems}/${r.gemTotal}`], ["Time", mm(r.timeUsed)],
               ["Time bonus", "+" + r.timeBonus], ["Life bonus", "+" + r.lifeBonus]]
            : [["Coins", `${r.coins}/${r.coinTotal}`], ["Progress", Math.round(sim.progress * 100) + "%"]];
        $("#res-lines").innerHTML = rows.map((x) => `<span>${x[0]}</span><span>${x[1]}</span>`).join("");
        $("#res-score").textContent = r.won ? r.score.toLocaleString() : "";
        $("#res-best").textContent = best;
        $("#res-next").hidden = !(r.won && nextTarget());
        $("#overlay-result").classList.add("active");
    }

    /* ---------------------------------------------------------- button actions */
    const ACTIONS = {
        play() { renderSeasons(); show("seasons"); },
        settings() { renderSettings(); show("settings"); },
        menu() { show("menu"); },
        seasons() { renderSeasons(); show("seasons"); },
        world(d) {
            const w = +d.w;
            if (!worldUnlocked(w)) return;
            selWorld = w; demoWorld = w;
            Snd.music(w);
            renderLevels(); show("levels");
        },
        level(d) {
            const w = +d.w, i = +d.i;
            if (!levelUnlocked(w, i)) return;
            startLevel(w, i);
        },
        pause, resume,
        restart() { startLevel(curW, curI); },
        levels() { selWorld = curW; demoWorld = curW; renderLevels(); show("levels"); },
        next() { const t = nextTarget(); if (t) startLevel(t[0], t[1]); },
        toggle(d) {
            save.settings[d.key] = !save.settings[d.key];
            applySettings(); persist(); renderSettings();
        },
        reset() {
            if (window.confirm("Erase all stars, scores and settings?")) {
                save = defaults(); persist(); applySettings(); renderSettings();
            }
        },
    };
    document.addEventListener("click", (e) => {
        const b = e.target.closest("[data-act]");
        if (!b || !ACTIONS[b.dataset.act]) return;
        Snd.unlock();
        Snd.play("click");
        ACTIONS[b.dataset.act](b.dataset);
    });

    /* ---------------------------------------------------------- particles */
    function burst(x, y, n, o) {
        if (save.settings.reduceMotion) return;
        for (let k = 0; k < n; k++) {
            particles.push({
                x, y, vx: (Math.random() - 0.5) * o.spread, vy: -Math.random() * o.up - 10,
                g: o.g, life: 0, max: o.life * (0.7 + Math.random() * 0.6),
                size: o.size * (0.7 + Math.random() * 0.6), kind: o.kind,
                color: Array.isArray(o.color) ? o.color[Math.floor(Math.random() * o.color.length)] : o.color,
                rot: Math.random() * 6,
            });
        }
    }
    const dust = (x, y, n) => burst(x, y, n, { spread: 120, up: 60, g: 220, life: 0.45, size: 5, kind: "dust", color: "rgba(255,255,255,0.8)" });
    const feathers = (x, y, n) => burst(x, y, n, { spread: 140, up: 90, g: 160, life: 0.8, size: 6, kind: "feather", color: ["#ffe36a", "#fff6c0", "#ffd02a"] });
    const sparkle = (x, y, n, c) => burst(x, y, n, { spread: 200, up: 100, g: 0, life: 0.5, size: 4, kind: "spark", color: c });
    const confetti = (x, y) => burst(x, y, 40, { spread: 420, up: 420, g: 600, life: 1.6, size: 6, kind: "conf", color: ["#ff5a5a", "#ffd93b", "#5ad65a", "#4cc3ff", "#ff7ad9"] });

    function updateParticles(dt) {
        for (const p of particles) { p.life += dt; p.vy += p.g * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.rot += dt * 6; }
        particles = particles.filter((p) => p.life < p.max);
    }
    function drawParticles(camX) {
        for (const p of particles) {
            const a = 1 - p.life / p.max;
            ctx.globalAlpha = Math.max(0, a);
            ctx.fillStyle = p.color;
            const x = p.x - camX;
            ctx.beginPath();
            if (p.kind === "dust") ctx.arc(x, p.y, p.size * (1 + p.life * 2), 0, Math.PI * 2);
            else if (p.kind === "feather") ctx.ellipse(x, p.y, p.size, p.size * 0.4, p.rot, 0, Math.PI * 2);
            else if (p.kind === "spark") ctx.arc(x, p.y, p.size * a + 1, 0, Math.PI * 2);
            else ctx.rect(x - p.size / 2, p.y - p.size / 2, p.size, p.size * 0.6);
            ctx.fill();
        }
        ctx.globalAlpha = 1;
    }

    /* Turn sim events into sound + particles (the sim itself never plays anything). */
    function handleEvents() {
        for (const e of sim.drainEvents()) {
            switch (e.type) {
                case "jump": Snd.play("jump"); dust(e.x, e.y, 5); break;
                case "flap": Snd.play("flap"); feathers(e.x, e.y - 15, 5); break;
                case "land": if (e.vy > 300) { Snd.play("land"); dust(e.x, e.y, 4); } break;
                case "coin": Snd.play("coin"); sparkle(e.x, e.y, 5, "#ffd23a"); break;
                case "gem": Snd.play("gem"); sparkle(e.x, e.y, 10, "#7ff0ff"); break;
                case "power": Snd.play("power"); sparkle(e.x, e.y, 12, "#ffffff"); break;
                case "hurt": Snd.play("hurt"); shake = 0.35; feathers(e.x, e.y - 15, 14); break;
                case "shieldbreak": Snd.play("shield"); shake = 0.15; sparkle(e.x, e.y - 18, 14, "#9eeaff"); break;
                case "thud": Snd.play("thud"); dust(e.x, e.y, 6); break;
                case "checkpoint": Snd.play("flag"); break;
                case "won": Snd.play("win"); confetti(sim.level.nest.x, sim.level.nest.y - 60); break;
                case "lost": Snd.play("lose"); break;
                default: break;
            }
        }
    }

    /* ---------------------------------------------------------- HUD */
    const el = {
        lives: $("#hud-lives"), time: $("#hud-time"), coins: $("#hud-coins"),
        gems: $("#hud-gems"), mark: $("#hud-mark"), powers: $("#hud-powers"),
    };
    let lastHud = "";
    const setText = (node, v) => { if (node.textContent !== v) node.textContent = v; };
    function updateHud() {
        const s = sim;
        setText(el.lives, String(s.lives));
        const secs = Math.ceil(s.timeLeft);
        setText(el.time, String(Math.floor(secs / 60)).padStart(2, "0") + ":" + String(secs % 60).padStart(2, "0"));
        el.time.classList.toggle("low", s.timeLeft < 10 && s.status === "play");
        setText(el.coins, String(s.coinCount));
        setText(el.gems, String(s.gemCount));
        el.mark.style.left = s.progress * 100 + "%";
        const p = s.power;
        const key = (p.shield > 0) + "|" + Math.ceil(Math.max(0, p.magnet)) + "|" + Math.ceil(Math.max(0, p.wings));
        if (key !== lastHud) {
            lastHud = key;
            el.powers.innerHTML =
                (p.shield > 0 ? `<span class="chip">🛡️ Shield</span>` : "") +
                (p.magnet > 0 ? `<span class="chip">🧲 ${Math.ceil(p.magnet)}</span>` : "") +
                (p.wings > 0 ? `<span class="chip">🪶 ${Math.ceil(p.wings)}</span>` : "");
        }
    }

    /* ---------------------------------------------------------- drawing */
    function render(now) {
        ctx.setTransform(scale, 0, 0, scale, 0, 0);
        const reduce = save.settings.reduceMotion;
        if (!sim) { Art.drawDemo(ctx, demoWorld, now / 1000, reduce); return; }
        const camX = sim.x - RRC.HERO_X;
        ctx.save();
        if (shake > 0 && !reduce) ctx.translate((Math.random() - 0.5) * shake * 20, (Math.random() - 0.5) * shake * 20);
        Art.drawLevel(ctx, sim, camX, { reduce, hiVis: save.settings.hiVis });
        drawParticles(camX);
        ctx.restore();
        if (readyT > 0) {                                   // "Get ready!" banner
            ctx.globalAlpha = Math.min(1, readyT * 2);
            ctx.textAlign = "center"; ctx.lineJoin = "round";
            ctx.font = "900 54px 'Trebuchet MS','Comic Sans MS',sans-serif";
            ctx.lineWidth = 9; ctx.strokeStyle = "#8a4a12"; ctx.fillStyle = "#ffd93b";
            const name = sim.level.name + " · " + sim.level.diff;
            ctx.strokeText(name, RRC.VIEW_W / 2, 175); ctx.fillText(name, RRC.VIEW_W / 2, 175);
            ctx.font = "900 28px 'Trebuchet MS','Comic Sans MS',sans-serif";
            ctx.lineWidth = 6;
            const sub = curI === 0 ? "Tap = jump · tap again = flap · hold = glide" : "Get ready!";
            ctx.strokeText(sub, RRC.VIEW_W / 2, 220); ctx.fillStyle = "#fff"; ctx.fillText(sub, RRC.VIEW_W / 2, 220);
            ctx.globalAlpha = 1;
        }
    }

    /* ---------------------------------------------------------- 4. the loop */
    let last = performance.now();
    function frame(now) {
        requestAnimationFrame(frame);
        const dt = Math.min(0.05, (now - last) / 1000);
        last = now;
        if (mode === "play" && sim) {
            if (readyT > 0) {
                readyT -= dt;
                input.press = false;
            } else {
                acc += dt;
                while (acc >= H) { sim.step(H, input); input.press = false; acc -= H; }
                handleEvents();
                updateHud();
                const wait = sim.status === "won" ? 1.8 : 1.2;
                if (sim.status !== "play" && !resultShown && sim.endT > wait) showResult();
            }
            updateParticles(dt);
            if (shake > 0) shake -= dt;
        }
        render(now);
    }

    applySettings();
    show("menu");
    requestAnimationFrame(frame);
})();
