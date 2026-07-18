# Home Trainer

A personal, AI-backed home workout companion. Static web app (no backend, no build step) — the "AI" is [Claude Code](https://claude.com/claude-code): the training program lives in `data/plan.json` and is designed/adjusted by chatting with Claude, which edits the file and pushes.

## Features

- **Today view** — shows the scheduled session for the current weekday (or rest day)
- **Workout player** — one exercise at a time with a 2-frame photo animation and step-by-step instructions, set/rep counter with adjustable reps & weight, countdown timers with beeps for timed holds, auto-advancing rest timers, screen wake lock
- **History** — every finished workout is logged locally (localStorage) and can be exported/copied as JSON to share back with Claude for plan adjustments
- **PWA** — installable on a phone home screen, works offline after first load

## Data

Exercise names, instructions, and images are vendored from
[free-exercise-db](https://github.com/yuhonas/free-exercise-db) (public domain, Unlicense).

## Run locally

Any static file server works, e.g.:

```
python -m http.server 8123
```

then open http://localhost:8123
