# 🎮 Mini Games Hub

A collection of small browser games behind one searchable hub. Built with plain **HTML, CSS and JavaScript**: no frameworks, no build step, no dependencies to install. Play solo against the computer or with friends on the same device.

**▶ Live site:** `https://YOUR-SITE.vercel.app` <!-- replace with your deployed URL -->

<!-- Add a screenshot or GIF of the hub here, e.g. ![Hub](docs/hub.png) -->

## Games

| Game | Modes | Computer opponent |
|---|---|---|
| ❌⭕ **Tic Tac Toe** | 2 players, vs Computer | Easy / Medium / Hard (Hard is unbeatable) |
| 🔴🟡 **Connect 4** | 2 players, vs Computer | Easy / Medium / Hard (search-based AI) |
| ✊✋✌️ **Rock Paper Scissors** | vs Computer | Random |
| 🔥 **Nim** | 2 players, vs Computer | Easy / Medium / Hard (Hard uses the winning strategy) |
| 🐍🪜 **Snake & Ladder** | Friends, vs Computer | Yes |
| 🎲 **Ludo** | 2–4 players, any mix of humans and computers | Easy / Medium / Hard |

## Features

- **Search and filters:** find games by name, description or tag, with live result counts. Press `/` to jump to the search box.
- **137 color themes:** dark and light presets, plus custom background and accent pickers. Your choice carries into every game and is remembered between visits.
- **Responsive:** every game works on phones and desktops.
- **Fair computer players:** the computer plays by the same rules as you and sees the same board.
- **Easy to extend:** a shared stylesheet, a small helper library and a starter template make a new game mostly a matter of writing its logic.

## Run locally

No install needed. From the project folder, start any static server and open it in a browser:

```bash
# Python
python -m http.server 8000

# or Node
npx serve .
```

Then visit `http://localhost:8000`. (Opening `index.html` directly also works for most things, but a local server matches how the deployed site behaves.)

## Project structure

```
mini-games/
├── index.html          hub page (search, filters, theme panel)
├── hub.css / hub.js    hub styling and logic
├── games.js            the game list: the only file to edit when adding a game
├── theme.js            shared theme engine (used by the hub and every game)
├── shared/
│   ├── base.css        shared styles: tokens, buttons, cards, status box, etc.
│   ├── game-kit.js     helpers: sleep, rand, pick, playsWell, modeBar
│   └── README.md       conventions and checklist for new games
├── _template/          starter files to copy for a new game
└── Tic_Tac_Toe/ Connect_4/ Rock_Paper_Scissors/ Nim_Game/ Snake_Ladder/ Ludo/
    └── index.html, style.css, <game>.js   (plus images where needed)
```

Each game is a standalone page in its own folder and shares its look and behavior through `shared/`.

## Adding a game

1. Copy `_template/` to a new folder (for example `Chess/`) and rename `game.js` to match the game.
2. Write the board, styles and logic. Page layout, buttons, the turn/result box and the 2-player / vs-Computer bar come from `shared/`.
3. Add one object to the `GAMES` array in `games.js`:

   ```js
   {
       id: "chess",
       title: "Chess",
       icon: "♟️",
       desc: "One short sentence about the game.",
       path: "Chess/index.html",
       tags: ["Board", "Strategy", "vs Computer"],
   }
   ```

The hub card, search and tag filters pick it up automatically.

### Theming rules

So every game follows the selected theme:

- Style boards, cards, panels and buttons with the theme variables: `--bg`, `--surface`, `--surface-hover`, `--border`, `--text`, `--muted`, `--accent`, `--on-accent`.
- For tints, use `color-mix(in srgb, var(--accent) 15%, var(--surface))`.
- Hardcode a color only when it carries gameplay meaning (player pieces, dice, X and O).

The full checklist is in [`shared/README.md`](shared/README.md).

## Deployment

It's a static site, so any static host works. On Vercel, import the repository with **Framework Preset: Other** and leave the build and output settings empty. Netlify, Cloudflare Pages and GitHub Pages (branch `main`, folder `/`) work the same way. All paths are relative, so it also runs under a subpath such as `/mini-games/`.

## Tech

Vanilla JavaScript (ES6+), CSS custom properties and `color-mix()`, with optional [Font Awesome](https://fontawesome.com/) icons loaded from a CDN.

## Roadmap

- More games, using the template
- Hub favorites and recently played
- Optional sound effects

---

## Author

### Mayank Jeet

- GitHub: [@Mayank-jeet](https://github.com/Mayank-jeet)
- LinkedIn: [Mayank Jeet](https://www.linkedin.com/in/mayank-jeet-211583364/)
  
