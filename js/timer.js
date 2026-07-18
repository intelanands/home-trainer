/* Countdown timer with audio beeps and screen wake lock. */

const Sound = {
  ctx: null,
  ensure() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (AC) this.ctx = new AC();
    }
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
    return this.ctx;
  },
  beep(freq = 880, durMs = 150, volume = 0.4) {
    const ctx = this.ensure();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    gain.gain.value = volume;
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    gain.gain.setValueAtTime(volume, ctx.currentTime + (durMs - 30) / 1000);
    gain.gain.linearRampToValueAtTime(0, ctx.currentTime + durMs / 1000);
    osc.stop(ctx.currentTime + durMs / 1000);
  },
  tick() { this.beep(880, 120, 0.3); },
  finish() { this.beep(1320, 450, 0.5); },
};

class Countdown {
  /**
   * opts: { seconds, onTick(remaining), onDone(), beepLast (default 3) }
   */
  constructor(opts) {
    this.total = opts.seconds;
    this.remaining = opts.seconds;
    this.onTick = opts.onTick || (() => {});
    this.onDone = opts.onDone || (() => {});
    this.beepLast = opts.beepLast ?? 3;
    this._interval = null;
    this._endAt = null;
    this.paused = true;
  }

  start() {
    if (this._interval) return;
    this.paused = false;
    this._endAt = Date.now() + this.remaining * 1000;
    this.onTick(this.remaining);
    this._interval = setInterval(() => this._step(), 250);
  }

  _step() {
    const rem = Math.max(0, Math.ceil((this._endAt - Date.now()) / 1000));
    if (rem !== this.remaining) {
      this.remaining = rem;
      if (rem > 0 && rem <= this.beepLast) Sound.tick();
      this.onTick(rem);
      if (rem === 0) {
        this.stop();
        Sound.finish();
        this.onDone();
      }
    }
  }

  pause() {
    if (!this._interval) return;
    clearInterval(this._interval);
    this._interval = null;
    this.paused = true;
    this.remaining = Math.max(0, Math.ceil((this._endAt - Date.now()) / 1000));
  }

  addSeconds(s) {
    this.remaining += s;
    if (this._interval) this._endAt += s * 1000;
    this.onTick(this.remaining);
  }

  stop() {
    if (this._interval) clearInterval(this._interval);
    this._interval = null;
    this.paused = true;
  }
}

const WakeLock = {
  sentinel: null,
  async acquire() {
    try {
      if ('wakeLock' in navigator) {
        this.sentinel = await navigator.wakeLock.request('screen');
      }
    } catch (e) { /* not critical, e.g. battery saver mode */ }
  },
  async release() {
    try { await this.sentinel?.release(); } catch (e) { /* ignore */ }
    this.sentinel = null;
  },
};

// Re-acquire wake lock when returning to the tab mid-workout.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && WakeLock.sentinel !== null) {
    WakeLock.acquire();
  }
});
