/* ==================== Ludo ====================
   Token progress p:  -1 = in yard
                      0..50  = main track (p=0 is the player's start square)
                      51..55 = own home column
                      56     = finished
   Main track = 52 squares (PATH). Home entry is the square before the start square. */

// ===== Board geometry (15x15 grid, [row, col]) =====
const LABEL = { red: "Red", green: "Green", yellow: "Yellow", blue: "Blue" };
const SEATS = {                       // seat order = clockwise turn order
    2: ["red", "yellow"],
    3: ["red", "green", "yellow"],
    4: ["red", "green", "yellow", "blue"],
};
const START = { red: 0, green: 13, yellow: 26, blue: 39 };   // index into PATH
const SAFE = new Set([0, 8, 13, 21, 26, 34, 39, 47]);        // starts + the ★ squares
const FACES = ["⚀", "⚁", "⚂", "⚃", "⚄", "⚅"];

const PATH = [];
const add = (r, c) => PATH.push([r, c]);
for (let c = 1; c <= 5; c++) add(6, c);       // 0-4   (red start = 0)
for (let r = 5; r >= 0; r--) add(r, 6);       // 5-10
add(0, 7);                                    // 11
for (let r = 0; r <= 5; r++) add(r, 8);       // 12-17 (green start = 13)
for (let c = 9; c <= 14; c++) add(6, c);      // 18-23
add(7, 14);                                   // 24
for (let c = 14; c >= 9; c--) add(8, c);      // 25-30 (yellow start = 26)
for (let r = 9; r <= 14; r++) add(r, 8);      // 31-36
add(14, 7);                                   // 37
for (let r = 14; r >= 9; r--) add(r, 6);      // 38-43 (blue start = 39)
for (let c = 5; c >= 0; c--) add(8, c);       // 44-49
add(7, 0);                                    // 50
add(6, 0);                                    // 51
console.assert(PATH.length === 52, "Ludo path must have 52 squares");

const HOME = {
    red: [1, 2, 3, 4, 5].map((c) => [7, c]),
    green: [1, 2, 3, 4, 5].map((r) => [r, 7]),
    yellow: [13, 12, 11, 10, 9].map((c) => [7, c]),
    blue: [13, 12, 11, 10, 9].map((r) => [r, 7]),
};
const FINISH = { red: [7, 6], green: [6, 7], yellow: [7, 8], blue: [8, 7] };
const YARD_ORIGIN = { red: [0, 0], green: [0, 9], yellow: [9, 9], blue: [9, 0] };
const YARD_SPOTS = [[1, 1], [1, 4], [4, 1], [4, 4]];

const trackIdx = (color, p) => (START[color] + p) % 52;

// ===== Elements =====
const $ = (id) => document.getElementById(id);
const setupEl = $("setup"), gameEl = $("game"), board = $("board");
const playersEl = $("players"), turnEl = $("turn"), msgEl = $("message");
const dice = $("dice"), rollBtn = $("roll");
let tokenLayer = null;
let tokenEls = {};

// ===== Board drawing =====
function buildBoard() {
    board.textContent = "";
    const trackAt = new Map(PATH.map(([r, c], idx) => [r * 15 + c, idx]));
    const homeAt = new Map();
    Object.keys(HOME).forEach((col) => HOME[col].forEach(([r, c]) => homeAt.set(r * 15 + c, col)));
    const startAt = new Map(Object.entries(START).map(([col, idx]) => [idx, col]));

    for (let r = 0; r < 15; r++) {
        for (let c = 0; c < 15; c++) {
            const d = document.createElement("div");
            d.className = "cell";
            const key = r * 15 + c;
            const yard = r < 6 && c < 6 ? "red" : r < 6 && c > 8 ? "green"
                : r > 8 && c > 8 ? "yellow" : r > 8 && c < 6 ? "blue" : null;
            if (yard) {
                d.classList.add("yard", yard);
                const [R, C] = YARD_ORIGIN[yard];
                if (YARD_SPOTS.some(([dr, dc]) => r - R === dr && c - C === dc)) d.classList.add("spot");
            } else if (r >= 6 && r <= 8 && c >= 6 && c <= 8) {
                d.classList.add("center");
            } else if (trackAt.has(key)) {
                const idx = trackAt.get(key);
                d.classList.add("track");
                if (startAt.has(idx)) d.classList.add("start", startAt.get(idx));
                if (SAFE.has(idx)) d.textContent = "★";
            } else if (homeAt.has(key)) {
                d.classList.add("home", homeAt.get(key));
            }
            board.appendChild(d);
        }
    }
    const art = document.createElement("div");
    art.id = "center-art";
    board.appendChild(art);
    tokenLayer = document.createElement("div");
    tokenLayer.id = "tokens";
    board.appendChild(tokenLayer);
}

// ===== Game state =====
let G = null;          // current game
let gameId = 0;        // bumped on every (re)start so stale async work can stop
const setup = { seats: 2, humans: 1, difficulty: "medium" };
const sleep = GameKit.sleep;

const who = (pl, pi) => (pl.cpu ? "Computer" : G.humans === 1 ? "You" : `Player ${pi + 1}`);
const say = (t) => { msgEl.textContent = t; };
const movable = (pl, roll) =>
    [0, 1, 2, 3].filter((i) => {
        const p = pl.tokens[i];
        return p === -1 ? roll === 6 : p + roll <= 56;
    });

function cellOf(pl, i) {
    const p = pl.tokens[i];
    if (p < 0) {
        const [R, C] = YARD_ORIGIN[pl.color];
        const [dr, dc] = YARD_SPOTS[i];
        return [R + dr, C + dc];
    }
    if (p <= 50) return PATH[trackIdx(pl.color, p)];
    if (p <= 55) return HOME[pl.color][p - 51];
    return FINISH[pl.color];
}

// Places every token element; tokens sharing a square are spread slightly.
function layout() {
    const groups = new Map();
    G.players.forEach((pl, pi) => pl.tokens.forEach((_, i) => {
        const [r, c] = cellOf(pl, i);
        const key = r + "," + c;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push({ pi, i, r, c });
    }));
    const OFF = [[-0.2, -0.2], [0.2, -0.2], [-0.2, 0.2], [0.2, 0.2]];
    groups.forEach((list) => list.forEach(({ pi, i, r, c }, k) => {
        const [dx, dy] = list.length > 1 ? OFF[k % 4] : [0, 0];
        const el = tokenEls[G.players[pi].color][i];
        el.style.left = ((c + 0.5 + dx) / 15) * 100 + "%";
        el.style.top = ((r + 0.5 + dy) / 15) * 100 + "%";
    }));
}

function renderPlayers() {
    playersEl.textContent = "";
    G.players.forEach((pl, pi) => {
        const li = document.createElement("li");
        if (pi === G.cur && G.phase !== "over") li.classList.add("active");
        const done = pl.tokens.filter((p) => p === 56).length;
        li.innerHTML = `<span class="dot ${pl.color}"></span><span>${LABEL[pl.color]}</span>` +
            `<span class="who">${who(pl, pi)}</span><span class="pos">🏁 ${done}/4</span>`;
        playersEl.appendChild(li);
    });
}

// ===== Turn engine =====
function startGame() {
    gameId++;
    const colors = SEATS[setup.seats];
    G = {
        players: colors.map((color, i) => ({ color, cpu: i >= setup.humans, tokens: [-1, -1, -1, -1] })),
        cur: 0, phase: "roll", sixes: 0, pending: null,
        humans: setup.humans, difficulty: setup.difficulty,
    };
    tokenLayer.textContent = "";
    tokenEls = {};
    G.players.forEach((pl, pi) => {
        tokenEls[pl.color] = [0, 1, 2, 3].map((i) => {
            const b = document.createElement("button");
            b.className = `token ${pl.color}`;
            b.setAttribute("aria-label", `${LABEL[pl.color]} token ${i + 1}`);
            b.addEventListener("click", () => onTokenClick(pi, i));
            tokenLayer.appendChild(b);
            return b;
        });
    });
    dice.classList.remove("rolling");
    dice.textContent = FACES[0];
    setupEl.classList.add("gone");
    gameEl.classList.remove("gone");
    layout();
    beginTurn();
}

function beginTurn() {
    const pl = G.players[G.cur];
    G.phase = "roll";
    renderPlayers();
    turnEl.textContent = `${LABEL[pl.color]}'s turn · ${who(pl, G.cur)}`;
    if (pl.cpu) {
        rollBtn.disabled = true;
        say(`${LABEL[pl.color]} (computer) is thinking…`);
        const id = gameId;
        sleep(700).then(() => { if (id === gameId) doRoll(); });
    } else {
        rollBtn.disabled = false;
        say("Roll the dice.");
    }
}

function nextTurn() {
    G.cur = (G.cur + 1) % G.players.length;
    G.sixes = 0;
    beginTurn();
}

async function rollDice(id) {
    dice.classList.add("rolling");
    for (let k = 0; k < 7; k++) {
        dice.textContent = FACES[GameKit.rand(6)];
        await sleep(70);
        if (id !== gameId) return 0;
    }
    dice.classList.remove("rolling");
    const v = 1 + GameKit.rand(6);
    dice.textContent = FACES[v - 1];
    return v;
}

async function doRoll() {
    const id = gameId;
    const pl = G.players[G.cur];
    const name = LABEL[pl.color];
    G.phase = "busy";
    rollBtn.disabled = true;

    const roll = await rollDice(id);
    if (id !== gameId) return;
    G.sixes = roll === 6 ? G.sixes + 1 : 0;
    if (G.sixes === 3) {
        say(`${name} rolled three 6s in a row: turn lost.`);
        await sleep(1200);
        if (id !== gameId) return;
        return nextTurn();
    }

    const opts = movable(pl, roll);
    if (!opts.length) {
        say(`${name} rolled ${roll}: no move possible.`);
        await sleep(1000);
        if (id !== gameId) return;
        return roll === 6 ? beginTurn() : nextTurn();
    }

    let pick;
    if (pl.cpu) {
        say(`${name} rolled ${roll}.`);
        await sleep(550);
        if (id !== gameId) return;
        pick = cpuChoose(pl, opts, roll);
    } else if (opts.length === 1) {
        say(`${name} rolled ${roll}.`);
        await sleep(300);
        if (id !== gameId) return;
        pick = opts[0];
    } else {
        G.phase = "pick";
        opts.forEach((i) => tokenEls[pl.color][i].classList.add("can-move"));
        say(`${name} rolled ${roll}. Pick a token to move.`);
        pick = await new Promise((resolve) => { G.pending = { opts, resolve }; });
        if (id !== gameId) return;
    }
    G.pending = null;
    G.phase = "busy";
    tokenEls[pl.color].forEach((el) => el.classList.remove("can-move"));

    const res = await moveToken(pl, pick, roll, id);
    if (id !== gameId) return;
    renderPlayers();
    if (pl.tokens.every((p) => p === 56)) return endGame(pl);

    if (res.captured) say(`${name} captured ${res.captured} token${res.captured > 1 ? "s" : ""}! Roll again.`);
    else if (res.finished) say(`${name} got a token home! Roll again.`);
    else if (roll === 6) say(`${name} rolled a 6: roll again.`);
    await sleep(res.captured || res.finished ? 900 : 350);
    if (id !== gameId) return;
    (roll === 6 || res.captured || res.finished) ? beginTurn() : nextTurn();
}

function onTokenClick(pi, i) {
    if (!G || G.phase !== "pick" || pi !== G.cur || !G.pending || !G.pending.opts.includes(i)) return;
    G.pending.resolve(i);
}

// Moves one token step by step, then resolves captures.
async function moveToken(pl, i, roll, id) {
    const t = pl.tokens;
    if (t[i] === -1) {
        t[i] = 0;
        layout();
        await sleep(250);
    } else {
        for (let s = 0; s < roll; s++) {
            t[i]++;
            layout();
            await sleep(180);
            if (id !== gameId) return { captured: 0, finished: false };
        }
    }
    let captured = 0;
    if (t[i] <= 50) {
        const idx = trackIdx(pl.color, t[i]);
        if (!SAFE.has(idx)) {
            G.players.forEach((o) => {
                if (o === pl) return;
                o.tokens.forEach((q, k) => {
                    if (q >= 0 && q <= 50 && trackIdx(o.color, q) === idx) { o.tokens[k] = -1; captured++; }
                });
            });
        }
    }
    layout();
    return { captured, finished: t[i] === 56 };
}

function endGame(pl) {
    G.phase = "over";
    rollBtn.disabled = true;
    renderPlayers();
    turnEl.textContent = `🏆 ${LABEL[pl.color]} wins!`;
    say(pl.cpu ? "The computer got all four tokens home." : "All four tokens are home. Well played!");
}

// ===== Computer player =====
// How many opponent tokens could hit `idx` with one roll (1-6) next turn.
function danger(pl, idx) {
    let n = 0;
    G.players.forEach((o) => {
        if (o === pl) return;
        o.tokens.forEach((q) => {
            if (q < 0 || q > 50) return;
            const d = (idx - trackIdx(o.color, q) + 52) % 52;
            if (d >= 1 && d <= 6 && q + d <= 50) n++;
        });
    });
    return n;
}

function scoreMove(pl, i, roll, hard) {
    const p = pl.tokens[i];
    const np = p === -1 ? 0 : p + roll;
    let s = np;                                   // prefer progress
    if (p === -1) s += 40;                        // bring tokens out
    if (np === 56) s += 100;                      // get home
    else if (np >= 51) s += 20;                   // reach the safe home column
    if (np <= 50) {
        const idx = trackIdx(pl.color, np);
        if (SAFE.has(idx)) s += 12;
        else {
            G.players.forEach((o) => {            // captures
                if (o === pl) return;
                o.tokens.forEach((q) => {
                    if (q >= 0 && q <= 50 && trackIdx(o.color, q) === idx) s += 60 + q / 2;
                });
            });
            if (hard) s -= danger(pl, idx) * 18;  // don't land where we can be hit
        }
    }
    if (hard && p >= 0 && p <= 50) {              // run away from a threatened square
        const here = trackIdx(pl.color, p);
        if (!SAFE.has(here)) s += danger(pl, here) * 14;
    }
    return s;
}

function cpuChoose(pl, opts, roll) {
    if (G.difficulty === "easy") return GameKit.pick(opts);
    const hard = G.difficulty === "hard";
    let best = -Infinity, bestI = opts[0];
    opts.forEach((i) => {
        const s = scoreMove(pl, i, roll, hard) + Math.random() * (hard ? 0.5 : 6);
        if (s > best) { best = s; bestI = i; }
    });
    return bestI;
}

// ===== Setup screen =====
const seatSeg = $("seat-seg"), humanSeg = $("human-seg");
const levelField = $("level-field"), summary = $("summary"), difficultySel = $("difficulty");

function segButtons(seg, values, onPick) {
    values.forEach((v) => {
        const b = document.createElement("button");
        b.className = "btn btn-sm";
        b.textContent = v;
        b.addEventListener("click", () => { onPick(v); syncSetup(); });
        seg.appendChild(b);
    });
}

function syncSetup() {
    setup.humans = Math.min(setup.humans, setup.seats);
    [...seatSeg.children].forEach((b) => b.classList.toggle("active", +b.textContent === setup.seats));
    [...humanSeg.children].forEach((b) => {
        const n = +b.textContent;
        b.classList.toggle("active", n === setup.humans);
        b.disabled = n > setup.seats;
    });
    const cpus = setup.seats - setup.humans;
    levelField.classList.toggle("gone", cpus === 0);
    summary.textContent = `${setup.humans} human${setup.humans > 1 ? "s" : ""}` +
        (cpus ? ` + ${cpus} computer${cpus > 1 ? "s" : ""}` : "");
}

segButtons(seatSeg, [2, 3, 4], (v) => { setup.seats = v; });
segButtons(humanSeg, [1, 2, 3, 4], (v) => { setup.humans = v; });
difficultySel.addEventListener("change", () => { setup.difficulty = difficultySel.value; });
$("start").addEventListener("click", startGame);
$("restart").addEventListener("click", startGame);
$("change").addEventListener("click", () => {
    gameId++;                                     // cancels any pending async turn
    gameEl.classList.add("gone");
    setupEl.classList.remove("gone");
});
rollBtn.addEventListener("click", () => {
    if (G && G.phase === "roll" && !G.players[G.cur].cpu) doRoll();
});

buildBoard();
syncSetup();
