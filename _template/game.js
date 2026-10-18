/* Game logic. Helpers available from ../shared/game-kit.js:
   GameKit.sleep(ms) | GameKit.rand(n) | GameKit.pick(array)
   GameKit.playsWell(difficulty) | GameKit.modeBar(container, onChange, options) */

let vsComputer = false;
let difficulty = "medium";
let gameId = 0;          // bump on reset so late computer moves can detect they are stale
let locked = false;      // true while the computer is "thinking"
let gameOver = false;

const statusBox = document.querySelector("#status");
const resetBtn = document.querySelector("#reset");

function showStatus(text) {
    statusBox.textContent = text;
    statusBox.classList.remove("hidden");
}

function resetGame() {
    gameId++;
    locked = false;
    gameOver = false;
    statusBox.classList.add("hidden");
    // TODO: clear the board / restore the starting position
}

async function computerMove() {
    const id = gameId;
    locked = true;
    await GameKit.sleep(500);
    if (id !== gameId) return;      // game was reset while thinking
    // TODO: choose and play a move. Use GameKit.playsWell(difficulty) to
    //       decide between the best move and a random one.
    locked = false;
}

// Remove if the game has no computer opponent
GameKit.modeBar(document.querySelector(".mode_bar"), (mode) => {
    vsComputer = mode.vsComputer;
    difficulty = mode.difficulty;
    resetGame();
});

resetBtn.addEventListener("click", resetGame);
