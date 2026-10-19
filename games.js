// ===== THE ONLY FILE YOU EDIT TO ADD A GAME =====
// One object per game:
//   id    unique, kebab-case            title  card heading
//   icon  emoji(s)                      desc   one short sentence
//   path  "Folder_Name/index.html"      tags   used by the hub's search + filter chips
//
// Reuse existing tags where you can so the chips stay tidy. Used so far:
//   Board, Strategy, Puzzle, Dice, Casual, Word, Multiplayer, vs Computer
const GAMES = [
    {
        id: "tic-tac-toe",
        title: "Tic Tac Toe",
        icon: "❌⭕",
        desc: "Classic 3x3 grid. Line up three in a row to win.",
        path: "Tic_Tac_Toe/index.html",
        tags: ["Board", "Strategy", "Multiplayer", "vs Computer"],
    },
    {
        id: "connect-4",
        title: "Connect 4",
        icon: "🔴🟡",
        desc: "Drop discs into the grid and connect four in a line.",
        path: "Connect_4/index.html",
        tags: ["Board", "Strategy", "Multiplayer", "vs Computer"],
    },
    {
        id: "rock-paper-scissors",
        title: "Rock Paper Scissors",
        icon: "✊✋✌️",
        desc: "Pick your move and beat the computer.",
        path: "Rock_Paper_Scissors/index.html",
        tags: ["Casual", "vs Computer"],
    },
    {
        id: "nim-game",
        title: "Nim Game",
        icon: "🔥",
        desc: "Take matchsticks from the rows. Think ahead to win.",
        path: "Nim_Game/index.html",
        tags: ["Strategy", "Puzzle", "Multiplayer", "vs Computer"],
    },
    {
        id: "snake-ladder",
        title: "Snake & Ladder",
        icon: "🐍🪜",
        desc: "Race to 100. Climb ladders, dodge snakes. Play friends or the computer.",
        path: "Snake_Ladder/index.html",
        tags: ["Board", "Dice", "Multiplayer", "vs Computer"],
    },
    {
        id: "ludo",
        title: "Ludo",
        icon: "🎲🔴🟢",
        desc: "Roll a 6, race your four tokens home and send rivals back. 2-4 players, with optional computers.",
        path: "Ludo/index.html",
        tags: ["Board", "Dice", "Multiplayer", "vs Computer"],
    },
    {
        id: "chess",
        title: "Chess",
        icon: "♞♚",
        desc: "Full chess rules with castling, en passant and promotion. Play a friend or the computer.",
        path: "Chess/index.html",
        tags: ["Board", "Strategy", "Multiplayer", "vs Computer"],
    },
    {
        id: "hangman",
        title: "Hangman",
        icon: "🔤🪢",
        desc: "Guess the word before the drawing is complete. Pick a category or challenge a friend.",
        path: "Hangman/index.html",
        tags: ["Word", "Casual", "Multiplayer", "vs Computer"],
    },
    {
        id: "minesweeper",
        title: "Minesweeper",
        icon: "💣🚩",
        desc: "Clear the field without hitting a mine. Three sizes, flags, chording and best times.",
        path: "Minesweeper/index.html",
        tags: ["Puzzle", "Strategy", "Casual"],
    },
    {
        id: "memory-match",
        title: "Memory Match",
        icon: "🃏🍎",
        desc: "Flip cards and find the pairs. Play solo, with a friend, or against a computer with a memory.",
        path: "Memory_Match/index.html",
        tags: ["Puzzle", "Casual", "Multiplayer", "vs Computer"],
    },
];
