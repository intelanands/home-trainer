/* Workout history stored in localStorage and auto-synced to the server
   (POST ./api/history). localStorage remains the offline source for the
   History view; entries carry synced:false until the server confirms,
   and unsynced ones retry on every app launch. */

const History = {
  KEY: 'trainer.history.v1',

  all() {
    try {
      return JSON.parse(localStorage.getItem(this.KEY)) || [];
    } catch (e) {
      return [];
    }
  },

  _save(list) {
    localStorage.setItem(this.KEY, JSON.stringify(list));
  },

  add(entry) {
    const list = this.all();
    entry.synced = false;
    list.push(entry);
    this._save(list);
    this.sync();
  },

  /* 'ok' | 'offline' | 'blocked' | 'pin'.
     'pin'     = signed out (401/429) — the UI links to the login page; the
                 gympin cookie set there rides along on every fetch here.
     'blocked' = online but no genuine confirmation (server down or something
                 answering that isn't our API).
     Only a real {ok:true} JSON reply marks an entry synced; a login page
     served with HTTP 200 must never count. */
  lastSyncStatus: 'ok',

  async sync() {
    const list = this.all();
    let status = 'ok';
    for (const entry of list.filter(e => !e.synced)) {
      try {
        const res = await fetch('./api/history', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(entry),
        });
        if (res.status === 401 || res.status === 429) { status = 'pin'; break; }
        const data = res.ok && !res.redirected ? await res.json().catch(() => null) : null;
        if (data?.ok !== true) throw new Error('no server confirmation');
        entry.synced = true;
        this._save(list);
      } catch (e) {
        // keep queued, retry next launch
        status = navigator.onLine === false ? 'offline' : 'blocked';
        break;
      }
    }
    this.lastSyncStatus = status;
    return status;
  },

  exportText() {
    return JSON.stringify(this.all(), null, 2);
  },

  download() {
    const blob = new Blob([this.exportText()], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const stamp = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = `workout-history-${stamp}.json`;
    a.click();
    URL.revokeObjectURL(url);
  },

  async copyToClipboard() {
    await navigator.clipboard.writeText(this.exportText());
  },
};
