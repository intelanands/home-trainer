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
- Full recreation: run `deploy/setup-gym.sh` on the server. ⚠ Pull FIRST, then run — the script pulls in step 1 and bash reads the file incrementally, so running an outdated copy executes a mix of old steps (bit us in July 2026): `git -C /opt/home-trainer pull && bash /opt/home-trainer/deploy/setup-gym.sh`
- GitHub Pages hosting was retired in July 2026 (repo remains the source of truth)
- **Auth**: full login wall at nginx (user declined Cloudflare Access/Google as too much setup). `auth_request` → API `/api/auth` validates the `gympin` cookie (or `X-Gym-Pin` header); unauthenticated requests for ANY path get `login.html` (public, served as 200 with marker header `X-Gym-Login`). `login.html` → POST `/api/login` → 180-day HttpOnly cookie `gymtok` = sha256(pin:session-gen) — a token, never the PIN. **Sign out everywhere**: `ssh administrator@192.168.1.13 "date +%s%N > /opt/home-trainer-data/session-gen.txt"` (invalidates all cookies instantly; PIN unchanged; no restart). PIN lives in `/opt/home-trainer-data/pin.txt` (chmod 600, read per-request → rotation = edit the file, no restart). Brute force: wrong guesses get 0.5s delay, 30/hour lockout; absent-PIN requests don't count (so anonymous visits can't lock the user out) and a valid PIN is never throttled. Lost PIN: `ssh administrator@192.168.1.13 "cat /opt/home-trainer-data/pin.txt"`. Verification from outside: `curl https://gym.recat.in/<anything>` returns the login page unless `-H "X-Gym-Pin: <pin>"` is sent. The SW never caches `/api/`, `login.html`, or any `X-Gym-Login` response. The app's launch gate (`init()` → GET `/api/auth`) bounces signed-out devices to the login page even though the cached shell opens offline-first; offline launches run from cache. Note: a signed-out device cannot fetch SW updates (they 401 into login HTML) — it updates after the next sign-in.

## ⚠️ Shared server — rules learned the hard way

The gym app is a **guest** on the production ERP box. It shares nginx (:80) and the Cloudflare tunnel with `portal.catapharma.com`, `test.catapharma.com`, and the Docker sidecars (status/errors/pass subdomains).

**July 2026 incident:** enabling the gym's nginx site made *every* catapharma.com URL serve the gym app. Cause: the ERP site uses `server_name _` (matches nothing — it worked only as the implicit default server), and nginx picks the implicit default alphabetically — `home-trainer` sorts before `tally-connector`, so the gym silently became the default for all unmatched hostnames. Fixed by adding `default_server` to the ERP site's `listen` directive on the live server. `setup-gym.sh` now aborts if no other site holds `default_server`, and regression-tests portal + unknown hostnames after any reload.

Rules for any future server-side change:
1. **Never take `default_server`.** The gym site must only ever match `server_name gym.recat.in` exactly.
2. **After touching nginx or the tunnel, regression-test the co-hosted sites** (`portal.catapharma.com` expects 302 to /login; an unknown Host must also hit the ERP, not the gym) — not just the site you changed.
3. The tunnel ingress file (`/etc/cloudflared/config.yml`) is first-match and shared — add/remove only the `gym.recat.in` entry, keep it above the trailing `http_status:404` fallback, and remember a cloudflared restart briefly blips ALL subdomains.
4. The ERP repo's `deploy/nginx.conf` template is the rebuild source for the ERP site — it must keep `default_server` (PR'd in July 2026); if a rebuilt server ever loses it, `setup-gym.sh`'s guard will catch it.

## plan.json contract

- `schedule`: weekday keys `mon`..`sun` → session key or `"rest"`
- `sessions.<key>`: `{ title, equipment?, blocks: [...] }`
  - `equipment`: strings shown on the pre-workout "Get ready" checklist (mat, chair, stairs…). Dumbbell weights are derived automatically from the blocks — don't list them here. Keep this in sync when changing a session's exercises.
- block: `{ exerciseId, sets, reps | durationSec, weightKg?, restSec, note?, group? }`
  - `group`: adjacent blocks sharing a group value run as a SUPERSET — sets interleave round-robin (A1 s1, A2 s1, A1 s2 …). Pair non-competing muscles only (push+pull, upper+lower, arms+core). Warm-ups and cooldowns stay ungrouped.
  - `reps` → rep-based set (user taps done); `durationSec` → timed set (countdown + beeps)
  - `weightKg` is **per dumbbell**
  - `note` is shown prominently in the player ("per side", "use stairs", form cues)
  - `animate?` (boolean) overrides photo animation. Default: rep-based blocks animate, timed blocks show a still frame (static holds like Plank flicker confusingly when alternated). Set `animate: true` on a timed-but-dynamic exercise (e.g. timed mountain climbers).

## Weight progression (how to use history feedback)

After each exercise's last set the app asks one tap: easy / ok / hard → stored as `feel` on that exercise in history (`/opt/home-trainer-data/history.jsonl`). When reviewing history or asked to adjust:
- all target reps hit + `feel: easy` → +1 kg next time (or +1-2 reps for bodyweight)
- target reps hit + `ok` → keep, progress after it repeats
- missed reps or `hard` on 2+ sessions → drop 1 kg or reduce reps
Sanity-bound by the knee memory: leg-exercise progression stays conservative until the knee is symptom-free.

## Exercise library

- `data/exercises.json`: vendored subset (~47) of free-exercise-db (public domain). Fields: id, name, level, equipment, category, primaryMuscles, secondaryMuscles, instructions[], images[] (repo-relative).
- Images live in `img/exercises/<id>/0.jpg,1.jpg` (start/end pose; player alternates them). The dataset has exactly 2 images per exercise — no more exist upstream. For movements 2 frames can't explain, each exercise card auto-links a YouTube search ("<name> exercise form"); no per-exercise config needed.
- **Adding a new exercise**: pick an id from https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/dist/exercises.json, append the entry to `data/exercises.json` (rewrite `images` paths to `img/exercises/...`), and download its images from `https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/<id>/<n>.jpg`. Only use equipment the user has (body only / dumbbell / chair / stairs / bench).

## Code map

- `js/app.js` — data loading, Today/History views, navigation (`App`)
- `js/player.js` — workout state machine (`Player`), `esc()` HTML-escape helper
- `js/timer.js` — `Countdown`, `Sound` (WebAudio beeps), `WakeLock`
- `js/history.js` — localStorage log (`trainer.history.v1`), export/copy, auto-sync to server (POST `./api/history`; entries carry `synced:false` until confirmed, retried on every app launch)
- `deploy/history-api.py` + `home-trainer-api.service` — stdlib-only sync API on the server (127.0.0.1:8091 behind nginx `location = /api/history`). Data: `/opt/home-trainer-data/history.jsonl` (outside the checkout; survives deploys; deduped by entry `date`). **To review the user's workout history, read it directly:** `ssh administrator@192.168.1.13 "cat /opt/home-trainer-data/history.jsonl"` — no need to ask for an export. Watch the per-workout `note` field for knee comments (see memory).
- `sw.js` — bump `VERSION` when shell files (html/css/js) change, otherwise clients keep the old cached shell. Bump `APP_VERSION` in `js/app.js` to the same value (it's displayed in the Today footer so the user can see which version their phone runs). The app auto-reloads once when a new SW takes control (unless mid-workout), so updates apply on the next launch, not the second.

## Conventions

- No frameworks, no dependencies, no build step — keep it that way.
- All strings interpolated into `innerHTML` go through `esc()`.
- Paths are relative (`./...`) so the app works under a GitHub Pages project path.
