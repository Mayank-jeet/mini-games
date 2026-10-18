/* ==================== Minesweeper ====================
   cells[i] = { mine, rev, flag, n, boom }   i = row * cols + col
   The first dig is always safe (mines are placed after it, away from it). */

const LEVELS = {
    beginner:     { rows: 9,  cols: 9,  mines: 10 },
    intermediate: { rows: 16, cols: 16, mines: 40 },
    expert:       { rows: 16, cols: 30, mines: 99 },
};

// ===== Elements =====
const $ = (id) => document.getElementById(id);
const board = $("board"), minesEl = $("mines"), timeEl = $("time"), faceEl = $("face");
const statusEl = $("status"), bestEl = $("best"), flagBtn = $("flagmode");

// ===== State =====
let level = "beginner";
let cfg, cells;
let first, over, revealed, flags;
let startTime = 0, timerId = null;
let flagMode = false;
let lastPointer = "mouse";
let lpTimer = null, lpFired = false;

// ===== Helpers =====
function neighbors(i) {
    const r = Math.floor(i / cfg.cols), c = i % cfg.cols, out = [];
    for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
            if (!dr && !dc) continue;
            const rr = r + dr, cc = c + dc;
            if (rr >= 0 && rr < cfg.rows && cc >= 0 && cc < cfg.cols) out.push(rr * cfg.cols + cc);
        }
    }
    return out;
}

function bestKey() { return "minesweeper-best-" + level; }
function readBest() {
    try { return Number(localStorage.getItem(bestKey())) || null; } catch (e) { return null; }
}
function saveBest(sec) {
    try { localStorage.setItem(bestKey(), String(sec)); } catch (e) { /* storage unavailable */ }
}

function fit() {                                   // choose a cell size that fits the screen width
    const avail = Math.min(window.innerWidth - 28, 1100);
    const size = Math.max(20, Math.min(40, Math.floor(avail / cfg.cols)));
    board.style.setProperty("--cell", size + "px");
}

// ===== HUD =====
function showMines() {
    const n = cfg.mines - flags;
    minesEl.textContent = n < 0 ? "-" + String(-n).padStart(2, "0") : String(n).padStart(3, "0");
}
function tick() {
    const s = Math.min(999, Math.floor((Date.now() - startTime) / 1000));
    timeEl.textContent = String(s).padStart(3, "0");
}
function startTimer() {
    startTime = Date.now();
    clearInterval(timerId);
    timerId = setInterval(tick, 250);
    tick();
}
function stopTimer() {
    clearInterval(timerId);
    timerId = null;
}
function showBest() {
    const b = readBest();
    bestEl.textContent = b ? `Best: ${b}s` : "No best time yet";
}

// ===== Drawing =====
function paint(i) {
    const c = cells[i], el = board.children[i];
    let cls = "cell", txt = "";
    if (c.rev) {
        cls += " open";
        if (c.n) { cls += " n" + c.n; txt = c.n; }
    } else if (c.flag) {
        txt = over && !c.mine ? "❌" : "🚩";
        if (over && !c.mine) cls += " wrong";
    } else if (over && c.mine) {
        cls += " open";
        txt = c.boom ? "💥" : "💣";
        if (c.boom) cls += " boom";
    }
    el.className = cls;
    el.textContent = txt;
}

function buildBoard() {
    board.textContent = "";
    board.style.gridTemplateColumns = `repeat(${cfg.cols}, var(--cell))`;
    for (let i = 0; i < cfg.rows * cfg.cols; i++) {
        const d = document.createElement("div");
        d.className = "cell";
        d.dataset.i = i;
        board.appendChild(d);
    }
}

// ===== Game flow =====
function newGame() {
    stopTimer();
    cfg = LEVELS[level];
    cells = Array.from({ length: cfg.rows * cfg.cols }, () => ({ mine: false, rev: false, flag: false, n: 0, boom: false }));
    first = true;
    over = false;
    revealed = 0;
    flags = 0;
    buildBoard();
    fit();
    timeEl.textContent = "000";
    faceEl.textContent = "😀";
    statusEl.classList.add("hidden");
    showMines();
    showBest();
}

function placeMines(safe) {
    const bad = new Set([safe, ...neighbors(safe)]);
    let pool = cells.map((_, i) => i).filter((i) => !bad.has(i));
    if (pool.length < cfg.mines) pool = cells.map((_, i) => i).filter((i) => i !== safe);
    for (let k = 0; k < cfg.mines; k++) {            // partial shuffle: first `mines` entries are the picks
        const j = k + GameKit.rand(pool.length - k);
        [pool[k], pool[j]] = [pool[j], pool[k]];
        cells[pool[k]].mine = true;
    }
    cells.forEach((c, i) => { c.n = neighbors(i).filter((j) => cells[j].mine).length; });
}

function reveal(i) {
    const c = cells[i];
    if (over || c.rev || c.flag) return;
    if (first) {
        first = false;
        placeMines(i);
        startTimer();
    }
    if (c.mine) return lose(i);
    const stack = [i];
    while (stack.length) {                           // flood fill through empty (0) cells
        const k = stack.pop(), ck = cells[k];
        if (ck.rev || ck.flag) continue;
        ck.rev = true;
        revealed++;
        paint(k);
        if (ck.n === 0) neighbors(k).forEach((j) => { if (!cells[j].rev && !cells[j].flag) stack.push(j); });
    }
    if (revealed === cfg.rows * cfg.cols - cfg.mines) win();
}

function toggleFlag(i) {
    const c = cells[i];
    if (over || c.rev) return;
    c.flag = !c.flag;
    flags += c.flag ? 1 : -1;
    paint(i);
    showMines();
}

function chord(i) {                                  // open all unflagged neighbours of a satisfied number
    const c = cells[i];
    if (over || !c.rev || !c.n) return;
    const around = neighbors(i);
    if (around.filter((j) => cells[j].flag).length !== c.n) return;
    around.forEach(reveal);
}

function act(i) {
    const c = cells[i];
    if (over) return;
    if (c.rev) chord(i);
    else if (flagMode) toggleFlag(i);
    else reveal(i);
}

function lose(i) {
    over = true;
    stopTimer();
    cells[i].boom = true;
    faceEl.textContent = "😵";
    cells.forEach((_, k) => paint(k));
    statusEl.textContent = "💥 Boom! You hit a mine.";
    statusEl.classList.remove("hidden");
}

function win() {
    over = true;
    stopTimer();
    const sec = Math.max(1, Math.floor((Date.now() - startTime) / 1000));
    cells.forEach((c, k) => {
        if (c.mine && !c.flag) { c.flag = true; flags++; paint(k); }
    });
    showMines();
    faceEl.textContent = "😎";
    const best = readBest();
    let msg = `🎉 Cleared in ${sec}s!`;
    if (!best || sec < best) {
        saveBest(sec);
        msg += best ? " New best time!" : " First best time saved.";
    }
    showBest();
    statusEl.textContent = msg;
    statusEl.classList.remove("hidden");
}

// ===== Input =====
const indexOf = (el) => {
    const t = el.closest ? el.closest(".cell") : null;
    return t ? Number(t.dataset.i) : -1;
};

board.addEventListener("click", (e) => {
    if (lpFired) { lpFired = false; return; }        // this tap was a long-press (already flagged)
    const i = indexOf(e.target);
    if (i >= 0) act(i);
});
board.addEventListener("contextmenu", (e) => {
    e.preventDefault();
    if (lastPointer === "touch") return;             // touch long-press is handled by the timer below
    const i = indexOf(e.target);
    if (i >= 0) toggleFlag(i);
});
board.addEventListener("pointerdown", (e) => {
    lastPointer = e.pointerType;
    lpFired = false;
    clearTimeout(lpTimer);
    if (e.pointerType !== "touch") return;
    const i = indexOf(e.target);
    if (i < 0) return;
    lpTimer = setTimeout(() => {                     // long-press = flag
        lpFired = true;
        toggleFlag(i);
        if (navigator.vibrate) navigator.vibrate(20);
    }, 420);
});
["pointerup", "pointerleave", "pointercancel"].forEach((ev) =>
    board.addEventListener(ev, () => clearTimeout(lpTimer)));
board.addEventListener("pointerdown", () => { if (!over) faceEl.textContent = "😮"; });
document.addEventListener("pointerup", () => { if (!over) faceEl.textContent = "😀"; });

faceEl.addEventListener("click", newGame);
flagBtn.addEventListener("click", () => {
    flagMode = !flagMode;
    flagBtn.classList.toggle("active", flagMode);
    flagBtn.textContent = "🚩 Flag mode: " + (flagMode ? "on" : "off");
});
window.addEventListener("resize", () => { if (cfg) fit(); });

GameKit.modeBar($("modes"), (m) => {
    level = m.mode;
    newGame();
}, {
    modes: [["beginner", "Beginner"], ["intermediate", "Intermediate"], ["expert", "Expert"]],
    levels: null,                                    // no computer difficulty menu
});

newGame();
