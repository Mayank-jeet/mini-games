/* ==================== Memory Match ====================
   Modes: solo (moves + time + best), 2 players, vs Computer.
   A match keeps your turn. The computer's difficulty is its memory:
   it remembers each card it sees with probability REMEMBER[difficulty]. */

const EMOJI = ["🍎", "🍌", "🍇", "🍉", "🍓", "🍒", "🥝", "🍍", "🥑", "🌽", "🥕", "🍄",
    "🐶", "🐱", "🐼", "🦊", "🐸", "🐵", "🦁", "🐯", "🐙", "🦋", "🐢", "🐳"];
const SIZES = { small: { cols: 4, pairs: 6 }, medium: { cols: 4, pairs: 8 }, large: { cols: 6, pairs: 18 } };
const REMEMBER = { easy: 0.35, medium: 0.7, hard: 1 };

// ===== Elements =====
const $ = (id) => document.getElementById(id);
const board = $("board"), hudEl = $("hud"), statusEl = $("status"), sizeSel = $("size");
const sleep = GameKit.sleep;

// ===== State =====
let mode = "solo", difficulty = "medium", size = "medium";
let cards, mem;                        // mem = Set of card indexes the computer remembers
let first, lock, over, moves, matches, pairs, turn, scores;
let gameId = 0, startTime = 0, timerId = null;

const cpuToMove = () => mode === "cpu" && turn === 2 && !over;

// ===== Setup =====
function newGame() {
    gameId++;
    clearInterval(timerId);
    timerId = null;
    const cfg = SIZES[size];
    pairs = cfg.pairs;
    const deck = EMOJI.slice(0, pairs).flatMap((face, pair) => [{ pair, face }, { pair, face }]);
    for (let i = deck.length - 1; i > 0; i--) {         // Fisher-Yates shuffle
        const j = GameKit.rand(i + 1);
        [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    cards = deck.map((c) => ({ ...c, flipped: false, matched: false, owner: 0 }));
    mem = new Set();
    first = null;
    lock = false;
    over = false;
    moves = 0;
    matches = 0;
    turn = 1;
    scores = { 1: 0, 2: 0 };
    startTime = 0;
    buildBoard(cfg.cols);
    renderHud();
    setStatus(mode === "solo" ? "Find all the pairs." : "Player 1 starts.");
}

function buildBoard(cols) {
    board.textContent = "";
    board.style.gridTemplateColumns = `repeat(${cols}, var(--card))`;
    cards.forEach((c, i) => {
        const b = document.createElement("button");
        b.className = "card3d";
        b.setAttribute("aria-label", "Card " + (i + 1));
        b.innerHTML = `<span class="inner"><span class="face cover">?</span><span class="face pic">${c.face}</span></span>`;
        b.addEventListener("click", () => onCard(i));
        board.appendChild(b);
    });
    fit(cols);
}

function fit(cols = SIZES[size].cols) {
    const avail = Math.min(window.innerWidth - 32, 640), gap = 10;
    const px = Math.max(44, Math.min(104, Math.floor((avail - (cols - 1) * gap) / cols)));
    board.style.setProperty("--card", px + "px");
}

// ===== Display =====
function setStatus(t) { statusEl.textContent = t; }

function paint(i) {
    const c = cards[i], el = board.children[i];
    el.classList.toggle("flipped", c.flipped || c.matched);
    el.classList.toggle("matched", c.matched);
    el.classList.remove("m1", "m2", "ms");
    if (c.matched) el.classList.add(mode === "solo" ? "ms" : "m" + c.owner);
}

function bestKey() { return "memory-best-" + size; }
function readBest() { try { return Number(localStorage.getItem(bestKey())) || null; } catch (e) { return null; } }
function saveBest(n) { try { localStorage.setItem(bestKey(), String(n)); } catch (e) { /* storage unavailable */ } }

function renderHud() {
    if (mode === "solo") {
        const secs = startTime ? Math.floor((Date.now() - startTime) / 1000) : 0;
        const best = readBest();
        hudEl.innerHTML = `<span class="pill">Moves <b>${moves}</b></span>` +
            `<span class="pill">Time <b>${secs}s</b></span>` +
            `<span class="pill">Best <b>${best ? best + " moves" : "–"}</b></span>`;
    } else {
        const name2 = mode === "cpu" ? "Computer" : "Player 2";
        hudEl.innerHTML =
            `<span class="pill m1${turn === 1 && !over ? " active" : ""}"><span class="dot"></span>Player 1: <b>${scores[1]}</b></span>` +
            `<span class="pill m2${turn === 2 && !over ? " active" : ""}"><span class="dot"></span>${name2}: <b>${scores[2]}</b></span>` +
            `<span class="pill">Pairs left <b>${pairs - matches}</b></span>`;
    }
}

// ===== Play =====
function remember(i) {
    if (mode === "cpu" && Math.random() < REMEMBER[difficulty]) mem.add(i);
}

function onCard(i) {
    if (lock || over || cpuToMove()) return;
    pick(i);
}

async function pick(i) {
    const c = cards[i];
    if (c.flipped || c.matched || lock || over) return;
    if (mode === "solo" && !startTime) {                 // timer starts on the first flip
        startTime = Date.now();
        timerId = setInterval(renderHud, 500);
    }
    c.flipped = true;
    remember(i);
    paint(i);
    if (first === null) { first = i; return; }

    const a = first, b = i, id = gameId;
    first = null;
    moves++;
    lock = true;
    if (cards[a].pair === cards[b].pair) {
        await sleep(450);
        if (id !== gameId) return;
        for (const k of [a, b]) {
            cards[k].matched = true;
            cards[k].owner = turn;
            mem.delete(k);
            paint(k);
        }
        matches++;
        scores[turn]++;
        lock = false;
        renderHud();
        if (matches === pairs) return finish();
        setStatus(mode === "solo" ? "Match! Keep going." : `${nameOf(turn)} found a pair and goes again.`);
    } else {
        setStatus("No match…");
        await sleep(950);
        if (id !== gameId) return;
        cards[a].flipped = cards[b].flipped = false;
        paint(a);
        paint(b);
        lock = false;
        if (mode !== "solo") turn = turn === 1 ? 2 : 1;
        renderHud();
        if (mode !== "solo") setStatus(`${nameOf(turn)}'s turn.`);
    }
    if (cpuToMove()) cpuTurn();
}

const nameOf = (t) => (t === 1 ? "Player 1" : mode === "cpu" ? "Computer" : "Player 2");

function finish() {
    over = true;
    clearInterval(timerId);
    timerId = null;
    let msg;
    if (mode === "solo") {
        const secs = Math.floor((Date.now() - startTime) / 1000);
        const best = readBest();
        msg = `🎉 Done in ${moves} moves and ${secs}s!`;
        if (!best || moves < best) {
            saveBest(moves);
            msg += best ? " New best!" : " First best saved.";
        }
    } else if (scores[1] === scores[2]) {
        msg = `It's a draw, ${scores[1]} – ${scores[2]}.`;
    } else {
        const w = scores[1] > scores[2] ? 1 : 2;
        msg = `🎉 ${nameOf(w)} wins, ${scores[w]} – ${scores[w === 1 ? 2 : 1]}!`;
        if (mode === "cpu" && w === 2) msg = `The computer wins, ${scores[2]} – ${scores[1]}.`;
    }
    setStatus(msg);
    renderHud();
}

// ===== Computer player =====
// A pair it remembers both halves of, as [i, j], or null.
function knownPair() {
    const seen = new Map();
    for (const i of mem) {
        if (cards[i].matched) continue;
        const p = cards[i].pair;
        if (seen.has(p)) return [seen.get(p), i];
        seen.set(p, i);
    }
    return null;
}
// Face-down, unmatched cards (optionally only ones the computer has no memory of).
const available = (exclude, unknownOnly) =>
    cards.map((_, i) => i).filter((i) =>
        i !== exclude && !cards[i].matched && !cards[i].flipped && !(unknownOnly && mem.has(i)));

async function cpuTurn() {
    const id = gameId;
    setStatus("Computer is thinking…");
    await sleep(750);
    if (id !== gameId || !cpuToMove()) return;

    const plan = knownPair();
    let a, b = null;
    if (plan) [a, b] = plan;
    else {
        const fresh = available(null, true);
        a = GameKit.pick(fresh.length ? fresh : available(null, false));
    }
    await pick(a);
    if (id !== gameId) return;
    await sleep(700);
    if (id !== gameId) return;
    if (b === null) {                                  // did the first card match something it remembers?
        const p = cards[a].pair;
        const twin = [...mem].find((k) => k !== a && !cards[k].matched && cards[k].pair === p);
        if (twin !== undefined) b = twin;
        else {
            const fresh = available(a, true);
            b = GameKit.pick(fresh.length ? fresh : available(a, false));
        }
    }
    await pick(b);
}

// ===== Controls =====
GameKit.modeBar($("modes"), (m) => {
    mode = m.mode;
    difficulty = m.difficulty;
    newGame();
}, { modes: [["solo", "Solo"], ["2p", "2 Players"], ["cpu", "vs Computer"]] });

sizeSel.addEventListener("change", () => { size = sizeSel.value; newGame(); });
$("new").addEventListener("click", newGame);
window.addEventListener("resize", () => fit());

newGame();
