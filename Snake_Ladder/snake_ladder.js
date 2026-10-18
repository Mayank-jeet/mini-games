// ===== Board layout (classic) =====
const LADDERS = {1:38, 4:14, 9:31, 21:42, 28:84, 36:44, 51:67, 71:91, 80:100};
const SNAKES  = {16:6, 47:26, 49:11, 56:53, 62:19, 64:60, 87:24, 93:73, 95:75, 98:78};
const JUMPS = Object.assign({}, LADDERS, SNAKES);

const COLORS = ["#ef4444", "#3b82f6", "#22c55e", "#eab308"];
const NAMES  = ["Red", "Blue", "Green", "Yellow"];
const FACES  = ["⚀", "⚁", "⚂", "⚃", "⚄", "⚅"];

const setup = document.getElementById("setup");
const game = document.getElementById("game");
const cellsEl = document.getElementById("cells");
const overlay = document.getElementById("overlay");
const tokensEl = document.getElementById("tokens");
const playersEl = document.getElementById("players");
const turnEl = document.getElementById("turn");
const diceEl = document.getElementById("dice");
const rollBtn = document.getElementById("roll");
const messageEl = document.getElementById("message");

let players = [];
let current = 0;
let busy = false;
let over = false;
let lastMode = null;
let gameId = 0; // lets Restart / Change players cancel an in-progress move

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Centre of square n as % of the board (0-100)
function center(n) {
    const r = Math.floor((n - 1) / 10);
    let c = (n - 1) % 10;
    if (r % 2 === 1) c = 9 - c;
    return { x: (c + 0.5) * 10, y: (9 - r + 0.5) * 10 };
}

// ===== Drawing =====
function buildBoard() {
    cellsEl.innerHTML = "";
    for (let r = 9; r >= 0; r--) {
        for (let c = 0; c < 10; c++) {
            const n = r % 2 === 0 ? r * 10 + c + 1 : r * 10 + 10 - c;
            const cell = document.createElement("div");
            cell.className = "cell" + ((r + c) % 2 ? " alt" : "");
            cell.innerHTML = `<span>${n}</span>`;
            cellsEl.appendChild(cell);
        }
    }
}

function drawLadder(from, to) {
    const a = center(from), b = center(to);
    const dx = b.x - a.x, dy = b.y - a.y;
    const len = Math.hypot(dx, dy);
    const px = (-dy / len) * 1.2, py = (dx / len) * 1.2;
    let s = "";
    s += `<line x1="${a.x + px}" y1="${a.y + py}" x2="${b.x + px}" y2="${b.y + py}" stroke="#a8691f" stroke-width="1" stroke-linecap="round"/>`;
    s += `<line x1="${a.x - px}" y1="${a.y - py}" x2="${b.x - px}" y2="${b.y - py}" stroke="#a8691f" stroke-width="1" stroke-linecap="round"/>`;
    const rungs = Math.max(2, Math.floor(len / 4.5));
    for (let i = 1; i <= rungs; i++) {
        const t = i / (rungs + 1);
        const mx = a.x + dx * t, my = a.y + dy * t;
        s += `<line x1="${mx + px}" y1="${my + py}" x2="${mx - px}" y2="${my - py}" stroke="#d9a04a" stroke-width="0.8" stroke-linecap="round"/>`;
    }
    return s;
}

function drawSnake(from, to, i) {
    const a = center(from), b = center(to); // head at 'from', tail at 'to'
    const dx = b.x - a.x, dy = b.y - a.y;
    const len = Math.hypot(dx, dy);
    const nx = -dy / len, ny = dx / len;
    const waves = Math.max(2, Math.round(len / 14));
    const pts = [];
    for (let k = 0; k <= 48; k++) {
        const t = k / 48;
        const off = 3 * Math.sin(2 * Math.PI * waves * t) * Math.sin(Math.PI * t);
        pts.push(`${(a.x + dx * t + nx * off).toFixed(2)},${(a.y + dy * t + ny * off).toFixed(2)}`);
    }
    const color = `hsl(${(i * 37 + 10) % 360}, 70%, 48%)`;
    const poly = pts.join(" ");
    let s = `<polyline points="${poly}" fill="none" stroke="rgba(0,0,0,.35)" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>`;
    s += `<polyline points="${poly}" fill="none" stroke="${color}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>`;
    s += `<circle cx="${a.x}" cy="${a.y}" r="2" fill="${color}" stroke="rgba(0,0,0,.35)" stroke-width="0.4"/>`;
    s += `<circle cx="${a.x - 0.7}" cy="${a.y - 0.5}" r="0.55" fill="#fff"/><circle cx="${a.x + 0.7}" cy="${a.y - 0.5}" r="0.55" fill="#fff"/>`;
    s += `<circle cx="${a.x - 0.7}" cy="${a.y - 0.5}" r="0.25" fill="#111"/><circle cx="${a.x + 0.7}" cy="${a.y - 0.5}" r="0.25" fill="#111"/>`;
    return s;
}

function drawOverlay() {
    let s = "";
    Object.entries(LADDERS).forEach(([f, t]) => (s += drawLadder(+f, +t)));
    Object.entries(SNAKES).forEach(([f, t], i) => (s += drawSnake(+f, +t, i)));
    overlay.innerHTML = s;
}

function placeToken(i) {
    const p = players[i];
    let x, y;
    if (p.pos === 0) {
        x = 4 + i * 5;
        y = 106;
    } else {
        const c = center(p.pos);
        x = c.x + (i % 2 ? 1.8 : -1.8);
        y = c.y + (i < 2 ? -1.8 : 1.8);
    }
    p.el.style.left = x + "%";
    p.el.style.top = y + "%";
}

function renderPlayers() {
    playersEl.innerHTML = players
        .map(
            (p, i) => `<li class="${i === current && !over ? "active" : ""}">
                <span class="dot" style="background:${p.color}"></span>${p.name}
                <span class="pos">${p.pos === 0 ? "Start" : p.pos}</span></li>`
        )
        .join("");
}

function updateTurn() {
    turnEl.textContent = over ? "Game over" : `Turn: ${players[current].name}`;
    renderPlayers();
}

const setMessage = (m) => (messageEl.textContent = m);

// ===== Game flow =====
function startGame(n, cpu) {
    gameId++;
    lastMode = { n, cpu };
    players = Array.from({ length: n }, (_, i) => ({
        name: cpu ? (i === 0 ? `${NAMES[i]} (You)` : `${NAMES[i]} (Computer)`) : NAMES[i],
        color: COLORS[i],
        pos: 0,
        cpu: !!cpu && i === 1,
    }));
    tokensEl.innerHTML = "";
    players.forEach((p) => {
        p.el = document.createElement("div");
        p.el.className = "token";
        p.el.style.background = p.color;
        tokensEl.appendChild(p.el);
    });
    players.forEach((_, i) => placeToken(i));
    current = 0;
    busy = false;
    over = false;
    diceEl.textContent = FACES[0];
    diceEl.classList.remove("rolling");
    setup.classList.add("hidden");
    game.classList.remove("hidden");
    setMessage("Roll the dice to begin!");
    updateTurn();
    rollBtn.disabled = players[0].cpu;
    maybeCpu();
}

function maybeCpu() {
    if (over || !players[current].cpu) return;
    const id = gameId;
    rollBtn.disabled = true;
    setTimeout(() => {
        if (id === gameId) roll();
    }, 900);
}

async function roll() {
    if (busy || over) return;
    const id = gameId;
    busy = true;
    rollBtn.disabled = true;
    diceEl.classList.add("rolling");
    for (let i = 0; i < 8; i++) {
        diceEl.textContent = FACES[Math.floor(Math.random() * 6)];
        await sleep(70);
        if (id !== gameId) return;
    }
    const v = 1 + Math.floor(Math.random() * 6);
    diceEl.textContent = FACES[v - 1];
    diceEl.classList.remove("rolling");

    const p = players[current];
    let moved = false;

    if (p.pos + v > 100) {
        setMessage(`${p.name} rolled ${v}, but needs exactly ${100 - p.pos} to finish.`);
    } else {
        moved = true;
        setMessage(`${p.name} rolled ${v}.`);
        for (let s = 0; s < v; s++) {
            p.pos++;
            placeToken(current);
            renderPlayers();
            await sleep(260);
            if (id !== gameId) return;
        }
        const dest = JUMPS[p.pos];
        if (dest) {
            const up = dest > p.pos;
            setMessage(up ? `🪜 Ladder! ${p.name} climbs to ${dest}.` : `🐍 Snake! ${p.name} slides down to ${dest}.`);
            await sleep(350);
            if (id !== gameId) return;
            p.el.classList.add("slow");
            p.pos = dest;
            placeToken(current);
            renderPlayers();
            await sleep(850);
            if (id !== gameId) return;
            p.el.classList.remove("slow");
        }
        if (p.pos === 100) {
            over = true;
            setMessage(`🎉 ${p.name} wins the game!`);
            updateTurn();
            busy = false;
            return;
        }
    }

    if (moved && v === 6) {
        setMessage(messageEl.textContent + " Rolled a 6, roll again!");
    } else {
        current = (current + 1) % players.length;
    }
    busy = false;
    updateTurn();
    rollBtn.disabled = players[current].cpu;
    maybeCpu();
}

// ===== Events =====
document.querySelectorAll(".mode").forEach((btn) => {
    btn.addEventListener("click", () => {
        startGame(Number(btn.dataset.players), !!btn.dataset.cpu);
    });
});
rollBtn.addEventListener("click", roll);
document.getElementById("restart").addEventListener("click", () => {
    if (lastMode) startGame(lastMode.n, lastMode.cpu);
});
document.getElementById("change").addEventListener("click", () => {
    gameId++; // cancel any move in progress
    busy = false;
    game.classList.add("hidden");
    setup.classList.remove("hidden");
});

buildBoard();
drawOverlay();
