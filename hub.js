// The GAMES list lives in games.js (loaded before this file).

const home = document.getElementById("home");
const player = document.getElementById("player");
const grid = document.getElementById("game-grid");
const frame = document.getElementById("game-frame");
const playerTitle = document.getElementById("player-title");
const newTabLink = document.getElementById("new-tab");
const searchInput = document.getElementById("search");
const tagBar = document.getElementById("tag-bar");
const countEl = document.getElementById("result-count");
const emptyEl = document.getElementById("empty");

// ===== Search + tag filter =====
const filter = { text: "", tag: "All" };

function matches(game) {
    const tags = game.tags || [];
    if (filter.tag !== "All" && !tags.includes(filter.tag)) return false;
    const text = filter.text.trim().toLowerCase();
    if (!text) return true;
    return [game.title, game.desc, ...tags].join(" ").toLowerCase().includes(text);
}

// Rebuilds the cards. Called on every filter or theme change, so links always
// carry the current theme (?bg=...&accent=...) and match the visible games.
function render() {
    const q = MiniTheme.query(MiniTheme.get());
    const list = GAMES.filter(matches);
    grid.textContent = "";
    list.forEach((game) => {
        const card = document.createElement("a");
        card.className = "game-card";
        card.href = encodeURI(game.path) + q; // encodeURI handles spaces in folder names
        card.target = "_blank";
        card.rel = "noopener";
        card.innerHTML = `
            <div class="game-icon">${game.icon}</div>
            <h2>${game.title}</h2>
            <p>${game.desc}</p>
            <span class="play-label">Play</span>
        `;
        grid.appendChild(card);
    });
    countEl.textContent = `${list.length} of ${GAMES.length} games`;
    emptyEl.classList.toggle("hidden", list.length > 0);
}

function buildTagChips() {
    const tags = [...new Set(GAMES.flatMap((g) => g.tags || []))].sort();
    ["All", ...tags].forEach((tag) => {
        const b = document.createElement("button");
        b.className = "tag" + (tag === filter.tag ? " active" : "");
        b.textContent = tag;
        b.addEventListener("click", () => {
            filter.tag = tag;
            [...tagBar.children].forEach((c) => c.classList.toggle("active", c === b));
            render();
        });
        tagBar.appendChild(b);
    });
}

searchInput.addEventListener("input", () => {
    filter.text = searchInput.value;
    render();
});
document.addEventListener("keydown", (e) => {
    // "/" jumps to the search box (unless you are already typing somewhere)
    if (e.key === "/" && !/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName)) {
        e.preventDefault();
        searchInput.focus();
    }
});

// ===== Leftover player view + hash routing (unused; cards open in a new tab) =====
function showHome() {
    frame.src = "about:blank"; // stops the game and frees it
    player.classList.add("hidden");
    home.classList.remove("hidden");
    document.title = "Mini Games Hub";
}

function showGame(game) {
    const url = encodeURI(game.path); // handles the space in "Connect 4"
    frame.src = url;
    newTabLink.href = url;
    playerTitle.textContent = game.title;
    home.classList.add("hidden");
    player.classList.remove("hidden");
    document.title = `${game.title} | Mini Games Hub`;
}

function route() {
    const id = location.hash.slice(1);
    const game = GAMES.find((g) => g.id === id);
    game ? showGame(game) : showHome();
}

document.getElementById("back-btn").addEventListener("click", () => {
    location.hash = "";
});
window.addEventListener("hashchange", route);

buildTagChips();

// ===== Theme picker =====
const swatches = document.getElementById("theme-swatches");
const pickBg = document.getElementById("pick-bg");
const pickAccent = document.getElementById("pick-accent");

function setTheme(t) {
    MiniTheme.apply(t);
    const cur = MiniTheme.get();
    MiniTheme.save(cur);
    pickBg.value = cur.bg;
    pickAccent.value = cur.accent;
    [...swatches.children].forEach((s) =>
        s.classList.toggle("active", s.dataset.bg === cur.bg && s.dataset.accent === cur.accent)
    );
    render(); // refreshes every card link with the new theme
}

["Dark", "Light"].forEach((group) => {
    const h = document.createElement("h4");
    h.className = "theme-group";
    h.textContent = group;
    swatches.appendChild(h);
    Object.entries(MiniTheme.PRESETS)
        .filter(([, t]) => MiniTheme.isDark(t.bg) === (group === "Dark"))
        .forEach(([name, t]) => {
            const b = document.createElement("button");
            b.className = "swatch";
            b.setAttribute("aria-label", name + " theme");
            b.dataset.bg = t.bg;
            b.dataset.accent = t.accent;
            b.innerHTML = `<span class="chip" style="background:linear-gradient(135deg, ${t.bg} 50%, ${t.accent} 50%)"></span><span>${name}</span>`;
            b.addEventListener("click", () => setTheme(t));
            swatches.appendChild(b);
        });
});

// Slide-in panel open/close
const panel = document.getElementById("theme-panel");
const overlay = document.getElementById("theme-overlay");
function toggleThemePanel(open) {
    panel.classList.toggle("open", open);
    overlay.classList.toggle("show", open);
}
document.getElementById("theme-btn").addEventListener("click", () => toggleThemePanel(true));
document.getElementById("theme-close").addEventListener("click", () => toggleThemePanel(false));
overlay.addEventListener("click", () => toggleThemePanel(false));
document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") toggleThemePanel(false);
});
[pickBg, pickAccent].forEach((el) =>
    el.addEventListener("input", () => setTheme({ bg: pickBg.value, accent: pickAccent.value }))
);
setTheme(MiniTheme.get()); // also does the first render()
route();
