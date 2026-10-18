// Shared theme engine: loaded by the hub and by every game.
(function () {
    const KEY = "mini-games-theme";
    const DEFAULT = { bg: "#0f1220", accent: "#7c8cff" };
    const PRESETS = {
        Midnight: { bg: "#0f1220", accent: "#7c8cff" },
        Forest:   { bg: "#0d1a13", accent: "#4ade80" },
        Sunset:   { bg: "#1f1118", accent: "#fb923c" },
        Ocean:    { bg: "#071a26", accent: "#22d3ee" },
        Rose:     { bg: "#1d0f1a", accent: "#f472b6" },
        Charcoal: { bg: "#161616", accent: "#a3e635" },
        AMOLED:   { bg: "#000000", accent: "#22d3ee" },
        Dracula:  { bg: "#282a36", accent: "#bd93f9" },
        Nord:     { bg: "#2e3440", accent: "#88c0d0" },
        Cyberpunk:{ bg: "#0d0221", accent: "#ff2a6d" },
        Coffee:   { bg: "#1c1410", accent: "#d4a373" },
        Crimson:  { bg: "#1a0b0e", accent: "#ef4444" },
        Solarized:{ bg: "#002b36", accent: "#b58900" },
        Light:    { bg: "#f4f5ff", accent: "#4f46e5" },
        Lavender: { bg: "#f3efff", accent: "#7c3aed" },
        Mint:     { bg: "#eefaf4", accent: "#059669" },
        Peach:    { bg: "#fff3ea", accent: "#ea580c" },
        Sky:      { bg: "#eaf5ff", accent: "#0284c7" },

        // ---- Space & night ----
        "Deep Space":        { bg: "#05060f", accent: "#a78bfa" },
        "Galaxy":            { bg: "#0b0820", accent: "#7b6cf6" },
        "Nebula":            { bg: "#1a0f2e", accent: "#ff6bd6" },
        "Eclipse":           { bg: "#0a0a0a", accent: "#ffcc00" },
        "Starry Night":      { bg: "#0b1026", accent: "#f4d35e" },
        "Twilight":          { bg: "#1a1b3a", accent: "#f78fb3" },
        "Dusk":              { bg: "#231942", accent: "#e0b1cb" },
        "Dawn":              { bg: "#2b1d3a", accent: "#ffb88c" },
        "Midnight Blue":     { bg: "#0a1128", accent: "#5bc0eb" },
        "Obsidian":          { bg: "#0a0a12", accent: "#8b5cf6" },
        "Onyx":              { bg: "#0d0d0d", accent: "#e5e5e5" },
        "Mars":              { bg: "#260d0a", accent: "#ff6b4a" },

        // ---- Neon & retro ----
        "Neon Tokyo":        { bg: "#10002b", accent: "#ff00a8" },
        "Synthwave":         { bg: "#1a0933", accent: "#f72585" },
        "Vaporwave":         { bg: "#1b0a2e", accent: "#ff71ce" },
        "Blade Runner":      { bg: "#0b1320", accent: "#ff9f1c" },
        "Matrix":            { bg: "#020d04", accent: "#00ff41" },
        "Hacker":            { bg: "#0a0a0a", accent: "#39ff14" },
        "Terminal":          { bg: "#0c0c0c", accent: "#ffb000" },
        "Gameboy":           { bg: "#0f380f", accent: "#9bbc0f" },
        "Mario":             { bg: "#1b1030", accent: "#e52521" },
        "Pac-Man":           { bg: "#00001a", accent: "#ffeb3b" },
        "Tetris":            { bg: "#0b0b2b", accent: "#00f0f0" },
        "Carbon":            { bg: "#101010", accent: "#ff4655" },

        // ---- Fire & warm ----
        "Lava":              { bg: "#1a0500", accent: "#ff5a1f" },
        "Volcano":           { bg: "#1c0a08", accent: "#ff7849" },
        "Ember":             { bg: "#1b0f0a", accent: "#ffa24d" },
        "Magma":             { bg: "#200505", accent: "#ff3d00" },
        "Rust":              { bg: "#1f0f08", accent: "#d9480f" },
        "Copper":            { bg: "#1c110c", accent: "#e08a52" },
        "Bronze":            { bg: "#1a130d", accent: "#cd7f32" },
        "Sandstorm":         { bg: "#251d14", accent: "#e9c46a" },
        "Desert Night":      { bg: "#1d1410", accent: "#f4a261" },
        "Mustard":           { bg: "#1f1a05", accent: "#facc15" },
        "Gold":              { bg: "#1a1505", accent: "#fbbf24" },
        "Honey":             { bg: "#211607", accent: "#f59e0b" },

        // ---- Coffee & earth ----
        "Caramel":           { bg: "#231710", accent: "#e09f3e" },
        "Chocolate":         { bg: "#1f130e", accent: "#c68b59" },
        "Espresso":          { bg: "#140c08", accent: "#d6a77a" },
        "Mocha":             { bg: "#1e1511", accent: "#b08968" },
        "Cosmic Latte Dark": { bg: "#1b1a17", accent: "#ffd8a8" },

        // ---- Pinks & purples ----
        "Ruby":              { bg: "#1f0710", accent: "#e11d48" },
        "Wine":              { bg: "#1e0a14", accent: "#be185d" },
        "Berry":             { bg: "#1a0a1f", accent: "#d946ef" },
        "Grape":             { bg: "#160b26", accent: "#a855f7" },
        "Amethyst":          { bg: "#1b1230", accent: "#c084fc" },
        "Coral Reef":        { bg: "#0f1f2b", accent: "#ff7f7f" },
        "Flamingo":          { bg: "#240c1a", accent: "#ff8fab" },
        "Bubblegum":         { bg: "#1d1030", accent: "#ff9ee5" },
        "Candy Night":       { bg: "#1f0f2a", accent: "#ff6ec7" },
        "Cotton Candy Dark": { bg: "#1a1a2e", accent: "#f9a8d4" },

        // ---- Blues & water ----
        "Indigo Night":      { bg: "#0b0f2e", accent: "#6366f1" },
        "Cobalt":            { bg: "#05102b", accent: "#3b82f6" },
        "Sapphire":          { bg: "#06122b", accent: "#60a5fa" },
        "Deep Sea":          { bg: "#031a1f", accent: "#2dd4bf" },
        "Lagoon":            { bg: "#04202a", accent: "#38bdf8" },
        "Arctic":            { bg: "#0b1c26", accent: "#7dd3fc" },
        "Glacier":           { bg: "#0e1d2b", accent: "#a5f3fc" },
        "Aurora":            { bg: "#07141a", accent: "#5eead4" },
        "Northern Lights":   { bg: "#0a1620", accent: "#34d399" },

        // ---- Greens & nature ----
        "Teal Dream":        { bg: "#062524", accent: "#14b8a6" },
        "Emerald":           { bg: "#04201a", accent: "#10b981" },
        "Jungle":            { bg: "#0a1f0f", accent: "#84cc16" },
        "Moss":              { bg: "#141c10", accent: "#a3b18a" },
        "Pine":              { bg: "#0c1f1a", accent: "#52b788" },
        "Mint Night":        { bg: "#0a1f1c", accent: "#6ee7b7" },
        "Lime Soda":         { bg: "#101a08", accent: "#bef264" },
        "Olive":             { bg: "#1a1a0a", accent: "#cddc39" },

        // ---- Greys & steel ----
        "Slate":             { bg: "#1e293b", accent: "#94a3b8" },
        "Steel":             { bg: "#14181f", accent: "#8fa3b8" },
        "Graphite":          { bg: "#1c1c1e", accent: "#0a84ff" },
        "Zenburn":           { bg: "#3f3f3f", accent: "#dfaf8f" },

        // ---- Editor classics ----
        "Monokai":           { bg: "#272822", accent: "#a6e22e" },
        "Gruvbox":           { bg: "#282828", accent: "#fabd2f" },
        "Tokyo Night":       { bg: "#1a1b26", accent: "#7aa2f7" },
        "One Dark":          { bg: "#282c34", accent: "#61afef" },
        "Ayu Dark":          { bg: "#0f1419", accent: "#ffb454" },
        "Palenight":         { bg: "#292d3e", accent: "#c792ea" },
        "Oceanic":           { bg: "#1b2b34", accent: "#6699cc" },
        "Cobalt2":           { bg: "#193549", accent: "#ffc600" },
        "Material":          { bg: "#263238", accent: "#80cbc4" },
        "Catppuccin Mocha":  { bg: "#1e1e2e", accent: "#cba6f7" },
        "Rosé Pine":         { bg: "#191724", accent: "#ebbcba" },
        "Everforest":        { bg: "#2d353b", accent: "#a7c080" },
        "Kanagawa":          { bg: "#1f1f28", accent: "#957fb8" },
        "Poimandres":        { bg: "#1b1e28", accent: "#5de4c7" },
        "Night Owl":         { bg: "#011627", accent: "#82aaff" },
        "Shades of Purple":  { bg: "#2d2b55", accent: "#fad000" },
        "Horizon":           { bg: "#1c1e26", accent: "#e95678" },
        "Nightfox":          { bg: "#192330", accent: "#719cd6" },

        // ---- Light themes ----
        "Snow":              { bg: "#ffffff", accent: "#2563eb" },
        "Paper":             { bg: "#faf7f0", accent: "#b45309" },
        "Cream":             { bg: "#fdf6e3", accent: "#cb4b16" },
        "Sakura":            { bg: "#fff1f5", accent: "#db2777" },
        "Cotton Candy":      { bg: "#fdf2f8", accent: "#c026d3" },
        "Lemonade":          { bg: "#fffbe6", accent: "#ca8a04" },
        "Sunshine":          { bg: "#fff8db", accent: "#ea580c" },
        "Apricot":           { bg: "#fff1e6", accent: "#e8590c" },
        "Coral Light":       { bg: "#fff0ee", accent: "#e11d48" },
        "Strawberry Milk":   { bg: "#fff0f3", accent: "#e63946" },
        "Lilac":             { bg: "#f5f0ff", accent: "#8b5cf6" },
        "Periwinkle":        { bg: "#eceeff", accent: "#5b6cff" },
        "Baby Blue":         { bg: "#eef7ff", accent: "#2563eb" },
        "Ice":               { bg: "#f0fbff", accent: "#0891b2" },
        "Aqua":              { bg: "#e8fbfa", accent: "#0d9488" },
        "Seafoam":           { bg: "#ecfdf5", accent: "#047857" },
        "Spring":            { bg: "#f2fce8", accent: "#4d7c0f" },
        "Matcha":            { bg: "#f1f5e9", accent: "#5b7f2b" },
        "Sage":              { bg: "#f1f4ee", accent: "#4f6f52" },
        "Sand":              { bg: "#f6efe6", accent: "#a16207" },
        "Latte":             { bg: "#f5ebe0", accent: "#7f5539" },
        "Clay":              { bg: "#f4e8e1", accent: "#b4532a" },
        "Stone":             { bg: "#f4f4f2", accent: "#57534e" },
        "Silver":            { bg: "#f1f5f9", accent: "#475569" },
        "Cloud":             { bg: "#f8fafc", accent: "#0ea5e9" },
        "Mono":              { bg: "#f5f5f5", accent: "#111111" },
        "Tulip":             { bg: "#fff0f6", accent: "#d6336c" },
        "Daisy":             { bg: "#fffdf0", accent: "#f59f00" },
        "Blueberry Milk":    { bg: "#edf2ff", accent: "#3b5bdb" },
    };

    const valid = (h) => /^#[0-9a-f]{6}$/i.test(h || "");
    const toRgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
    const toHex = (c) => "#" + c.map((v) => Math.round(v).toString(16).padStart(2, "0")).join("");
    const mix = (a, b, t) => {
        const A = toRgb(a), B = toRgb(b);
        return toHex(A.map((v, i) => v + (B[i] - v) * t));
    };
    const lum = (h) => {
        const [r, g, b] = toRgb(h);
        return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    };

    let active = DEFAULT;

    function apply(theme) {
        const bg = valid(theme.bg) ? theme.bg.toLowerCase() : DEFAULT.bg;
        const accent = valid(theme.accent) ? theme.accent.toLowerCase() : DEFAULT.accent;
        const dark = lum(bg) < 0.5;
        const text = dark ? "#eef0ff" : "#1b1f3b";
        const surface = dark ? mix(bg, "#ffffff", 0.07) : mix(bg, "#ffffff", 0.7);
        const border = dark ? mix(bg, "#ffffff", 0.16) : mix(bg, "#000000", 0.14);
        const vars = {
            "--bg": bg,
            "--surface": surface,
            "--surface-hover": mix(surface, accent, 0.18),
            "--border": border,
            "--text": text,
            "--muted": mix(text, bg, 0.45),
            "--accent": accent,
            "--on-accent": lum(accent) > 0.5 ? "#0f1220" : "#ffffff",
        };
        const root = document.documentElement.style;
        Object.keys(vars).forEach((k) => root.setProperty(k, vars[k]));
        active = { bg, accent };
    }

    function save(theme) {
        try { localStorage.setItem(KEY, JSON.stringify(theme)); } catch (e) {}
    }

    // Order: URL (?bg=...&accent=...) > localStorage > default
    function load() {
        const p = new URLSearchParams(location.search);
        const bg = "#" + (p.get("bg") || "");
        const accent = "#" + (p.get("accent") || "");
        if (valid(bg) && valid(accent)) return { bg, accent, fromUrl: true };
        try {
            const s = JSON.parse(localStorage.getItem(KEY));
            if (s && valid(s.bg) && valid(s.accent)) return s;
        } catch (e) {}
        return DEFAULT;
    }

    // Query string to attach to game links so the theme follows the player
    const query = (t) => "?bg=" + t.bg.slice(1) + "&accent=" + t.accent.slice(1);

    const initial = load();
    apply(initial);
    if (initial.fromUrl) save(active);

    window.MiniTheme = { PRESETS, DEFAULT, apply, save, query, get: () => active, isDark: (h) => lum(h) < 0.5 };
})();
