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

  async sync() {
    const list = this.all();
    for (const entry of list.filter(e => !e.synced)) {
      try {
        const res = await fetch('./api/history', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(entry),
        });
        if (!res.ok) throw new Error(res.status);
        entry.synced = true;
        this._save(list);
      } catch (e) {
        break; // offline or server down — keep queued, retry next launch
      }
    }
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
