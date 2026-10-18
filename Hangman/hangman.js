/* ==================== Hangman ====================
   vs Computer: the computer picks a word (category + length = difficulty).
   2 Players: one player types a secret word, the other guesses; roles swap every round. */

const MAX = 6;                                   // lives (= body parts)
const WORDS = {
    Animals: ["cat", "dog", "tiger", "zebra", "panda", "koala", "camel", "wolf", "otter", "penguin", "giraffe",
        "dolphin", "octopus", "leopard", "buffalo", "cheetah", "squirrel", "elephant", "kangaroo", "hedgehog",
        "flamingo", "crocodile", "chameleon", "rhinoceros"],
    Food: ["pizza", "burger", "sushi", "taco", "waffle", "noodles", "pancake", "popcorn", "avocado", "broccoli",
        "cupcake", "lasagna", "biryani", "dumpling", "sandwich", "croissant", "omelette", "mushroom", "chocolate",
        "spaghetti", "pineapple", "strawberry", "cheesecake", "watermelon"],
    Countries: ["india", "japan", "brazil", "canada", "norway", "kenya", "mexico", "egypt", "nepal", "peru", "spain",
        "turkey", "germany", "finland", "ireland", "vietnam", "thailand", "portugal", "malaysia", "argentina",
        "australia", "indonesia", "netherlands", "switzerland"],
    Tech: ["python", "laptop", "pixel", "cloud", "server", "router", "browser", "network", "program", "firewall",
        "compiler", "software", "hardware", "keyboard", "internet", "database", "variable", "function", "bluetooth",
        "algorithm", "processor", "developer", "javascript", "encryption"],
    Sports: ["tennis", "golf", "hockey", "boxing", "rugby", "skiing", "rowing", "cricket", "cycling", "fencing",
        "archery", "kabaddi", "snooker", "wrestling", "baseball", "football", "swimming", "athletics", "badminton",
        "marathon", "basketball", "volleyball", "gymnastics"],
};
const ALL_WORDS = Object.values(WORDS).flat();
const TIER = { easy: (w) => w.length <= 6, medium: (w) => w.length >= 7 && w.length <= 8, hard: (w) => w.length >= 9 };

// ===== Elements =====
const $ = (id) => document.getElementById(id);
const categorySel = $("category"), hintBtn = $("hint"), nextBtn = $("next");
const setterEl = $("setter"), setterText = $("setter_text"), secretInput = $("secret"), setterError = $("setter_error");
const playEl = $("play"), wordEl = $("word"), wrongEl = $("wrong"), statusEl = $("status"), keysEl = $("keys");
const scoreEl = $("score"), manEl = document.querySelector(".man");
const parts = [...document.querySelectorAll(".part")];

// ===== State =====
let vsComputer = true;
let difficulty = "medium";
let prevMode = "cpu";
let S = null;                                    // { word, guessed:Set, wrong:[], hints, phase }
const scores = { wins: 0, losses: 0, p1: 0, p2: 0 };
let setter = 1;                                  // 2 players: who is choosing the word (1 or 2)
const used = new Set();                          // words already shown (avoids repeats)

const lives = () => S.wrong.length + S.hints;
const isLetter = (ch) => /[a-z]/.test(ch);
const solved = () => [...S.word].every((ch) => !isLetter(ch) || S.guessed.has(ch));
const guesser = () => (setter === 1 ? 2 : 1);

function pickWord() {
    const pool = categorySel.value === "Random" ? ALL_WORDS : WORDS[categorySel.value];
    let list = pool.filter(TIER[difficulty]);
    if (!list.length) list = pool;
    let fresh = list.filter((w) => !used.has(w));
    if (!fresh.length) { list.forEach((w) => used.delete(w)); fresh = list; }
    const w = GameKit.pick(fresh);
    used.add(w);
    return w;
}

// ===== Round flow =====
function newRound() {
    S = { word: "", guessed: new Set(), wrong: [], hints: 0, phase: "guess" };
    if (vsComputer) {
        S.word = pickWord();
    } else {
        S.phase = "setup";
        setterText.textContent = `Player ${setter}: type a secret word or phrase for Player ${guesser()}`;
        setterError.textContent = "Letters, spaces and hyphens only.";
        secretInput.value = "";
    }
    render();
    if (S.phase === "setup") secretInput.focus();
}

function submitSecret() {
    if (!S || S.phase !== "setup") return;
    const w = secretInput.value.trim().toLowerCase().replace(/\s+/g, " ");
    if (!/^(?=.*[a-z].*[a-z])[a-z][a-z \-]{1,27}$/.test(w)) {
        setterError.textContent = "Use 2–28 characters: letters, spaces or hyphens (start with a letter).";
        return;
    }
    S.word = w;
    S.phase = "guess";
    secretInput.value = "";
    secretInput.blur();
    render();
}

function guess(letter) {
    if (!S || S.phase !== "guess" || S.guessed.has(letter)) return;
    S.guessed.add(letter);
    if (!S.word.includes(letter)) S.wrong.push(letter);
    afterGuess();
}

function useHint() {
    if (!S || S.phase !== "guess" || !vsComputer || lives() >= MAX - 1) return;
    const hidden = [...new Set([...S.word].filter((ch) => isLetter(ch) && !S.guessed.has(ch)))];
    if (!hidden.length) return;
    S.guessed.add(GameKit.pick(hidden));
    S.hints++;
    afterGuess();
}

function afterGuess() {
    if (solved()) endRound(true);
    else if (lives() >= MAX) endRound(false);
    render();
}

function endRound(won) {
    S.phase = "over";
    S.won = won;
    if (vsComputer) won ? scores.wins++ : scores.losses++;
    else scores[`p${won ? guesser() : setter}`]++;
}

// ===== Rendering =====
function render() {
    const playing = S.phase === "guess", over = S.phase === "over", setup = S.phase === "setup";
    setterEl.classList.toggle("gone", !setup);
    playEl.classList.toggle("gone", setup);
    categorySel.hidden = !vsComputer;
    hintBtn.classList.toggle("gone", !vsComputer);
    hintBtn.disabled = !playing || lives() >= MAX - 1;
    nextBtn.textContent = vsComputer ? "New word" : "Next round (swap roles)";
    nextBtn.disabled = !vsComputer && !over;

    // Drawing
    parts.forEach((p, i) => p.classList.toggle("show", i < lives()));
    manEl.classList.toggle("dead", over && !S.won);

    // Word
    wordEl.textContent = "";
    for (const ch of S.word) {
        const s = document.createElement("span");
        s.className = "ch";
        if (!isLetter(ch)) { s.classList.add("gap"); s.textContent = ch === "-" ? "-" : ""; }
        else if (S.guessed.has(ch) || over) {
            s.textContent = ch;
            if (over && !S.guessed.has(ch)) s.classList.add("missed");
        }
        wordEl.appendChild(s);
    }

    // Wrong letters, lives, status
    wrongEl.textContent = `Lives left: ${MAX - lives()}` + (S.wrong.length ? `  ·  Wrong: ${S.wrong.join(" ")}` : "");
    let msg = "Pick a letter (or type on your keyboard).";
    if (!vsComputer && playing) msg = `Player ${guesser()}: pick a letter.`;
    if (over) {
        const w = S.word.toUpperCase();
        if (vsComputer) msg = S.won ? `🎉 You got it! The word was ${w}.` : `💀 Out of lives. The word was ${w}.`;
        else msg = S.won ? `🎉 Player ${guesser()} guessed ${w}!` : `Player ${setter} wins: the word was ${w}.`;
    }
    statusEl.textContent = msg;

    // Keyboard
    [...keysEl.children].forEach((k) => {
        const l = k.textContent.toLowerCase();
        const done = S.guessed.has(l);
        k.disabled = !playing || done;
        k.classList.toggle("good", done && S.word.includes(l));
        k.classList.toggle("bad", done && !S.word.includes(l));
    });

    scoreEl.textContent = vsComputer
        ? `Wins: ${scores.wins}  ·  Losses: ${scores.losses}`
        : `Player 1: ${scores.p1}  ·  Player 2: ${scores.p2}`;
}

// ===== Controls =====
for (const l of "abcdefghijklmnopqrstuvwxyz") {
    const b = document.createElement("button");
    b.className = "btn key";
    b.textContent = l;
    b.addEventListener("click", () => guess(l));
    keysEl.appendChild(b);
}
["Random", ...Object.keys(WORDS)].forEach((name) => {
    const o = document.createElement("option");
    o.value = o.textContent = name;
    categorySel.appendChild(o);
});

GameKit.modeBar($("modes"), (m) => {
    vsComputer = m.vsComputer;
    difficulty = m.difficulty;
    if (m.mode !== prevMode) {                   // switching modes starts a fresh scoreboard
        prevMode = m.mode;
        Object.assign(scores, { wins: 0, losses: 0, p1: 0, p2: 0 });
        setter = 1;
    }
    newRound();
}, { modes: [["cpu", "vs Computer"], ["2p", "2 Players"]] });

categorySel.addEventListener("change", () => { categorySel.blur(); newRound(); });
nextBtn.addEventListener("click", () => {
    if (!vsComputer) setter = guesser();         // swap roles
    newRound();
});
hintBtn.addEventListener("click", useHint);
$("start").addEventListener("click", submitSecret);
document.addEventListener("keydown", (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (document.activeElement === secretInput) {
        if (e.key === "Enter") submitSecret();
        return;
    }
    if (/^[a-z]$/i.test(e.key)) {
        const tag = document.activeElement.tagName;
        if (tag === "SELECT") {                    // don't let a focused dropdown type-ahead and change itself
            e.preventDefault();
            document.activeElement.blur();
        }
        guess(e.key.toLowerCase());
    }
});

newRound();
