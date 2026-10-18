/* ==========================================================
   shared/game-kit.js  -  small helpers shared by every game.
   Load it in <head> BEFORE the game's own script:
       <script src="../shared/game-kit.js"></script>
   ========================================================== */
const GameKit = {
    /* await GameKit.sleep(500) */
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),

    /* GameKit.rand(3) -> 0, 1 or 2 */
    rand: (n) => Math.floor(Math.random() * n),

    /* GameKit.pick(["a","b"]) -> random item */
    pick: (items) => items[Math.floor(Math.random() * items.length)],

    /* Should the computer play its BEST move this turn?
       hard = always, medium = 60% of the time, easy = never (play randomly). */
    playsWell: (difficulty) =>
        difficulty === "hard" || (difficulty === "medium" && Math.random() < 0.6),

    /* Builds the "2 Players / vs Computer (+ difficulty)" bar inside `container`.
       onChange(state) fires when the mode or difficulty changes: usually reset the game there.
       Returns a live state object: { mode, difficulty, vsComputer }.

       options.modes      [["2p","2 Players"],["cpu","vs Computer"]]  ("cpu" shows the difficulty menu)
       options.levels     [["easy","Easy"],["medium","Medium"],["hard","Hard"]]  (null = no menu)
       options.difficulty starting difficulty, default "medium"          */
    modeBar(container, onChange, options = {}) {
        const modes = options.modes || [["2p", "2 Players"], ["cpu", "vs Computer"]];
        const levels = options.levels === undefined
            ? [["easy", "Easy"], ["medium", "Medium"], ["hard", "Hard"]]
            : options.levels;
        const state = {
            mode: modes[0][0],
            difficulty: options.difficulty || "medium",
            get vsComputer() { return this.mode === "cpu"; },
        };
        container.classList.add("mode_bar");

        let select = null;
        const sync = () => { if (select) select.hidden = !state.vsComputer; };

        const buttons = modes.map(([value, label]) => {
            const btn = document.createElement("button");
            btn.className = "btn btn-sm mode_btn" + (value === state.mode ? " active" : "");
            btn.textContent = label;
            btn.addEventListener("click", () => {
                state.mode = value;
                buttons.forEach((b) => b.classList.toggle("active", b === btn));
                sync();
                onChange(state);
            });
            container.appendChild(btn);
            return btn;
        });

        if (levels) {
            select = document.createElement("select");
            select.className = "select";
            levels.forEach(([value, label]) => {
                const opt = document.createElement("option");
                opt.value = value;
                opt.textContent = label;
                opt.selected = value === state.difficulty;
                select.appendChild(opt);
            });
            select.addEventListener("change", () => {
                state.difficulty = select.value;
                onChange(state);
            });
            container.appendChild(select);
        }
        sync();
        return state;
    },
};
