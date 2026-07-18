/* Workout history stored in localStorage, exportable as JSON. */

const History = {
  KEY: 'trainer.history.v1',

  all() {
    try {
      return JSON.parse(localStorage.getItem(this.KEY)) || [];
    } catch (e) {
      return [];
    }
  },

  add(entry) {
    const list = this.all();
    list.push(entry);
    localStorage.setItem(this.KEY, JSON.stringify(list));
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
