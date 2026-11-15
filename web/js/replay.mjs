// Recorded-demo mode for static hosting (no Python server). Plays web/demo/run.json — a scripted run
// of the same server/simulator.py — through the same FeedState used for the live SSE stream, so
// ordering, history, gap handling and event de-duplication behave identically.
//
// Speed 1×/10×/60× = simulated seconds per wall second. Reset rewinds; "trigger" jumps to a chapter.
// Pause freezes playback (choosing a speed resumes it); the top-bar timeline seeks to any frame.
// Each rewind starts a new pass with its own run_id, so the UI resets exactly like a server reset.
import { FeedState } from './feed.mjs';
import { createLocalCheckins } from './checkin/localStore.mjs';

const TICK_MS = 250;
const HOLD_AT_END_MS = 6000;

export class ReplayFeed {
  constructor(run, { now = () => Date.now() } = {}) {
    this.run = run;
    this.now = now;
    this.state = new FeedState();
    this.connection = 'connecting';
    this.lastMessageAt = 0;
    this.listeners = new Set();
    this.index = -1;
    this.pass = 0;
    this.rate = 60;
    this.carry = 0;
    this.endedAt = null;
    this.paused = false;
    this.held = false; // temporary hold while the timeline is being dragged (not a user-visible pause)
    this.frozen = false; // held by the guided tour: each step jumps to its chapter, nothing plays between
  }

  /** Tour hold: playback stops between chapter jumps (seek still works), separate from drag and pause. */
  setFrozen(frozen) {
    this.frozen = !!frozen;
    this.carry = 0;
  }

  /** Stop the clock while someone drags the timeline, without changing the play/pause state. */
  hold(held) {
    this.held = !!held;
    this.carry = 0;
  }

  /** Start a fresh pass from the first frame (new run_id, like a server reset). */
  restart() {
    this.pass += 1;
    this.index = -1;
    this.seek(0);
  }

  /** Freeze or resume playback; seeking still works while paused. */
  setPaused(paused) {
    this.paused = !!paused;
    this.carry = 0;
    this.endedAt = null;
    this.emit('connection');
  }

  subscribe(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  emit(reason) { for (const fn of this.listeners) fn(this, reason); }

  get step() { return this.run.step_seconds; }
  get last() { return this.run.frames.length - 1; }

  /** Frame i as published in the current pass. */
  frameAt(i) {
    const f = this.run.frames[i];
    return {
      ...f,
      run_id: `${f.run_id}-p${this.pass}`,
      sequence: i + 1,
      clock: { ...f.clock, speed: this.rate, published_at: new Date(this.now()).toISOString() },
    };
  }

  /** Move to frame i, ingesting every frame in between so history and events stay complete. */
  seek(i) {
    const target = Math.max(0, Math.min(this.last, i));
    if (target === this.index) return; // already there: no replay, no new run
    let reason = 'accepted';
    if (target <= this.index) { this.pass += 1; this.index = -1; reason = 'new-run'; }
    for (let k = this.index + 1; k <= target; k++) {
      const r = this.state.ingest(this.frameAt(k));
      if (r === 'new-run') reason = 'new-run';
    }
    this.index = target;
    this.carry = 0;
    this.endedAt = null;
    this.lastMessageAt = this.now();
    this.connection = 'live';
    this.emit(reason);
  }

  seekTime(seconds) { this.seek(Math.round(seconds / this.step)); }

  start() {
    this.seek(0);
    this.timer = setInterval(() => this.tick(TICK_MS), TICK_MS);
  }

  tick(ms) {
    if (this.paused || this.held || this.frozen) return;
    if (this.index >= this.last) {
      this.endedAt ??= this.now();
      if (this.now() - this.endedAt >= HOLD_AT_END_MS) this.seek(0); // loop the recording
      return;
    }
    this.carry += (this.rate * ms) / 1000;
    if (this.carry < this.step) return;
    const n = Math.floor(this.carry / this.step);
    this.carry -= n * this.step;
    this.seek(this.index + n);
  }

  /** Live-feed compatibility: controls return null in replay mode, which is ignored. */
  accept(frame) {
    if (!frame) return;
    const r = this.state.ingest(frame);
    if (r !== 'ignored') this.emit(r);
  }

  currentChapter() {
    const t = this.index * this.step;
    return [...this.run.chapters].reverse().find((c) => c.at <= t) || this.run.chapters[0];
  }

  stop() { clearInterval(this.timer); }
}

/** API shim with the same methods as js/api.mjs. */
export function replayApi(feed, run, checkins = createLocalCheckins()) {
  const chapter = (id) => run.chapters.find((c) => c.id === id);
  return {
    baselines: async () => run.baselines,
    // In the recorded demo the "scenarios" are the recorded chapters (each is a fixed moment in the run).
    scenarios: async () => ({
      scenarios: run.chapters.map((c) => ({ id: c.id, label: c.label, description: c.description, scope: 'recorded' })),
      durations: run.durations,
    }),
    speed: async (speed) => { feed.rate = speed; feed.setPaused(false); return null; },
    reset: async () => { feed.restart(); return null; },
    trigger: async (id) => {
      const c = chapter(id);
      if (!c) throw new Error('That scenario is not part of the recorded demo. Run the local server for live scenarios.');
      feed.seekTime(c.at);
      return null;
    },
    clear: async () => { feed.seekTime(chapter('recovery')?.at ?? 0); return null; },
    checkins: async (id) => checkins.summary(id),
    allCheckins: async () => checkins.all(),
    saveReaction: async (body) => checkins.addReaction(body),
    saveSurvey: async (body) => checkins.addSurvey(body),
  };
}

/** Decide the mode: live when the WIASE server answers, otherwise the recorded demo. ?demo=1 forces it. */
export async function detectMode(location = globalThis.location) {
  const params = new URLSearchParams(location.search);
  if (params.get('demo') === '1') return 'replay';
  // Only probe for the API where the Python server can actually run (avoids a 404 on static hosts).
  const local = ['localhost', '127.0.0.1', '[::1]', ''].includes(location.hostname) || params.get('live') === '1';
  if (!local) return 'replay';
  try {
    const r = await fetch('/api/state', { cache: 'no-store' });
    if (r.ok && (r.headers.get('content-type') || '').includes('json')) return 'live';
  } catch { /* static host */ }
  return 'replay';
}
