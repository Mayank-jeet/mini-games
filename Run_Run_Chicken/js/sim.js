/* ==========================================================
   js/sim.js  -  the game rules engine ("the simulation").

   WHY IT EXISTS
   This class owns everything that HAPPENS in a level: running,
   jumping, flapping, gliding, gravity, landing on slopes, hazards,
   pickups, power-ups, lives, checkpoints, the countdown timer and
   the win/lose result. It never touches the canvas or the page.

   HOW THE REST OF THE GAME USES IT
     ui.js   calls  sim.step(dt, input)  every tick, reads the state
             (x, y, lives, timeLeft...) to draw, and drains sim.events
             to play sounds and spawn particles.
     art.js  only READS the sim to draw it.
   Because it is pure logic, a bot can play it in Node to prove every
   level is beatable.

   INPUT:  { press: true on the frame a tap/key begins, held: true while down }
     press -> jump (or flap in mid-air)      held -> glide while falling

   COORDINATES: world x grows to the right. y is the chicken's FEET,
   screen-down is positive. The camera simply follows x.
   ========================================================== */
class Sim {
    constructor(level, opts = {}) {
        this.level = level;
        this.maxLives = RRC.START_LIVES + (opts.assist ? 2 : 0);
        this.lives = this.maxLives;
        this.timeLimit = Math.round(level.timeLimit * (opts.assist ? 1.5 : 1));
        this.timeLeft = this.timeLimit;
        this.t = 0;                 // seconds of game time (drives animation too)
        this.endT = 0;              // seconds since the level was won/lost
        this.status = "play";       // "play" | "won" | "lost"
        this.lostReason = "";
        this.events = [];

        /* Mutable copies of the level's content (the level object stays pristine). */
        this.coins = level.coins.map((c) => ({ x: c.x, y: c.y, got: false }));
        this.gems = level.gems.map((c) => ({ x: c.x, y: c.y, got: false }));
        this.powerups = level.powerups.map((c) => ({ x: c.x, y: c.y, type: c.type, got: false }));
        this.hazards = level.hazards.map((h) => Object.assign({}, h));
        this.coinCount = 0;
        this.gemCount = 0;

        this.cpIndex = 0;                                   // furthest checkpoint reached
        this.power = { shield: 0, magnet: 0, wings: 0 };    // seconds left on each
        this.jumpBuf = 0;
        this.coyote = 0;
        this.flaps = 0;
        this.glide = 0;
        this.gliding = false;
        this.lastFlap = -9;
        this.invuln = 0;
        this.speed = level.speed;
        this.inGust = null;
        this.spawn(level.checkpoints[0].x);
        this.invuln = 0;
    }

    /* ---------- tiny helpers ---------- */
    emit(type, data) { this.events.push(Object.assign({ type, x: this.x, y: this.y }, data)); }
    drainEvents() { const e = this.events; this.events = []; return e; }
    platformAt(x) { return RRC.platformAt(this.level, x); }
    get progress() { return Math.max(0, Math.min(1, this.x / this.level.finishX)); }

    /* A flyer hovers in place and bobs; its position is a pure function of time. */
    static flyerPos(h, t) {
        return { x: h.x + 18 * Math.sin(t * 1.1 + h.ph), y: h.y + h.amp * Math.sin(t * h.freq + h.ph) };
    }

    /* Put the chicken standing on the ground at world x. */
    spawn(x) {
        const p = this.platformAt(x);
        this.x = x;
        this.y = p ? RRC.surfaceY(p, x) : 330;
        this.vy = 0;
        this.grounded = true;
        this.speed = this.level.speed;
        this.jumpBuf = 0;
        this.invuln = 2.2;
    }

    /* ---------- losing a life ---------- */
    hit(reason) {                       // a hazard touched us: shield absorbs it, else it hurts
        if (this.status !== "play" || this.invuln > 0) return;
        if (this.power.shield > 0) {
            this.power.shield = 0;
            this.invuln = 1.2;
            this.emit("shieldbreak");
            return;
        }
        this.die(reason);
    }

    die(reason) {
        if (this.status !== "play") return;
        this.lives--;
        this.emit("hurt", { reason });
        if (this.lives <= 0) {
            this.status = "lost";
            this.lostReason = "lives";
            this.endT = 0;
            this.emit("lost", { reason: "lives" });
            return;
        }
        /* Respawn at the last checkpoint reached and re-arm anything ahead of it. */
        const cp = this.level.checkpoints[this.cpIndex];
        this.spawn(cp.x);
        this.power.magnet = 0;
        this.power.wings = 0;
        for (const h of this.hazards) {
            if (h.type === "roller" && h.home > this.x) {
                h.x = h.home; h.active = false; h.gone = false; h.falling = false;
                h.y = RRC.surfaceY(this.platformAt(h.home), h.home);
            }
            if (h.type === "drop" && h.x > this.x) { h.state = "idle"; h.fy = h.y - 420; }
        }
    }

    /* ---------- one simulation tick ---------- */
    step(dt, input) {
        const P = RRC.PHYS, L = this.level;
        this.t += dt;
        if (input.press) this.jumpBuf = P.buffer; else this.jumpBuf = Math.max(0, this.jumpBuf - dt);

        if (this.status === "lost") { this.endT += dt; return; }
        const won = this.status === "won";
        if (won) {
            this.endT += dt;
        } else {
            this.timeLeft -= dt;
            if (this.timeLeft <= 0) {
                this.timeLeft = 0;
                this.status = "lost"; this.lostReason = "time"; this.endT = 0;
                this.emit("lost", { reason: "time" });
                return;
            }
        }
        if (this.invuln > 0) this.invuln -= dt;
        for (const k in this.power) if (this.power[k] > 0) this.power[k] -= dt;

        /* ----- horizontal speed: slow in puddles, slippery on ice, pushed by gusts ----- */
        const p0 = this.platformAt(this.x);
        const onIce = this.grounded && p0 && p0.style === "ice";
        let target = L.speed;
        if (this.grounded && onIce) target *= 1.15;
        this.inGust = null;
        let inPuddle = false;
        for (const h of this.hazards) {
            if (h.type === "puddle" && this.x >= h.x0 && this.x <= h.x1) inPuddle = true;
            else if (h.type === "gust" && this.x >= h.x0 && this.x <= h.x1) this.inGust = h.dir;
        }
        if (this.grounded && inPuddle) target *= 0.55;
        if (!this.grounded && this.inGust === "back") target *= 0.6;
        if (won) target = Math.max(0, Math.min(L.speed * 0.7, (L.nest.x - 6 - this.x) * 2.5));
        this.speed += (target - this.speed) * Math.min(1, (onIce ? 1.4 : 12) * dt);
        this.x += this.speed * dt;

        /* ----- jumping: first jump from the ground (with coyote time), then one flap ----- */
        if (!won) {
            if (this.grounded) this.coyote = P.coyote; else this.coyote -= dt;
            if (this.jumpBuf > 0 && (this.grounded || this.coyote > 0)) {
                this.vy = P.jumpV;
                this.grounded = false;
                this.coyote = 0;
                this.jumpBuf = 0;
                const wings = this.power.wings > 0;
                this.flaps = wings ? 3 : 1;
                this.glide = wings ? Infinity : P.glideTime;
                this.emit("jump");
            } else if (!this.grounded && this.jumpBuf > 0 && this.flaps > 0 && this.vy > -250) {
                this.vy = P.flapV;
                this.flaps--;
                this.jumpBuf = 0;
                this.lastFlap = this.t;
                this.emit("flap");
            }
        }

        /* ----- ground following / gravity / landing ----- */
        this.gliding = false;
        if (this.grounded) {
            const p = this.platformAt(this.x);
            if (!p) {
                this.grounded = false;                       // ran off the edge
            } else {
                const sy = RRC.surfaceY(p, this.x);
                if (sy - this.y > 16) this.grounded = false; // surface fell away faster than we can follow
                else this.y = sy;
            }
        }
        if (!this.grounded) {
            let g = P.gravity;
            const canGlide = !won && input.held && this.vy > 0 && this.glide > 0;
            if (canGlide) {
                g *= P.glideScale;
                this.gliding = true;
                if (this.glide !== Infinity) this.glide -= dt;
            }
            this.vy += g * dt;
            if (canGlide && this.vy > P.glideMaxFall) this.vy = P.glideMaxFall;
            if (this.inGust === "up") this.vy = Math.max(this.vy - 1100 * dt, -380);
            const prevY = this.y;
            this.y += this.vy * dt;
            if (this.vy >= 0) {
                const p = this.platformAt(this.x);
                if (p) {
                    const sy = RRC.surfaceY(p, this.x);
                    if (prevY <= sy + 10 && this.y >= sy) {
                        this.emit("land", { vy: this.vy });
                        this.y = sy;
                        this.vy = 0;
                        this.grounded = true;
                    }
                }
            }
        }

        if (won) return;

        if (this.y > RRC.VIEW_H + 90) { this.die("fall"); return; }

        /* ----- win ----- */
        if (this.x >= L.finishX) {
            this.status = "won";
            this.endT = 0;
            this.emit("won");
            return;
        }

        /* ----- checkpoints ----- */
        const next = L.checkpoints[this.cpIndex + 1];
        if (next && this.x >= next.x) { this.cpIndex++; this.emit("checkpoint"); }

        this.updateHazards(dt);
        if (this.status === "play") this.updatePickups(dt);
    }

    /* ---------- hazards ---------- */
    updateHazards(dt) {
        const cx = this.x, cy = this.y - 15, R = 12;      // the chicken's hit circle
        const circleHit = (x, y, r) => (cx - x) * (cx - x) + (cy - y) * (cy - y) < (R + r) * (R + r);
        for (const h of this.hazards) {
            if (this.status !== "play") return;
            switch (h.type) {
                case "spike":
                case "drop": {
                    if (h.type === "drop") {
                        if (h.state === "idle" && this.x > h.x - 520 && this.x < h.x) h.state = "falling";
                        if (h.state === "falling") {
                            h.fy += 900 * dt;
                            if (h.fy >= h.y) { h.fy = h.y; h.state = "landed"; this.events.push({ type: "thud", x: h.x, y: h.y }); }
                        }
                        if (h.state !== "landed") break;
                    }
                    if (Math.abs(h.x - cx) > 40) break;
                    /* circle vs the spike's rectangle: 30 wide, 30 tall */
                    const nx = Math.max(h.x - 15, Math.min(cx, h.x + 15));
                    const ny = Math.max(h.y - 30, Math.min(cy, h.y));
                    if ((cx - nx) * (cx - nx) + (cy - ny) * (cy - ny) < R * R) this.hit(h.type);
                    break;
                }
                case "flyer": {
                    if (Math.abs(h.x - cx) > 90) break;
                    const f = Sim.flyerPos(h, this.t);
                    if (circleHit(f.x, f.y, 15)) this.hit("flyer");
                    break;
                }
                case "roller": {
                    if (h.gone) break;
                    if (!h.active && this.x > h.home - 640 && this.x < h.home) h.active = true;
                    if (!h.active) break;
                    h.x -= 120 * dt;
                    h.spin += (this.speed + 120) * dt / h.r;
                    if (!h.falling) {
                        const rp = this.platformAt(h.x);
                        if (!rp) { h.falling = true; h.vy = 0; } else h.y = RRC.surfaceY(rp, h.x);
                    } else {
                        h.vy += 2000 * dt;
                        h.y += h.vy * dt;
                        if (h.y > RRC.VIEW_H + 80) { h.active = false; h.gone = true; }
                    }
                    if (!h.gone && Math.abs(h.x - cx) < 60 && circleHit(h.x, h.y - h.r, h.r)) this.hit("roller");
                    break;
                }
                default: break;
            }
        }
    }

    /* ---------- coins, gems, power-ups ---------- */
    updatePickups(dt) {
        const cx = this.x, cy = this.y - 15;
        const magnet = this.power.magnet > 0;
        const grab = (list, radius, onGet) => {
            for (const c of list) {
                if (c.got) continue;
                if (Math.abs(c.x - cx) > 220) continue;
                let dx = cx - c.x, dy = cy - c.y;
                let d = Math.hypot(dx, dy);
                if (magnet && onGet.magnetic && d < 200 && d > 1) {
                    const s = Math.min(d, 720 * dt) / d;
                    c.x += dx * s; c.y += dy * s;
                    dx = cx - c.x; dy = cy - c.y; d = Math.hypot(dx, dy);
                }
                if (d < radius) { c.got = true; onGet(c); }
            }
        };
        const getCoin = (c) => { this.coinCount++; this.events.push({ type: "coin", x: c.x, y: c.y }); };
        getCoin.magnetic = true;
        const getGem = (c) => { this.gemCount++; this.events.push({ type: "gem", x: c.x, y: c.y }); };
        getGem.magnetic = true;
        const getPower = (c) => {
            if (c.type === "shield") this.power.shield = 25;
            else if (c.type === "magnet") this.power.magnet = 9;
            else { this.power.wings = 8; this.flaps = Math.max(this.flaps, 3); this.glide = Infinity; }
            this.events.push({ type: "power", x: c.x, y: c.y, power: c.type });
        };
        getPower.magnetic = false;
        grab(this.coins, 26, getCoin);
        grab(this.gems, 30, getGem);
        grab(this.powerups, 32, getPower);
    }

    /* ---------- final numbers for the results sign ---------- */
    results() {
        const coinTotal = this.level.coins.length, gemTotal = this.level.gems.length;
        const timeBonus = Math.floor(this.timeLeft) * 20;
        const lifeBonus = this.lives * 500;
        const score = this.coinCount * 10 + this.gemCount * 100 + timeBonus + lifeBonus;
        const pct = coinTotal ? this.coinCount / coinTotal : 1;
        const lostLives = this.maxLives - this.lives;
        const stars = 1 + (pct >= 0.6 ? 1 : 0) + (pct >= 0.9 && lostLives <= 1 ? 1 : 0);
        return {
            won: this.status === "won", coins: this.coinCount, coinTotal,
            gems: this.gemCount, gemTotal, timeBonus, lifeBonus, score, stars,
            timeUsed: this.timeLimit - this.timeLeft, lives: this.lives,
        };
    }
}
