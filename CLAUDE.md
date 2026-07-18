# Home Trainer — Claude working notes

Personal single-user workout PWA. Vanilla HTML/CSS/JS, no build step. Served at **https://gym.recat.in** from the user's own Ubuntu server (the Tally Connector ERP box, `administrator@192.168.1.13`) via nginx + Cloudflare Tunnel. The user trains at home: 2× dumbbells up to 10 kg, yoga mat, stairs, chair, bench-like furniture.

## The core workflow

The user asks for program changes in chat ("make Wednesday harder", "swap X, my shoulder hurts", "here's my exported history — adjust the plan"). You edit **`data/plan.json`**, commit, push, then deploy:

```
git push && ssh administrator@192.168.1.13 "git -C /opt/home-trainer pull"
```

Updates are live immediately (nginx sends `Cache-Control: no-cache` for app files; the app self-reloads when a new service worker version arrives). `.claude/settings.local.json` (gitignored) allows the ssh command without prompts.

## Hosting details

- Server checkout: `/opt/home-trainer` (clone of this repo, pulled to deploy)
- nginx site: `/etc/nginx/sites-available/home-trainer` (from `deploy/setup-gym.sh`) — no-cache for app files, 30-day immutable for `img/exercises/`, hidden files denied
- Cloudflare Tunnel ingress: `gym.recat.in → localhost:80` in `/etc/cloudflared/config.yml` (tunnel `tally-portal`, id 410a8965…). DNS is a manual CNAME in the recat.in zone → `<tunnel-id>.cfargotunnel.com` (the tunnel cert only covers catapharma.com, so `cloudflared tunnel route dns` cannot manage recat.in)
- Full recreation: run `deploy/setup-gym.sh` on the server
- GitHub Pages hosting was retired in July 2026 (repo remains the source of truth)

## plan.json contract

- `schedule`: weekday keys `mon`..`sun` → session key or `"rest"`
- `sessions.<key>`: `{ title, equipment?, blocks: [...] }`
  - `equipment`: strings shown on the pre-workout "Get ready" checklist (mat, chair, stairs…). Dumbbell weights are derived automatically from the blocks — don't list them here. Keep this in sync when changing a session's exercises.
- block: `{ exerciseId, sets, reps | durationSec, weightKg?, restSec, note? }`
  - `reps` → rep-based set (user taps done); `durationSec` → timed set (countdown + beeps)
  - `weightKg` is **per dumbbell**
  - `note` is shown prominently in the player ("per side", "use stairs", form cues)
  - `animate?` (boolean) overrides photo animation. Default: rep-based blocks animate, timed blocks show a still frame (static holds like Plank flicker confusingly when alternated). Set `animate: true` on a timed-but-dynamic exercise (e.g. timed mountain climbers).

## Exercise library

- `data/exercises.json`: vendored subset (~47) of free-exercise-db (public domain). Fields: id, name, level, equipment, category, primaryMuscles, secondaryMuscles, instructions[], images[] (repo-relative).
- Images live in `img/exercises/<id>/0.jpg,1.jpg` (start/end pose; player alternates them). The dataset has exactly 2 images per exercise — no more exist upstream. For movements 2 frames can't explain, each exercise card auto-links a YouTube search ("<name> exercise form"); no per-exercise config needed.
- **Adding a new exercise**: pick an id from https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/dist/exercises.json, append the entry to `data/exercises.json` (rewrite `images` paths to `img/exercises/...`), and download its images from `https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/<id>/<n>.jpg`. Only use equipment the user has (body only / dumbbell / chair / stairs / bench).

## Code map

- `js/app.js` — data loading, Today/History views, navigation (`App`)
- `js/player.js` — workout state machine (`Player`), `esc()` HTML-escape helper
- `js/timer.js` — `Countdown`, `Sound` (WebAudio beeps), `WakeLock`
- `js/history.js` — localStorage log (`trainer.history.v1`), export/copy
- `sw.js` — bump `VERSION` when shell files (html/css/js) change, otherwise clients keep the old cached shell. Bump `APP_VERSION` in `js/app.js` to the same value (it's displayed in the Today footer so the user can see which version their phone runs). The app auto-reloads once when a new SW takes control (unless mid-workout), so updates apply on the next launch, not the second.

## Conventions

- No frameworks, no dependencies, no build step — keep it that way.
- All strings interpolated into `innerHTML` go through `esc()`.
- Paths are relative (`./...`) so the app works under a GitHub Pages project path.
