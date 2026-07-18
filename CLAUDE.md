# Home Trainer — Claude working notes

Personal single-user workout PWA. Vanilla HTML/CSS/JS, no build step, deployed to GitHub Pages straight from `main`. The user trains at home: 2× dumbbells up to 10 kg, yoga mat, stairs, chair, bench-like furniture.

## The core workflow

The user asks for program changes in chat ("make Wednesday harder", "swap X, my shoulder hurts", "here's my exported history — adjust the plan"). You edit **`data/plan.json`**, commit, push. GitHub Pages redeploys automatically; the phone app fetches the new plan (service worker uses network-first for `data/`).

## plan.json contract

- `schedule`: weekday keys `mon`..`sun` → session key or `"rest"`
- `sessions.<key>`: `{ title, blocks: [...] }`
- block: `{ exerciseId, sets, reps | durationSec, weightKg?, restSec, note? }`
  - `reps` → rep-based set (user taps done); `durationSec` → timed set (countdown + beeps)
  - `weightKg` is **per dumbbell**
  - `note` is shown prominently in the player ("per side", "use stairs", form cues)

## Exercise library

- `data/exercises.json`: vendored subset (~47) of free-exercise-db (public domain). Fields: id, name, level, equipment, category, primaryMuscles, secondaryMuscles, instructions[], images[] (repo-relative).
- Images live in `img/exercises/<id>/0.jpg,1.jpg` (start/end pose; player alternates them).
- **Adding a new exercise**: pick an id from https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/dist/exercises.json, append the entry to `data/exercises.json` (rewrite `images` paths to `img/exercises/...`), and download its images from `https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/<id>/<n>.jpg`. Only use equipment the user has (body only / dumbbell / chair / stairs / bench).

## Code map

- `js/app.js` — data loading, Today/History views, navigation (`App`)
- `js/player.js` — workout state machine (`Player`), `esc()` HTML-escape helper
- `js/timer.js` — `Countdown`, `Sound` (WebAudio beeps), `WakeLock`
- `js/history.js` — localStorage log (`trainer.history.v1`), export/copy
- `sw.js` — bump `VERSION` when shell files (html/css/js) change, otherwise clients keep the old cached shell

## Conventions

- No frameworks, no dependencies, no build step — keep it that way.
- All strings interpolated into `innerHTML` go through `esc()`.
- Paths are relative (`./...`) so the app works under a GitHub Pages project path.
