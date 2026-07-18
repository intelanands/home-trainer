/* Workout player: steps through blocks/sets, runs timers, records results.
   Rendered content comes from the repo's own plan.json / exercises.json,
   but everything interpolated into markup is escaped anyway via esc(). */

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
  blockIndex: 0,
  setIndex: 0,
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
    this.blockIndex = 0;
    this.setIndex = 0;
    this.results = session.blocks.map(b => ({
      exerciseId: b.exerciseId,
      name: exercisesById[b.exerciseId]?.name || b.exerciseId,
      sets: [],
    }));
    this.startedAt = new Date();
    this.onExit = onExit;
    WakeLock.acquire();
    Sound.ensure(); // unlock audio inside the user gesture that started the workout
    this.showExercise();
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

  block() { return this.session.blocks[this.blockIndex]; },
  exercise() { return this.exercises[this.block().exerciseId] || null; },

  totalSets() {
    return this.session.blocks.reduce((n, b) => n + b.sets, 0);
  },
  doneSets() {
    let n = 0;
    for (let i = 0; i < this.blockIndex; i++) n += this.session.blocks[i].sets;
    return n + this.setIndex;
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

  showExercise() {
    this._cleanupScreen();
    const b = this.block();
    const ex = this.exercise();
    const isTimed = b.durationSec != null;
    const img = ex?.images?.[0] || '';
    const muscles = ex ? ex.primaryMuscles.join(', ') : '';

    this.root.innerHTML = `
      ${this._header(this.session.title)}
      <div class="player-card">
        <h2>${esc(ex?.name || b.exerciseId)}</h2>
        <div class="muscles">${esc(muscles)}</div>
        <img id="p-img" class="anim-frame" src="${esc(img)}" alt="${esc(ex?.name || '')}">
        <div class="set-info">Set ${this.setIndex + 1} of ${b.sets}</div>
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
      </div>`;

    this._bindQuit();
    this._startAnim(document.getElementById('p-img'), ex?.images);
    document.getElementById('p-skip').onclick = () => this._nextBlock();

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
    this.results[this.blockIndex].sets.push(setResult);
    this.setIndex += 1;
    const b = this.block();
    const lastSetOfBlock = this.setIndex >= b.sets;
    const lastBlock = this.blockIndex >= this.session.blocks.length - 1;

    if (lastSetOfBlock && lastBlock) return this.showDone();
    this.showRest(b.restSec || 60, lastSetOfBlock);
  },

  _nextBlock() {
    this._cleanupScreen();
    this.blockIndex += 1;
    this.setIndex = 0;
    if (this.blockIndex >= this.session.blocks.length) return this.showDone();
    this.showExercise();
  },

  showRest(seconds, advanceBlock) {
    const nextBlock = advanceBlock ? this.session.blocks[this.blockIndex + 1] : this.block();
    const nextEx = this.exercises[nextBlock.exerciseId];
    const nextLabel = advanceBlock
      ? `Next: ${nextEx?.name || nextBlock.exerciseId}`
      : `Next: set ${this.setIndex + 1} of ${nextBlock.sets} — ${nextEx?.name || nextBlock.exerciseId}`;

    this.root.innerHTML = `
      ${this._header('Rest')}
      <div class="rest-screen">
        <h2>Rest</h2>
        <div id="p-timer" class="timer-display resting">${this._fmt(seconds)}</div>
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
    const timerEl = document.getElementById('p-timer');
    const proceed = () => {
      this._cleanupScreen();
      if (advanceBlock) this._nextBlock(); else this.showExercise();
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
    this.root.innerHTML = `
      ${this._header('Finished')}
      <div class="done-screen">
        <div class="big">🎉</div>
        <h2>Workout complete!</h2>
        <p>${esc(this.session.title)} — ${mins} min</p>
        <textarea id="p-note" placeholder="How did it feel? (optional — Claude reads this when adjusting your plan)"></textarea>
        <button class="btn" id="p-save">Save workout</button>
      </div>`;
    this._bindQuit();
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
