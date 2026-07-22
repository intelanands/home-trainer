# Training Roadmap

The long-term plan. `data/plan.json` is what you do *this week* and changes freely
(injuries, energy, feedback). **This document is the thing that stays fixed** —
the direction, the phases, and the rules for moving between them.

Started: **19 July 2026**. Reviewed monthly against `history.jsonl`.

---

## The athlete

| | |
|---|---|
| Training at | Home — dumbbells (see below), yoga mat, stairs, chair, bench-like furniture |
| Lifestyle | Desk job, sitting most of the day |
| Body notes | Mild knock knees (genu valgum); left knee twinges on unexpected twists |
| Starting point | New to structured training. Legs and rows decent; pressing weak (incline push-ups) |
| Main goal | **Be able to jog comfortably**, without knee trouble |
| Secondary | General strength, undo desk posture, stay injury-free |

## The equipment, exactly

| Implement | Gives you (per hand) |
|---|---|
| Fixed pairs | 1 · 2.5 · **5 kg** |
| 2 rods (1.5 kg each) + disks: 4× 0.5, 4× 1.25, 4× 2.5 | 1.5 · 2.5 · 4 · 5 · 6.5 · 7.5 · 9 · **10 kg** |

Rod maths: **take the disks on one side, double it, add the rod.** Each hand gets one
disk of each size per side, so the top rung is everything loaded — 8.5 kg of plates
plus the 1.5 kg rod = 10 kg.

| Each side | Per hand | | Each side | Per hand |
|---|---|---|---|---|
| — | 1.5 | | 2.5 | 6.5 |
| 0.5 | 2.5 | | 2.5 + 0.5 | 7.5 |
| 1.25 | 4 | | 2.5 + 1.25 | 9 |
| 0.5 + 1.25 | 5 | | 2.5 + 1.25 + 0.5 | 10 |

(Rod weight **measured on a scale, 22 Jul 2026: 1.5 kg** — so the set is a standard
20 kg kit, 17 kg of plates plus two rods, and every number above is exact.)

**The working rule:** disks don't get changed mid-workout. Each session names *one*
rod setting to build beforehand (it's on the Get Ready checklist), and every
two-handed exercise uses a fixed pair. The two rods can hold different weights when
only one hand is loaded at a time.

## The constraint that shapes everything

Two-handed work is effectively capped at **5 kg per hand** (the heaviest fixed pair)
unless the session's rod setting is the matched pair, and the absolute ceiling is
**10 kg per hand**. Within a few months that stops being heavy for legs and back.
So the long-term progression is **not** "keep adding weight" — it's, in order of
preference:

1. **Add reps** within the target range
2. **Slow the lowering phase** (3 seconds down makes 5 kg feel like 8)
3. **Harder variation** — two legs → one leg, incline push-up → floor → feet elevated
4. **Add a set**
5. **Shorten rest**
6. Only then: more weight

This is why the plan drifts toward **single-leg and single-arm work** over time.
One leg at 10 kg beats two legs at 10 kg. Around Phase 3 there's an optional
decision point on buying heavier dumbbells — noted below, not assumed.

---

## The week: six days, three hard

| | | |
|---|---|---|
| **Mon** | Full Body A | strength, ~50 min |
| **Tue** | Reset — mobility & core | easy, ~20 min |
| **Wed** | Full Body B | strength, ~50 min |
| **Thu** | Easy — walk & calves | easy, ~30 min |
| **Fri** | Full Body C | strength, ~50 min |
| **Sat** | Easy — long walk | easy, ~35 min |
| **Sun** | Rest | genuinely nothing |

Adopted 22 Jul 2026. The reasoning matters, because the obvious alternative — six
hard days on a body-part split — is a trap here:

- A body-part split trains each muscle **once** a week. Full-body three times a week
  trains everything **three** times. For a beginner, frequency is the bigger lever,
  so the "more days" version would actually deliver less.
- Six distinct hard days can't be filled with two dumbbells, a chair and some stairs.
- Six hard days as a beginner is how people get injured or quit.

Easy days exist to build the habit ("I move every day except Sunday" is a far easier
rule than remembering which days are on), to undo desk sitting, and to build the
walking and calf base that jogging needs. **They must stay easy** — if an easy day
starts feeling like a workout, cut it back. Hard days hard, easy days easy.

## Phases

### Phase 1 — Groundwork · Weeks 1–4 (19 Jul – 15 Aug 2026)

**Purpose:** learn the movements, find the right working weights, make the habit
stick. Not about getting strong yet.

- 3 strength sessions (Mon / Wed / Fri), supersets, ~50 min
- 3 easy days (Tue / Thu / Sat), ~20–35 min — added 22 Jul
- Every session ends with a hip-flexor stretch (desk-job counterweight)
- Log every session; tap 😌 / 💪 / 🥵 honestly — that's what drives adjustments

**Leaving Phase 1 when:** 10+ strength sessions logged, all working weights settled
(mostly 💪 taps), knee quiet through normal training.

### Phase 2 — Build + Run Prep · Weeks 5–12 (Aug – mid Oct 2026)

**Purpose:** get genuinely stronger, and build the specific tissue that makes
jogging safe. This is the longest and most important phase.

- Same six-day structure; weights climb toward the 10 kg cap on the strength days
- **Calf capacity** is the priority — the #1 injury site for new runners.
  Progression: two-leg raises → single-leg → single-leg with a dumbbell
- **Push-up ladder:** incline height comes down step by step toward the floor
- Glute-med work (side leg raises, single-leg bridges) stays in every week —
  this is the knock-knee correction and it never graduates out
- **Saturday's long walk becomes the walk-jog day** once the readiness gates below
  are met — same slot, jogging intervals spliced into the walk, starting at
  1 min jog / 2 min walk × 6. No new day needed; the on-ramp is already in place.

- **Deferred to this phase: Strava sync.** Samsung Health syncs to Strava (Services
  tab), and Strava has a public OAuth API — so walks and runs can log themselves with
  distance, pace and heart rate. Deliberately not built in Phase 1 (July 2026): while
  walks are the whole cardio plan, "walked 30 min" tells the program everything it
  needs. Build it when jogging starts and pace/distance actually drive decisions.
  Design agreed: user registers a personal app at strava.com/settings/api, refresh
  token stored `chmod 600` in `/opt/home-trainer-data/`, a stdlib-only fetcher on a
  daily cron appending to `strava.jsonl` — same shape as the history API. Note Samsung
  Health → Strava carries *activities* only; steps, sleep and resting HR stay behind.

**Readiness gates for starting to jog** (all four, no exceptions):

- [ ] Knee quiet for 2–4 consecutive weeks of training
- [ ] 15+ single-leg calf raises, controlled, both sides
- [ ] Single-leg glute bridges without the hip dropping
- [ ] Comfortable 30-minute brisk walk (this is Saturday's session — the gate tests itself)

**Leaving Phase 2 when:** jogging 3 × 5 min within a walk-jog session, pain-free.

### Phase 3 — Run + Maintain Strength · Months 4–6 (Oct 2026 – Jan 2027)

**Purpose:** running becomes a real activity; strength work shifts to supporting it.

- 2 strength sessions + 2 runs + 1–2 easy days per week (Sunday still off)
- Walk-jog progresses toward **20–30 minutes of continuous easy jogging**
  (raise jogging time by roughly 10% a week — the classic mistake is going faster
  instead of longer; go longer, stay slow)
- Strength emphasis moves to single-leg work, since bilateral lifts have outgrown
  10 kg dumbbells
- **Optional decision point:** if you're enjoying this and want to keep getting
  stronger, the cheap upgrade is **more 2.5 kg disks** for the existing rods (not new
  dumbbells) — or a loadable backpack for squats and step-ups. Not required; the plan
  works without it, just with slower strength gains after the 10 kg ceiling.

### Phase 4 — Consolidate · Month 7+ (Feb 2027 →)

Pick a direction based on what you actually enjoy by then:

- **Running-first** → a 5K goal, 3 runs + 1–2 strength sessions
- **Strength-first** → back to 3 strength days, running kept for fitness
- **Balanced** → 2 + 2, indefinitely sustainable

No need to decide now. Reassess when you get here.

---

## Rules that don't change

These hold across every phase — the daily plan may flex, these don't:

1. **Knees out.** Every squat, lunge, step-up: knees track over the middle toe.
   Glute-med work stays in the program permanently.
2. **Joint pain ≠ muscle burn.** Muscle effort is fine; anything sharp, or *inside*
   the knee, means stop that set and report it.
3. **Warm up, cool down.** Never skip the openers or the hip-flexor stretch.
4. **Log everything, tap honestly.** A 🥵 tap is data, not failure. Under-reporting
   difficulty makes the plan wrong.
5. **Progress one thing at a time.** Never add weight *and* reps *and* a set at once.
6. **Deload when it stops being fun.** Every 6–8 weeks, or any week where everything
   feels heavy: same sessions, ~60% of the weights. Fatigue masks fitness.
7. **Missed a week?** Restart at ~80% of previous weights and rebuild over two
   sessions. Never resume where you left off after a break.
8. **Life reschedules the plan, not the reverse.** Sessions can shift days; just keep
   roughly 48 hours between *strength* sessions. Easy days can go anywhere, or be
   skipped without guilt — missing them costs nothing but the habit.

## Progression rules (how weights actually change)

Applied by Claude when reviewing history — see `CLAUDE.md` for the mechanics:

| What the log shows | What happens next |
|---|---|
| All target reps + 😌 easy | +1 kg (or +1–2 reps for bodyweight / easier variation) |
| All target reps + 💪 just right | Hold; progress if it repeats |
| Missed reps, or 🥵 hard twice running | Drop 1 kg or reduce reps |
| Any knee/back complaint | Substitute the movement, note it here |

Leg-exercise progression stays deliberately conservative until the knee has been
symptom-free for a sustained stretch.

## Red flags — stop and see a professional

Not things to train through, and beyond what Claude can assess:

- Knee: swelling, locking, giving way, or pain that sharpens week over week
- Back: pain shooting down a leg, numbness, or tingling
- Any pain that's worse at rest than during movement
- Chest pain, unusual breathlessness, or dizziness during exercise

---

## Progress log

Short entries, newest last. Updated at each review.

- **19 Jul 2026** — Started. First session (Full Body C), 65 min, 5 kg throughout.
  Push-ups needed the knee variant.
- **20 Jul 2026** — Full Body A, 60 min, all feel-taps 💪. Self-corrected press up to
  5 kg and squat down to 5 kg; both reflected in the plan. Disclosed knock knees →
  knees-out cues added, glute-med work promoted to 3 sets. Push-ups regressed to
  incline push-ups (a real ladder, unlike knee push-ups).
- **22 Jul 2026** — Back tweaked outside training (moved wrong on Tuesday). Session B
  swapped bent-over row → supported one-arm row, Russian twist → dead bug for the
  time being. Roadmap written. Exact dumbbell inventory captured: sessions now name a
  single rod setting up front, two-handed work uses fixed pairs, and the app's ±
  buttons snap to buildable weights only. Rod weighed at 1.5 kg, confirming the ladder.
  **Week restructured to six days, three hard** — three easy days added (mobility &
  core, walk & calves, long walk) after the user asked about training six days a week.
  Strength stimulus unchanged; habit and jogging base gained.
