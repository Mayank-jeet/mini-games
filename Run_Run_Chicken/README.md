# 🐥 Run Run Chicken

A remake of the 2012 mobile classic: a cheerful side-scrolling runner where a little chick races through floating hills to reach Mama Hen. Plain HTML, CSS and JavaScript, no build step, and **no image or audio files**: the art is drawn on a canvas and the sound is synthesized.

## How to play

| Action | Touch | Keyboard |
|---|---|---|
| Jump | tap | `Space` / `↑` / `W` |
| Flap (once per jump) | tap again in the air | same key again |
| Glide (slow fall, ~1.6 s) | hold after the flap | hold the key |
| Pause | ⏸ button | `P` / `Esc` |

The chick runs on its own. Collect coins and gems, dodge hazards, grab power-ups (🛡️ shield, 🧲 magnet, 🪶 wings), beat the countdown and reach the nest.

- **3 seasons × 9 levels = 27 levels**, each season split into Easy (1-3), Medium (4-6) and Hard (7-9).
- **Stars per level:** ★ finish · ★★ 60% of coins · ★★★ 90% of coins and lose at most one life.
- **Score** = coins ×10 + gems ×100 + time bonus + life bonus. Best score, stars and time are saved in `localStorage`.
- **Unlocking:** a level opens after the one before it is finished; the next season opens after 6 levels of the previous one (`RRC.UNLOCK_SEASON_AT` in `js/data.js`). Add `?unlock=1` to the URL to open everything.
- **Accessibility:** reduce motion, high-visibility hazards (red halos), assist mode (+2 lives, +50% time), separate music/sound toggles.

| Season | Look | Special hazards |
|---|---|---|
| ☀️ Summer | golden skies, warm hills | thorn bushes, bees, rolling rocks |
| ❄️ Winter | dark blue sky, snow | slippery ice platforms (momentum), falling icicles that land as spikes, snowballs, ice birds |
| 🌧️ Monsoon | storm clouds, rain | puddles (slow you down), updraft / headwind gusts, storm crows, rolling logs |

> The season and difficulty layout come from the player's memory of the original. They are easy to change in `js/data.js` (`WORLDS`, `DIFFS`) if footage shows something different.

## Architecture (why each file exists)

```
Run_Run_Chicken/
├── index.html      page skeleton: canvas + HTML screens, HUD and overlays
├── style.css       layout and the chunky "wooden sign" look
└── js/
    ├── data.js     RULES + CONTENT: physics numbers, seasons, difficulty tiers,
    │               and the seeded level generator (RRC)
    ├── sim.js      the game engine: running, jumping, gliding, hazards, pickups,
    │               lives, checkpoints, timer, results (Sim). No drawing, no DOM
    ├── art.js      all pictures drawn with canvas calls (Art)
    ├── audio.js    synthesized sound effects and a looping tune per season (Snd)
    └── ui.js       the conductor: save data, screens, input, game loop
```

Data flow each frame: **input** (`ui.js`) → `sim.step(dt, input)` (`sim.js`) → `sim.events` become sounds and particles (`ui.js` + `audio.js`) → `Art.drawLevel(...)` paints the state (`art.js`) → HUD updates.

Why it is built this way:

- **Simulation is separate from drawing.** `sim.js` never touches the canvas, so the whole game can be played by a bot in Node. That is how every level was verified beatable.
- **Levels are generated, not hand-placed.** A seeded random number generator makes "Summer 4" identical on every device. Each gap is a *fraction of a plain jump's distance at that level's speed*, so a level can never demand an impossible jump. Quiet zones after landings and before takeoffs keep hazards fair.
- **Fixed 1/120 s physics steps** keep jumps feel identical on 60 Hz and 144 Hz screens.
- **Forgiving controls:** coyote time (jump just after leaving an edge) and input buffering (tap just before landing) make the one-button controls feel responsive.
- **Theme-aware menus.** Menu panels use the hub's CSS variables; the wooden signs and the game world are fixed art.

## Tuning knobs

| Want to change | Where |
|---|---|
| Jump height, glide time, gravity | `RRC.PHYS` in `js/data.js` |
| Level speed, length, gap sizes, hazard frequency | `generate()` and `DIFFS` in `js/data.js` |
| Lives, season unlock rule | `RRC.START_LIVES`, `RRC.UNLOCK_SEASON_AT` |
| Star thresholds, scoring | `Sim.results()` in `js/sim.js` |
| Colors of a season | `PAL` in `js/art.js` |
| Music scales and tempo | `TUNES` in `js/audio.js` |

## Run it

Open `Run_Run_Chicken/index.html` through the hub (`python -m http.server 8000` in `mini-games/`, then `/Run_Run_Chicken/`).
