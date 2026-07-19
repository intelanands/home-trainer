/* Workout player: steps through blocks/sets, runs timers, records results.
   Rendered content comes from the repo's own plan.json / exercises.json,
   but everything interpolated into markup is escaped anyway via esc().

   Blocks that share a `group` value (and are adjacent in the plan) run as a
   SUPERSET: their sets interleave round-robin (A1 set1, A2 set1, A1 set2 …)
   so one muscle rests while the other works. The whole session is
   precomputed into `steps` = [{b, s, lastOfBlock}]. */

function esc(v) {
  return String(v ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

const Player = {
  root: null,
  session: null,
  sessionKey: null,
  exercises: null,   // id -> exercise
  steps: [],
  stepIndex: 0,
  results: [],
  startedAt: null,
  onExit: null,
  _anim: null,
  _countdown: null,

  start(sessionKey, session, exercisesById, onExit) {
    this.root = document.getElementById('player-content');
    this.sessionKey = sessionKey;
    this.session = session;
    this.exercises = exercisesById;
    this.steps = this._buildSteps();
    this.stepIndex = 0;
    this.results = session.blocks.map(b => ({
      exerciseId: b.exerciseId,
      name: exercisesById[b.exerciseId]?.name || b.exerciseId,
      sets: [],
    }));
    this.startedAt = new Date();
    this.onExit = onExit;
    WakeLock.acquire();
    Sound.ensure(); // unlock audio inside the user gesture that started the workout
    this.showReadyCheck();
  },

  _buildSteps() {
    const blocks = this.session.blocks;
    const steps = [];
    let i = 0;
    while (i < blocks.length) {
      const g = blocks[i].group;
      let j = i + 1;
      while (g != null && j < blocks.length && blocks[j].group === g) j++;
      const members = [];
      for (let k = i; k < j; k++) members.push(k);
      const maxSets = Math.max(...members.map(k => blocks[k].sets));
      for (let s = 0; s < maxSets; s++) {
        for (const k of members) {
          if (s < blocks[k].sets) steps.push({ b: k, s });
        }
      }
      i = j;
    }
    const lastStepFor = {};
    steps.forEach((st, idx) => { lastStepFor[st.b] = idx; });
    steps.forEach((st, idx) => { st.lastOfBlock = lastStepFor[st.b] === idx; });
    return steps;
  },

  step() { return this.steps[this.stepIndex]; },
  block() { return this.session.blocks[this.step().b]; },
  exercise() { return this.exercises[this.block().exerciseId] || null; },

  totalSets() { return this.steps.length; },
  doneSets() { return this.stepIndex; },

  /* Equipment needed for this session: dumbbell weights are derived from the
     blocks; everything else comes from session.equipment in plan.json. */
  _equipmentList() {
    const items = [];
    const weights = [...new Set(
      this.session.blocks.filter(b => b.weightKg != null).map(b => b.weightKg)
    )].sort((a, b) => a - b);
    if (weights.length) items.push(`Dumbbells — ${weights.join(', ')} kg (per hand)`);
    for (const item of this.session.equipment || []) items.push(item);
    return items;
  },

  showReadyCheck() {
    this._cleanupScreen();
    const items = this._equipmentList();
    if (!items.length) return this.showExercise();

    this.root.innerHTML = `
      ${this._header(this.session.title)}
      <div class="player-card">
        <h2>Get ready</h2>
        <div class="muscles">You'll need for this session:</div>
        <ul class="gear-list">
          ${items.map(it => `
            <li class="gear-item"><span class="gear-check">○</span><span>${esc(it)}</span></li>`).join('')}
        </ul>
        <div class="player-actions">
          <button class="btn" id="p-ready">All set — start ✓</button>
        </div>
        <button class="btn-ghost" id="p-back" style="margin-top:8px">← Back</button>
      </div>`;

    this._bindQuit();
    this.root.querySelectorAll('.gear-item').forEach(li => {
      li.onclick = () => {
        li.classList.toggle('checked');
        li.querySelector('.gear-check').textContent =
          li.classList.contains('checked') ? '✓' : '○';
      };
    });
    document.getElementById('p-ready').onclick = () => this.showExercise();
    document.getElementById('p-back').onclick = () => this.quit();
  },

  _cleanupScreen() {
    if (this._anim) { clearInterval(this._anim); this._anim = null; }
    if (this._countdown) { this._countdown.stop(); this._countdown = null; }
  },

  quit() {
    this._cleanupScreen();
    WakeLock.release();
    this.onExit?.();
  },

  _header(label) {
    return `
      <div class="player-top">
        <button class="btn-ghost" id="p-quit">✕ Quit</button>
        <span class="player-progress">${esc(label)}</span>
      </div>
      <div class="progress-bar"><div style="width:${Math.round(100 * this.doneSets() / this.totalSets())}%"></div></div>`;
  },

  _bindQuit() {
    document.getElementById('p-quit').onclick = () => {
      if (confirm('Quit this workout? Progress will not be saved.')) this.quit();
    };
  },

  _startAnim(imgEl, images) {
    if (!imgEl || !images || images.length < 2) return;
    let i = 0;
    this._anim = setInterval(() => {
      i = (i + 1) % images.length;
      imgEl.src = images[i];
    }, 1000);
  },

  _instructionsHtml(ex) {
    if (!ex?.instructions?.length) return '';
    return `
      <details class="instructions">
        <summary>How to do it</summary>
        <ol>${ex.instructions.map(s => `<li>${esc(s)}</li>`).join('')}</ol>
      </details>`;
  },

  /* The 2-frame photos can't explain every movement — link a YouTube search
     for the exercise so a proper demo is one tap away. */
  _videoLinkHtml(name) {
    const q = encodeURIComponent(`${name} exercise form`);
    return `
      <a class="video-link" href="https://www.youtube.com/results?search_query=${esc(q)}"
         target="_blank" rel="noopener">▷ Watch video</a>`;
  },

  showExercise() {
    this._cleanupScreen();
    const st = this.step();
    const b = this.block();
    const ex = this.exercise();
    const isTimed = b.durationSec != null;
    // Static holds (timed sets) show a single still frame — alternating photos
    // of a near-identical pose reads as flicker. block.animate overrides.
    const animate = b.animate ?? !isTimed;
    // Still frames must show the HELD pose: photo 0 is the rest/start
    // position, photo 1 the working position.
    const img = (!animate && ex?.images?.[1]) || ex?.images?.[0] || '';
    const muscles = ex ? ex.primaryMuscles.join(', ') : '';
    const pairInfo = b.group ? ' · superset' : '';

    this.root.innerHTML = `
      ${this._header(this.session.title)}
      <div class="player-card">
        <h2>${esc(ex?.name || b.exerciseId)}</h2>
        <div class="muscles">${esc(muscles)}</div>
        <img id="p-img" class="anim-frame" src="${esc(img)}" alt="${esc(ex?.name || '')}">
        <div class="set-info">Set ${st.s + 1} of ${b.sets}${pairInfo}</div>
        ${b.note ? `<div class="set-note">${esc(b.note)}</div>` : ''}
        ${isTimed ? `
          <div id="p-timer" class="timer-display working">${this._fmt(b.durationSec)}</div>
          <div class="player-actions">
            <button class="btn" id="p-start">Start ${b.durationSec}s</button>
          </div>
        ` : `
          <div class="set-target">${b.reps} reps</div>
          <div class="stepper-row">
            <div class="stepper">
              <button id="reps-minus">−</button>
              <div><div class="value" id="reps-val">${b.reps}</div><label>reps done</label></div>
              <button id="reps-plus">+</button>
            </div>
            ${b.weightKg != null ? `
            <div class="stepper">
              <button id="wt-minus">−</button>
              <div><div class="value" id="wt-val">${b.weightKg}</div><label>kg</label></div>
              <button id="wt-plus">+</button>
            </div>` : ''}
          </div>
          <div class="player-actions">
            <button class="btn" id="p-done">Set done ✓</button>
          </div>
        `}
        <button class="btn-ghost" id="p-skip" style="margin-top:8px">Skip exercise →</button>
        ${this._instructionsHtml(ex)}
        ${this._videoLinkHtml(ex?.name || b.exerciseId)}
      </div>`;

    this._bindQuit();
    if (animate) this._startAnim(document.getElementById('p-img'), ex?.images);
    document.getElementById('p-skip').onclick = () => this._skipBlock();

    if (isTimed) {
      const timerEl = document.getElementById('p-timer');
      document.getElementById('p-start').onclick = (e) => {
        e.target.disabled = true;
        e.target.textContent = 'Go!';
        this._countdown = new Countdown({
          seconds: b.durationSec,
          onTick: (rem) => { timerEl.textContent = this._fmt(rem); },
          onDone: () => this._completeSet({ durationSec: b.durationSec }),
        });
        this._countdown.start();
      };
    } else {
      let reps = b.reps;
      let wt = b.weightKg;
      const repsVal = document.getElementById('reps-val');
      document.getElementById('reps-minus').onclick = () => { reps = Math.max(0, reps - 1); repsVal.textContent = reps; };
      document.getElementById('reps-plus').onclick = () => { reps += 1; repsVal.textContent = reps; };
      if (b.weightKg != null) {
        const wtVal = document.getElementById('wt-val');
        document.getElementById('wt-minus').onclick = () => { wt = Math.max(0, wt - 1); wtVal.textContent = wt; };
        document.getElementById('wt-plus').onclick = () => { wt += 1; wtVal.textContent = wt; };
      }
      document.getElementById('p-done').onclick = () => {
        const set = { reps };
        if (b.weightKg != null) set.weightKg = wt;
        this._completeSet(set);
      };
    }
  },

  _completeSet(setResult) {
    this._cleanupScreen();
    const st = this.step();
    const b = this.block();
    this.results[st.b].sets.push(setResult);
    const feelFor = st.lastOfBlock ? st.b : null;
    this.stepIndex += 1;
    if (this.stepIndex >= this.steps.length) return this.showDone();
    this.showRest(b.restSec || 60, feelFor);
  },

  _skipBlock() {
    this._cleanupScreen();
    const skipB = this.step().b;
    this.steps = this.steps.filter((st, idx) => idx < this.stepIndex || st.b !== skipB);
    // re-mark lastOfBlock (the skipped block's earlier flag may have moved)
    const lastStepFor = {};
    this.steps.forEach((st, idx) => { lastStepFor[st.b] = idx; });
    this.steps.forEach((st, idx) => { st.lastOfBlock = lastStepFor[st.b] === idx; });
    if (this.stepIndex >= this.steps.length) return this.showDone();
    this.showExercise();
  },

  /* feelFor: block index to rate ("how did that exercise feel?"), shown after
     an exercise's final set. One tap, optional — feeds weight progression. */
  showRest(seconds, feelFor) {
    const next = this.step();
    const nextBlock = this.session.blocks[next.b];
    const nextEx = this.exercises[nextBlock.exerciseId];
    const nextLabel = `Next: set ${next.s + 1} of ${nextBlock.sets} — ${nextEx?.name || nextBlock.exerciseId}`;
    const feelName = feelFor != null ? this.results[feelFor].name : '';

    this.root.innerHTML = `
      ${this._header('Rest')}
      <div class="rest-screen">
        <h2>Rest</h2>
        <div id="p-timer" class="timer-display resting">${this._fmt(seconds)}</div>
        ${feelFor != null ? `
        <div class="feel-block">
          <div class="feel-label">How was ${esc(feelName)}?</div>
          <div class="feel-row">
            <button class="feel-btn" data-feel="easy">😌 Easy</button>
            <button class="feel-btn" data-feel="ok">💪 Just right</button>
            <button class="feel-btn" data-feel="hard">🥵 Hard</button>
          </div>
        </div>` : ''}
        <div class="next-up">
          <img class="exercise-thumb" src="${esc(nextEx?.images?.[0] || '')}" alt="">
          <div>
            <div class="name">${esc(nextLabel)}</div>
          </div>
        </div>
        <button class="btn btn-secondary" id="p-add15">+15 sec</button>
        <button class="btn" id="p-skiprest">Skip rest →</button>
      </div>`;

    this._bindQuit();
    if (feelFor != null) {
      this.root.querySelectorAll('.feel-btn').forEach(btn => {
        btn.onclick = () => {
          this.results[feelFor].feel = btn.dataset.feel;
          this.root.querySelectorAll('.feel-btn').forEach(x => x.classList.remove('sel'));
          btn.classList.add('sel');
        };
      });
    }
    const timerEl = document.getElementById('p-timer');
    const proceed = () => {
      this._cleanupScreen();
      this.showExercise();
    };
    this._countdown = new Countdown({
      seconds,
      onTick: (rem) => { timerEl.textContent = this._fmt(rem); },
      onDone: proceed,
    });
    this._countdown.start();
    document.getElementById('p-add15').onclick = () => this._countdown.addSeconds(15);
    document.getElementById('p-skiprest').onclick = proceed;
  },

  showDone() {
    this._cleanupScreen();
    const mins = Math.max(1, Math.round((Date.now() - this.startedAt.getTime()) / 60000));
    const lastIdx = this.results.length - 1;
    const lastDone = this.results[lastIdx]?.sets.length > 0 ? lastIdx : null;
    this.root.innerHTML = `
      ${this._header('Finished')}
      <div class="done-screen">
        <div class="big">🎉</div>
        <h2>Workout complete!</h2>
        <p>${esc(this.session.title)} — ${mins} min</p>
        ${lastDone != null ? `
        <div class="feel-block">
          <div class="feel-label">How was ${esc(this.results[lastDone].name)}?</div>
          <div class="feel-row">
            <button class="feel-btn" data-feel="easy">😌 Easy</button>
            <button class="feel-btn" data-feel="ok">💪 Just right</button>
            <button class="feel-btn" data-feel="hard">🥵 Hard</button>
          </div>
        </div>` : ''}
        <textarea id="p-note" placeholder="How did it feel? (optional — Claude reads this when adjusting your plan)"></textarea>
        <button class="btn" id="p-save">Save workout</button>
      </div>`;
    this._bindQuit();
    if (lastDone != null) {
      this.root.querySelectorAll('.feel-btn').forEach(btn => {
        btn.onclick = () => {
          this.results[lastDone].feel = btn.dataset.feel;
          this.root.querySelectorAll('.feel-btn').forEach(x => x.classList.remove('sel'));
          btn.classList.add('sel');
        };
      });
    }
    document.getElementById('p-save').onclick = () => {
      History.add({
        date: this.startedAt.toISOString(),
        sessionKey: this.sessionKey,
        sessionTitle: this.session.title,
        durationMin: mins,
        exercises: this.results.filter(r => r.sets.length > 0),
        note: document.getElementById('p-note').value.trim() || undefined,
      });
      WakeLock.release();
      this.onExit?.();
    };
  },

  _fmt(sec) {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return m > 0 ? `${m}:${String(s).padStart(2, '0')}` : `${s}`;
  },
};
