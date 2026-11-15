// Small observable UI store. Session state lives in memory; only viewer preferences
// (mode, delay) are remembered in localStorage, and every access is guarded.

const PREFS_KEY = 'wiase-prefs-v1';

function loadPrefs() {
  try {
    const p = JSON.parse(localStorage.getItem(PREFS_KEY));
    if (p && (p.mode === 'deep' || p.mode === 'iss') && Number.isFinite(p.delayMin)
      && p.delayMin >= 1 && p.delayMin <= 22) return p;
  } catch { /* storage unavailable */ }
  return { mode: 'deep', delayMin: 12 };
}

export function createStore() {
  const prefs = loadPrefs();
  let state = {
    astronaut: 'astro-1',
    organ: null,
    mode: prefs.mode,
    delayMin: prefs.delayMin,
    regionTab: 'readings', // astronaut page: readings | why | checkins
    acks: {},       // event key -> { at, note }
    responses: {},  // issue id -> { done: [step index], ackAt, note } (current run only)
    packets: [],    // simulated ground-review packets (current run only)
    tasksDone: {},  // `${day}:${taskId}` -> true (current run only)
    checkins: {},   // astronaut -> summary from /api/checkins
  };
  const listeners = new Set();
  return {
    get: () => state,
    set(patch) {
      state = { ...state, ...patch };
      if ('mode' in patch || 'delayMin' in patch) {
        try { localStorage.setItem(PREFS_KEY, JSON.stringify({ mode: state.mode, delayMin: state.delayMin })); } catch { /* ignore */ }
      }
      for (const fn of listeners) fn(state, patch);
    },
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
  };
}
