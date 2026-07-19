/* App shell: loads data, renders Today & History views, handles navigation.
   All values interpolated into innerHTML templates are escaped via esc()
   (defined in player.js), including user-entered history notes. */

const APP_VERSION = 'v8'; // keep in sync with VERSION in sw.js

const App = {
  plan: null,
  exercisesById: {},

  async init() {
    try {
      const [plan, exercises] = await Promise.all([
        fetch('./data/plan.json').then(r => r.json()),
        fetch('./data/exercises.json').then(r => r.json()),
      ]);
      this.plan = plan;
      for (const ex of exercises) this.exercisesById[ex.id] = ex;
    } catch (e) {
      document.getElementById('today-content').textContent =
        'Could not load workout data. Check data/plan.json and data/exercises.json.';
      return;
    }

    document.querySelectorAll('.nav-btn').forEach(btn => {
      btn.onclick = () => this.show(btn.dataset.nav);
    });
    document.getElementById('btn-export').onclick = () => History.download();
    document.getElementById('btn-copy').onclick = async (e) => {
      await History.copyToClipboard();
      e.target.textContent = 'Copied ✓';
      setTimeout(() => { e.target.textContent = 'Copy to clipboard'; }, 1500);
    };

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('./sw.js')
        .then(reg => reg.update())
        .catch(() => {});
      // When a new service worker takes over, reload once so the fresh
      // version applies immediately — no second-launch dance. Skip the very
      // first install (no previous controller) and never reload mid-workout.
      const hadController = !!navigator.serviceWorker.controller;
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (!hadController || this._reloaded) return;
        if (!document.getElementById('view-player').classList.contains('hidden')) return;
        this._reloaded = true;
        location.reload();
      });
    }

    this.renderToday();
    this.show('today');
    History.sync(); // retry any workouts that couldn't reach the server
  },

  show(view) {
    for (const v of ['today', 'player', 'history']) {
      document.getElementById(`view-${v}`).classList.toggle('hidden', v !== view);
    }
    document.querySelectorAll('.nav-btn').forEach(b =>
      b.classList.toggle('active', b.dataset.nav === view));
    document.getElementById('bottom-nav').classList.toggle('hidden', view === 'player');
    if (view === 'history') this.renderHistory();
    if (view === 'today') this.renderToday();
    window.scrollTo(0, 0);
  },

  dayKey(d = new Date()) {
    return ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'][d.getDay()];
  },

  sessionSummary(session) {
    const n = session.blocks.length;
    const sets = session.blocks.reduce((a, b) => a + b.sets, 0);
    return `${n} exercises · ${sets} sets`;
  },

  blockDetail(b) {
    const parts = [];
    parts.push(b.durationSec != null ? `${b.sets} × ${b.durationSec}s` : `${b.sets} × ${b.reps}`);
    if (b.weightKg != null) parts.push(`${b.weightKg} kg`);
    if (b.note) parts.push(b.note);
    return parts.join(' · ');
  },

  sessionCard(key, session, isToday) {
    const rows = session.blocks.map(b => {
      const ex = this.exercisesById[b.exerciseId];
      return `
        <div class="exercise-row">
          <img class="exercise-thumb" src="${esc(ex?.images?.[0] || '')}" alt="" loading="lazy">
          <div>
            <div class="name">${esc(ex?.name || b.exerciseId)}</div>
            <div class="detail">${esc(this.blockDetail(b))}</div>
          </div>
        </div>`;
    }).join('');
    return `
      <div class="session-card">
        <h2>${esc(session.title)}</h2>
        <div class="session-meta">${this.sessionSummary(session)}</div>
        ${rows}
        <button class="btn" style="margin-top:14px" data-start="${esc(key)}">
          ${isToday ? 'Start workout' : `Start ${esc(session.title)}`}
        </button>
      </div>`;
  },

  renderToday() {
    const now = new Date();
    document.getElementById('today-date').textContent =
      now.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });

    const key = this.plan.schedule[this.dayKey(now)];
    const container = document.getElementById('today-content');
    const isRest = !key || key === 'rest' || !this.plan.sessions[key];

    let html = '';
    if (isRest) {
      document.getElementById('today-subtitle').textContent = 'Rest day';
      html += `
        <div class="rest-day">
          <div class="big">🧘</div>
          <h2>Rest day</h2>
          <p>Recovery is where the muscle is built.<br>Feel like moving anyway? Pick a session below.</p>
        </div>`;
    } else {
      document.getElementById('today-subtitle').textContent = 'Scheduled for today';
      html += this.sessionCard(key, this.plan.sessions[key], true);
    }

    const others = Object.entries(this.plan.sessions).filter(([k]) => isRest || k !== key);
    if (others.length) {
      html += `<div class="other-sessions"><h3>${isRest ? 'All sessions' : 'Other sessions'}</h3>`;
      for (const [k, s] of others) {
        html += `
          <div class="session-card">
            <h2>${esc(s.title)}</h2>
            <div class="session-meta">${this.sessionSummary(s)}</div>
            <button class="btn btn-secondary" data-start="${esc(k)}">Start</button>
          </div>`;
      }
      html += '</div>';
    }

    html += `<div class="app-version">Home Trainer ${APP_VERSION}</div>`;

    container.innerHTML = html;
    container.querySelectorAll('[data-start]').forEach(btn => {
      btn.onclick = () => this.startWorkout(btn.dataset.start);
    });
  },

  startWorkout(sessionKey) {
    const session = this.plan.sessions[sessionKey];
    if (!session) return;
    this.show('player');
    Player.start(sessionKey, session, this.exercisesById, () => this.show('today'));
  },

  renderHistory() {
    const container = document.getElementById('history-content');
    const entries = History.all().slice().reverse();
    if (!entries.length) {
      container.innerHTML = '<div class="history-empty">No workouts yet.<br>Your finished sessions will appear here.</div>';
      return;
    }
    container.innerHTML = entries.map(e => {
      const date = new Date(e.date).toLocaleDateString(undefined,
        { weekday: 'short', month: 'short', day: 'numeric' });
      const lines = e.exercises.map(x => {
        const sets = x.sets.map(s =>
          s.durationSec != null ? `${s.durationSec}s` :
          (s.weightKg != null ? `${s.reps}×${s.weightKg}kg` : `${s.reps}`)
        ).join(', ');
        return `<div class="line">${esc(x.name)}: ${esc(sets)}</div>`;
      }).join('');
      return `
        <div class="history-entry">
          <div class="date">${esc(date)} · ${e.durationMin} min</div>
          <div class="session-name">${esc(e.sessionTitle)}</div>
          ${lines}
          ${e.note ? `<div class="note">“${esc(e.note)}”</div>` : ''}
        </div>`;
    }).join('');
  },
};

App.init();
