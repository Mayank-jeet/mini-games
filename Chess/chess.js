/* ==================== Chess ====================
   Board: array of 64, index = row*8 + col. Row 0 is rank 8 (black's side), col 0 is file a.
   Pieces are strings like "wK", "bP". A position ("state") is
   { board, turn: "w"|"b", castle: {wK,wQ,bK,bQ}, ep: index|null, half, full }.
   Moves: { from, to, piece, capture, promo, flag }  flag: double | ep | castleK | castleQ | null */

const FILES = "abcdefgh";
const sq = (r, c) => r * 8 + c;
const opp = (c) => (c === "w" ? "b" : "w");
const nameOf = (i) => FILES[i & 7] + (8 - (i >> 3));
const GLYPH = { K: "♚", Q: "♛", R: "♜", B: "♝", N: "♞", P: "♟" };
const glyph = (t) => GLYPH[t] + "\uFE0E";             // FE0E forces text (not emoji) style
const VAL = { P: 100, N: 320, B: 330, R: 500, Q: 900, K: 0 };
const KN = [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]];
const KG = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]];
const DIAG = [[-1, -1], [-1, 1], [1, -1], [1, 1]];
const ORTH = [[-1, 0], [1, 0], [0, -1], [0, 1]];

// ===== Rules engine =====
function initialState() {
    const board = Array(64).fill(null);
    const back = "RNBQKBNR";
    for (let c = 0; c < 8; c++) {
        board[sq(0, c)] = "b" + back[c];
        board[sq(1, c)] = "bP";
        board[sq(6, c)] = "wP";
        board[sq(7, c)] = "w" + back[c];
    }
    return { board, turn: "w", castle: { wK: true, wQ: true, bK: true, bQ: true }, ep: null, half: 0, full: 1 };
}

// Is square i attacked by colour `by`?
function attacked(b, i, by) {
    const r = i >> 3, c = i & 7;
    const pr = by === "w" ? r + 1 : r - 1;            // a pawn attacks "forward", so look behind
    for (const dc of [-1, 1]) {
        const cc = c + dc;
        if (pr >= 0 && pr < 8 && cc >= 0 && cc < 8 && b[sq(pr, cc)] === by + "P") return true;
    }
    for (const [dr, dc] of KN) {
        const rr = r + dr, cc = c + dc;
        if (rr >= 0 && rr < 8 && cc >= 0 && cc < 8 && b[sq(rr, cc)] === by + "N") return true;
    }
    for (const [dr, dc] of KG) {
        const rr = r + dr, cc = c + dc;
        if (rr >= 0 && rr < 8 && cc >= 0 && cc < 8 && b[sq(rr, cc)] === by + "K") return true;
    }
    for (const dirs of [DIAG, ORTH]) {
        const sliders = dirs === DIAG ? ["B", "Q"] : ["R", "Q"];
        for (const [dr, dc] of dirs) {
            let rr = r + dr, cc = c + dc;
            while (rr >= 0 && rr < 8 && cc >= 0 && cc < 8) {
                const p = b[sq(rr, cc)];
                if (p) {
                    if (p[0] === by && sliders.includes(p[1])) return true;
                    break;
                }
                rr += dr; cc += dc;
            }
        }
    }
    return false;
}

const findKing = (b, color) => b.indexOf(color + "K");
const inCheck = (s, color) => attacked(s.board, findKing(s.board, color), opp(color));

// All moves ignoring "does this leave my own king in check?"
function pseudoMoves(s) {
    const b = s.board, us = s.turn, them = opp(us), out = [];
    const mk = (from, to, piece, capture, flag = null, promo = null) =>
        out.push({ from, to, piece, capture, promo, flag });

    for (let i = 0; i < 64; i++) {
        const p = b[i];
        if (!p || p[0] !== us) continue;
        const t = p[1], r = i >> 3, c = i & 7;

        if (t === "P") {
            const dir = us === "w" ? -1 : 1, startRow = us === "w" ? 6 : 1, lastRow = us === "w" ? 0 : 7;
            const r1 = r + dir;
            const addPawn = (to, cap, flag) => {
                if (r1 === lastRow) for (const pr of "QRBN") mk(i, to, p, cap, flag, pr);
                else mk(i, to, p, cap, flag);
            };
            if (!b[sq(r1, c)]) {
                addPawn(sq(r1, c), null, null);
                if (r === startRow && !b[sq(r1 + dir, c)]) mk(i, sq(r1 + dir, c), p, null, "double");
            }
            for (const dc of [-1, 1]) {
                const cc = c + dc;
                if (cc < 0 || cc > 7) continue;
                const to = sq(r1, cc), tp = b[to];
                if (tp && tp[0] === them) addPawn(to, tp, null);
                else if (!tp && s.ep === to) addPawn(to, them + "P", "ep");
            }
        } else if (t === "N" || t === "K") {
            for (const [dr, dc] of t === "N" ? KN : KG) {
                const rr = r + dr, cc = c + dc;
                if (rr < 0 || rr > 7 || cc < 0 || cc > 7) continue;
                const tp = b[sq(rr, cc)];
                if (!tp || tp[0] === them) mk(i, sq(rr, cc), p, tp || null);
            }
            const home = us === "w" ? 60 : 4;
            if (t === "K" && i === home && (s.castle[us + "K"] || s.castle[us + "Q"]) && !attacked(b, home, them)) {
                if (s.castle[us + "K"] && !b[home + 1] && !b[home + 2] && b[home + 3] === us + "R" &&
                    !attacked(b, home + 1, them) && !attacked(b, home + 2, them)) mk(i, home + 2, p, null, "castleK");
                if (s.castle[us + "Q"] && !b[home - 1] && !b[home - 2] && !b[home - 3] && b[home - 4] === us + "R" &&
                    !attacked(b, home - 1, them) && !attacked(b, home - 2, them)) mk(i, home - 2, p, null, "castleQ");
            }
        } else {
            const dirs = t === "B" ? DIAG : t === "R" ? ORTH : DIAG.concat(ORTH);
            for (const [dr, dc] of dirs) {
                let rr = r + dr, cc = c + dc;
                while (rr >= 0 && rr < 8 && cc >= 0 && cc < 8) {
                    const tp = b[sq(rr, cc)];
                    if (!tp) mk(i, sq(rr, cc), p, null);
                    else {
                        if (tp[0] === them) mk(i, sq(rr, cc), p, tp);
                        break;
                    }
                    rr += dr; cc += dc;
                }
            }
        }
    }
    return out;
}

// Returns a NEW state with the move played.
function applyMove(s, m) {
    const b = s.board.slice(), us = s.turn;
    b[m.to] = m.promo ? us + m.promo : m.piece;
    b[m.from] = null;
    if (m.flag === "ep") b[m.to + (us === "w" ? 8 : -8)] = null;
    if (m.flag === "castleK") { b[m.to - 1] = b[m.to + 1]; b[m.to + 1] = null; }
    if (m.flag === "castleQ") { b[m.to + 1] = b[m.to - 2]; b[m.to - 2] = null; }

    const castle = { ...s.castle };
    if (m.piece === "wK") castle.wK = castle.wQ = false;
    if (m.piece === "bK") castle.bK = castle.bQ = false;
    for (const i of [m.from, m.to]) {                 // a rook moving or being captured loses the right
        if (i === 63) castle.wK = false;
        if (i === 56) castle.wQ = false;
        if (i === 7) castle.bK = false;
        if (i === 0) castle.bQ = false;
    }
    return {
        board: b,
        turn: opp(us),
        castle,
        ep: m.flag === "double" ? (m.from + m.to) / 2 : null,
        half: m.piece[1] === "P" || m.capture ? 0 : s.half + 1,
        full: s.full + (us === "b" ? 1 : 0),
    };
}

function legalMoves(s, capsOnly = false) {
    const us = s.turn;
    let list = pseudoMoves(s);
    if (capsOnly) list = list.filter((m) => m.capture || m.promo);
    return list.filter((m) => {
        const n = applyMove(s, m);
        return !attacked(n.board, findKing(n.board, us), opp(us));
    });
}

function insufficientMaterial(b) {
    const rest = b.filter((p) => p && p[1] !== "K");
    return rest.length === 0 || (rest.length === 1 && "NB".includes(rest[0][1]));
}

const keyOf = (s) =>
    s.board.map((p) => p || "-").join("") + s.turn + Object.values(s.castle).map(Number).join("") + (s.ep ?? "");

// Standard algebraic notation (with + and #)
function sanOf(s, m, legal) {
    let t;
    if (m.flag === "castleK") t = "O-O";
    else if (m.flag === "castleQ") t = "O-O-O";
    else {
        const p = m.piece[1], to = nameOf(m.to);
        if (p === "P") t = (m.capture ? FILES[m.from & 7] + "x" : "") + to + (m.promo ? "=" + m.promo : "");
        else {
            let dis = "";
            const others = legal.filter((o) => o.piece === m.piece && o.to === m.to && o.from !== m.from);
            if (others.length) {
                const sameFile = others.some((o) => (o.from & 7) === (m.from & 7));
                const sameRank = others.some((o) => (o.from >> 3) === (m.from >> 3));
                dis = !sameFile ? FILES[m.from & 7] : !sameRank ? String(8 - (m.from >> 3)) : nameOf(m.from);
            }
            t = p + dis + (m.capture ? "x" : "") + to;
        }
    }
    const after = applyMove(s, m);
    if (inCheck(after, after.turn)) t += legalMoves(after).length ? "+" : "#";
    return t;
}

// ===== Computer player =====
function evaluate(s) {                                // positive = good for White
    const b = s.board;
    let nonPawn = 0;
    for (const p of b) if (p && p[1] !== "P" && p[1] !== "K") nonPawn += VAL[p[1]];
    const endgame = nonPawn < 1600;
    let score = 0;
    for (let i = 0; i < 64; i++) {
        const p = b[i];
        if (!p) continue;
        const col = p[0], t = p[1], r = i >> 3, c = i & 7;
        const centre = 3.5 - Math.max(Math.abs(r - 3.5), Math.abs(c - 3.5));   // 0 (corner) .. 3 (centre)
        let v = VAL[t];
        if (t === "N") v += centre * 10;
        else if (t === "B") v += centre * 5;
        else if (t === "Q") v += centre * 2;
        else if (t === "K") v += (endgame ? 8 : -8) * centre;                 // hide early, activate late
        else if (t === "P") {
            const adv = col === "w" ? 6 - r : r - 1;
            v += adv * 8 + (c === 3 || c === 4 ? adv * 3 : 0);
        }
        score += col === "w" ? v : -v;
    }
    return score;
}

const orderScore = (m) =>
    (m.capture ? VAL[m.capture[1]] * 10 - VAL[m.piece[1]] / 10 : 0) + (m.promo ? 800 : 0);

function quiesce(s, alpha, beta, depth) {
    const stand = (s.turn === "w" ? 1 : -1) * evaluate(s);
    if (stand >= beta) return beta;
    if (stand > alpha) alpha = stand;
    if (depth >= 4) return alpha;
    const caps = legalMoves(s, true).sort((a, b) => orderScore(b) - orderScore(a));
    for (const m of caps) {
        const sc = -quiesce(applyMove(s, m), -beta, -alpha, depth + 1);
        if (sc >= beta) return beta;
        if (sc > alpha) alpha = sc;
    }
    return alpha;
}

function negamax(s, depth, alpha, beta, ply, useQ) {
    const moves = legalMoves(s);
    if (!moves.length) return inCheck(s, s.turn) ? -100000 + ply : 0;   // mate (sooner is worse for the mated side) / stalemate
    if (s.half >= 100) return 0;
    if (depth <= 0) return useQ ? quiesce(s, alpha, beta, 0) : (s.turn === "w" ? 1 : -1) * evaluate(s);
    moves.sort((a, b) => orderScore(b) - orderScore(a));
    for (const m of moves) {
        const sc = -negamax(applyMove(s, m), depth - 1, -beta, -alpha, ply + 1, useQ);
        if (sc >= beta) return beta;
        if (sc > alpha) alpha = sc;
    }
    return alpha;
}

function chooseMove(s, level) {
    const moves = legalMoves(s);
    if (level === "easy") {
        const caps = moves.filter((m) => m.capture);
        return caps.length && Math.random() < 0.5 ? GameKit.pick(caps) : GameKit.pick(moves);
    }
    if (level === "medium" && Math.random() < 0.2) return GameKit.pick(moves);   // occasional blunder
    for (let i = moves.length - 1; i > 0; i--) {                                 // shuffle so equal moves vary
        const j = GameKit.rand(i + 1);
        [moves[i], moves[j]] = [moves[j], moves[i]];
    }
    moves.sort((a, b) => orderScore(b) - orderScore(a));
    const depth = level === "hard" ? 3 : 2, useQ = level === "hard";
    let alpha = -1e9, best = moves[0];
    for (const m of moves) {
        const sc = -negamax(applyMove(s, m), depth - 1, -1e9, -alpha, 1, useQ);
        if (sc > alpha) { alpha = sc; best = m; }
    }
    return best;
}

// ===== UI state =====
const $ = (id) => document.getElementById(id);
const boardEl = $("board"), statusEl = $("status"), capturedEl = $("captured");
const movesEl = $("moves"), promoEl = $("promo"), sideSel = $("side");
const undoBtn = $("undo");

let G = null;              // { stack, keys, moves:[{m,san}], state, legal, last, over }
let vsComputer = false;
let difficulty = "medium";
let humanColor = "w";
let flipped = false;
let selected = null;
let thinking = false;
let promoting = false;
let gameId = 0;

const isHumanTurn = () => !vsComputer || G.state.turn === humanColor;
const sideName = (c) => (c === "w" ? "White" : "Black");

function newGame() {
    gameId++;
    thinking = false;
    promoting = false;
    promoEl.classList.add("gone");
    const s = initialState();
    G = { stack: [s], keys: [keyOf(s)], moves: [], state: s, legal: legalMoves(s), last: null, over: null };
    humanColor = sideSel.value;
    flipped = vsComputer && humanColor === "b";
    selected = null;
    render();
    maybeComputer();
}

function checkEnd() {
    const s = G.state;
    G.legal = legalMoves(s);
    G.over = null;
    if (!G.legal.length) {
        G.over = inCheck(s, s.turn) ? `Checkmate! ${sideName(opp(s.turn))} wins` : "Stalemate: draw";
    } else if (s.half >= 100) G.over = "Draw: 50-move rule";
    else if (insufficientMaterial(s.board)) G.over = "Draw: insufficient material";
    else if (G.keys.filter((k) => k === G.keys[G.keys.length - 1]).length >= 3) G.over = "Draw by repetition";
}

function playMove(m) {
    const text = sanOf(G.state, m, G.legal);
    const next = applyMove(G.state, m);
    G.stack.push(next);
    G.keys.push(keyOf(next));
    G.moves.push({ m, san: text });
    G.state = next;
    G.last = m;
    selected = null;
    checkEnd();
    render();
    maybeComputer();
}

async function maybeComputer() {
    if (!vsComputer || G.over || G.state.turn === humanColor) return;
    const id = gameId;
    thinking = true;
    render();
    await GameKit.sleep(300);                         // let the UI repaint before the search blocks it
    if (id !== gameId) return;
    const m = chooseMove(G.state, difficulty);
    if (id !== gameId) return;
    thinking = false;
    playMove(m);
}

function onSquare(i) {
    if (!G || G.over || thinking || !isHumanTurn()) return;
    if (promoting) {                                  // clicking the board cancels the promotion picker
        promoting = false;
        promoEl.classList.add("gone");
        selected = null;
        return render();
    }
    if (selected !== null) {
        const cand = G.legal.filter((m) => m.from === selected && m.to === i);
        if (cand.length === 1) return playMove(cand[0]);
        if (cand.length > 1) return askPromotion(cand);
    }
    const p = G.state.board[i];
    selected = p && p[0] === G.state.turn ? i : null;
    render();
}

function askPromotion(cands) {
    promoting = true;
    const color = G.state.turn;
    promoEl.textContent = "";
    for (const letter of "QRBN") {
        const b = document.createElement("button");
        b.setAttribute("aria-label", "Promote to " + letter);
        b.innerHTML = `<span class="piece ${color}">${glyph(letter)}</span>`;
        b.addEventListener("click", (e) => {
            e.stopPropagation();
            promoting = false;
            promoEl.classList.add("gone");
            playMove(cands.find((m) => m.promo === letter));
        });
        promoEl.appendChild(b);
    }
    promoEl.classList.remove("gone");
}

function undo() {
    if (thinking || G.moves.length === 0) return;
    if (vsComputer && humanColor === "b" && G.moves.length <= 1) return;   // keep the computer's opening move
    const pop = () => { G.stack.pop(); G.keys.pop(); G.moves.pop(); };
    pop();
    while (vsComputer && G.stack[G.stack.length - 1].turn !== humanColor && G.moves.length > 0) pop();
    G.state = G.stack[G.stack.length - 1];
    G.last = G.moves.length ? G.moves[G.moves.length - 1].m : null;
    selected = null;
    promoting = false;
    promoEl.classList.add("gone");
    checkEnd();
    render();
}

// ===== Rendering =====
function renderCaptured() {
    const START_COUNT = { P: 8, N: 2, B: 2, R: 2, Q: 1 };
    const missing = { w: [], b: [] };                 // missing[c] = pieces of colour c that were captured
    let lost = { w: 0, b: 0 };
    for (const c of ["w", "b"]) {
        for (const t of "QRBNP") {
            const have = G.state.board.filter((p) => p === c + t).length;
            for (let k = 0; k < Math.max(0, START_COUNT[t] - have); k++) {
                missing[c].push(t);
                lost[c] += VAL[t];
            }
        }
    }
    capturedEl.textContent = "";
    for (const c of ["w", "b"]) {                     // row for the side that DID the capturing
        const victim = opp(c);
        const row = document.createElement("div");
        row.className = "cap-row";
        const diff = lost[victim] - lost[c];
        row.innerHTML = `<span class="who">${sideName(c)}</span>` +
            missing[victim].map((t) => `<span class="piece ${victim}">${glyph(t)}</span>`).join("") +
            (diff > 0 ? `<span class="adv">+${Math.round(diff / 100)}</span>` : "");
        capturedEl.appendChild(row);
    }
}

function render() {
    const s = G.state;
    const kingSq = inCheck(s, s.turn) ? findKing(s.board, s.turn) : -1;
    const targets = new Map();
    if (selected !== null) G.legal.filter((m) => m.from === selected).forEach((m) => targets.set(m.to, m));

    boardEl.textContent = "";
    for (let dr = 0; dr < 8; dr++) {
        for (let dc = 0; dc < 8; dc++) {
            const r = flipped ? 7 - dr : dr, c = flipped ? 7 - dc : dc, i = sq(r, c), p = s.board[i];
            const d = document.createElement("button");
            d.className = "sq " + ((r + c) % 2 === 0 ? "light" : "dark");
            if (i === selected) d.classList.add("sel");
            if (G.last && (i === G.last.from || i === G.last.to)) d.classList.add("last");
            if (i === kingSq) d.classList.add("check");
            if (targets.has(i)) {
                d.classList.add("move");
                if (p || targets.get(i).flag === "ep") d.classList.add("cap");
            }
            d.setAttribute("aria-label", nameOf(i) + (p ? ` ${sideName(p[0])} ${p[1]}` : ""));
            if (p) d.innerHTML = `<span class="piece ${p[0]}">${glyph(p[1])}</span>`;
            if (dc === 0) d.insertAdjacentHTML("beforeend", `<i class="coord rank">${8 - r}</i>`);
            if (dr === 7) d.insertAdjacentHTML("beforeend", `<i class="coord file">${FILES[c]}</i>`);
            d.addEventListener("click", () => onSquare(i));
            boardEl.appendChild(d);
        }
    }

    let text;
    if (G.over) text = G.over;
    else if (thinking) text = `Computer (${sideName(s.turn)}) is thinking…`;
    else text = `${sideName(s.turn)} to move` + (kingSq >= 0 ? " · Check!" : "");
    statusEl.textContent = text;

    renderCaptured();
    movesEl.textContent = "";
    for (let k = 0; k < G.moves.length; k += 2) {
        const li = document.createElement("li");
        li.innerHTML = `<span class="num">${k / 2 + 1}.</span><span class="ply">${G.moves[k].san}</span>` +
            (G.moves[k + 1] ? `<span class="ply">${G.moves[k + 1].san}</span>` : "");
        movesEl.appendChild(li);
    }
    movesEl.scrollTop = movesEl.scrollHeight;
    undoBtn.disabled = thinking || G.moves.length === 0;
}

// ===== Controls =====
GameKit.modeBar($("modes"), (m) => {
    vsComputer = m.vsComputer;
    difficulty = m.difficulty;
    sideSel.hidden = !vsComputer;
    newGame();
});
sideSel.addEventListener("change", newGame);
$("new").addEventListener("click", newGame);
undoBtn.addEventListener("click", undo);
$("flip").addEventListener("click", () => { flipped = !flipped; render(); });

newGame();
