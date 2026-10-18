# Adding a game (checklist)

1. Copy `_template/` to a new folder, e.g. `Chess/`, and rename `game.js` to match the game (`chess.js`; update the `<script>` tag).
2. Fill in `index.html`, `style.css`, and the JS. Keep the head links to `../shared/base.css`, `../theme.js` and `../shared/game-kit.js`.
3. Add ONE object to the `GAMES` array in `games.js` (id, title, icon, desc, path, and `tags`; reuse existing tags so the hub's filter chips stay tidy). Nothing else in the hub changes.
4. Update the root `README.md`: add a row to the **Games** table (modes + computer levels) and add the new folder to the **Project structure** list.

## Rules that keep every game themeable
- Style boards, cards, panels and buttons with `var(--bg | --surface | --surface-hover | --border | --text | --muted | --accent | --on-accent)`.
- Themed tints: `color-mix(in srgb, var(--accent) 15%, var(--surface))` (or `transparent` for glows/hovers).
- Hardcode a color only when it has gameplay meaning (player pieces, dice, X/O).
- Never hardcode black/white text on a themed surface (use `var(--text)` / `var(--muted)`; to "clear" a color set `style.color=''`).
- Images on transparent backgrounds must stay readable on light AND dark themes.

## What the shared files give you
- `base.css`: theme fallbacks, reset, header (`.game_title`), `main`, `.btn` (+ `.active`, `.btn-sm`), `.mode_bar`, `.select`, `.card`, `.status`, `.muted`.
- Visibility: `.hidden` = invisible, keeps its space; `.gone` = removed from layout.
- `game-kit.js`: `GameKit.sleep / rand / pick / playsWell / modeBar`.
- Game-specific CSS/JS stays in the game's own folder; if two games need the same new thing, move it to `shared/`.
