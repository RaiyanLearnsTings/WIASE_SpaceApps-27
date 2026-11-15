// Live-feed adapter around the simulator's SSE stream.
//  - resets per-run state when run_id changes
//  - drops out-of-order frames using (feed_id, sequence)
//  - deduplicates alert events by (run_id, event_id)
//  - keeps a bounded compact history and marks gaps instead of inventing samples
//  - reports connection state: connecting | live | stale | offline
// The ingest logic is DOM-free so it can be tested under node (tests/web/feed.test.mjs).

export const MAX_HISTORY = 600;
export const MAX_EVENTS = 200;
const STALE_MS = 5000;

/** Compact sample kept per frame for charts (null stays null). */
export function sampleOf(frame) {
  const crew = {};
  for (const a of frame.astronauts || []) {
    const c = a.comparisons || {};
    crew[a.id] = {
      heart_rate_bpm: a.heart_rate_bpm ?? null,
      heart_rate_expected: c.heart_rate_bpm?.expected ?? null,
      heart_rate_threshold: c.heart_rate_bpm?.threshold ?? null,
      systolic_mmhg: a.blood_pressure?.systolic_mmhg ?? null,
      diastolic_mmhg: a.blood_pressure?.diastolic_mmhg ?? null,
      spo2_pct: a.spo2_pct ?? null,
      median_reaction_time_ms: a.cognition?.median_reaction_time_ms ?? null,
      lapses: a.cognition?.lapses ?? null,
      state_anxiety_score: a.cognition?.state_anxiety_score ?? null,
      status: a.alert_status,
    };
  }
  const cab = frame.cabin || {};
  return {
    t: frame.clock?.elapsed_seconds ?? null,
    at: frame.clock?.simulated_at ?? null,
    crew,
    cabin: {
      co2_ppm: cab.co2_ppm ?? null,
      temperature_c: cab.temperature_c ?? null,
      relative_humidity_pct: cab.relative_humidity_pct ?? null,
      noise_dba: cab.noise_dba ?? null,
      absorbed_dose_rate_ugy_h: cab.radiation?.absorbed_dose_rate_ugy_h ?? null,
    },
  };
}

export class FeedState {
  constructor({ maxHistory = MAX_HISTORY } = {}) {
    this.maxHistory = maxHistory;
    this.reset();
  }

  reset() {
    this.frame = null;
    this.runId = null;
    this.feedId = null;
    this.sequence = -Infinity;
    this.history = [];
    this.events = [];
    this.eventKeys = new Set();
    this.gapPending = false;
  }

  /** Mark that the connection dropped; the next sample starts a new line segment. */
  markGap() { this.gapPending = true; }

  /** @returns {'ignored'|'new-run'|'accepted'} */
  ingest(frame) {
    if (!frame || typeof frame !== 'object' || frame.schema_version !== 1) return 'ignored';
    let result = 'accepted';
    if (frame.run_id !== this.runId) {
      const keepFeed = frame.feed_id;
      this.reset();
      this.feedId = keepFeed;
      this.runId = frame.run_id;
      result = 'new-run';
    } else if (frame.feed_id === this.feedId && frame.sequence <= this.sequence) {
      return 'ignored';
    }
    this.feedId = frame.feed_id;
    this.sequence = frame.sequence;
    this.frame = frame;

    const sample = sampleOf(frame);
    const last = this.history.at(-1);
    if (last && sample.t !== null && last.t !== null && sample.t <= last.t) {
      this.history[this.history.length - 1] = sample; // control echo at same sim time
    } else {
      if (this.gapPending && last) sample.gap = true;
      this.history.push(sample);
      if (this.history.length > this.maxHistory) this.history.splice(0, this.history.length - this.maxHistory);
    }
    this.gapPending = false;

    for (const event of frame.alert_events || []) {
      const key = `${frame.run_id}:${event.event_id}`;
      if (this.eventKeys.has(key)) continue;
      this.eventKeys.add(key);
      this.events.push({ ...event, key });
    }
    this.events.sort((a, b) => b.elapsed_seconds - a.elapsed_seconds || b.event_id - a.event_id);
    if (this.events.length > MAX_EVENTS) this.events.length = MAX_EVENTS;
    return result;
  }
}

/** Browser wrapper: owns the EventSource and staleness timer. */
export class LiveFeed {
  constructor(url = '/api/stream', { EventSourceImpl = globalThis.EventSource } = {}) {
    this.url = url;
    this.EventSourceImpl = EventSourceImpl;
    this.state = new FeedState();
    this.connection = 'connecting';
    this.lastMessageAt = 0;
    this.listeners = new Set();
  }

  subscribe(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }

  emit(reason) { for (const fn of this.listeners) fn(this, reason); }

  setConnection(next) {
    if (next === this.connection) return;
    if (next !== 'live') this.state.markGap();
    this.connection = next;
    this.emit('connection');
  }

  start() {
    this.source = new this.EventSourceImpl(this.url);
    this.source.onopen = () => this.setConnection('live');
    this.source.onerror = () => this.setConnection('offline');
    this.source.onmessage = (message) => {
      let frame;
      try { frame = JSON.parse(message.data); } catch { return; }
      this.accept(frame);
    };
    this.timer = setInterval(() => {
      if (this.connection === 'live' && Date.now() - this.lastMessageAt > STALE_MS) this.setConnection('stale');
    }, 1000);
  }

  /** Also used for frames returned by POST controls. */
  accept(frame) {
    const result = this.state.ingest(frame);
    if (result === 'ignored') return;
    this.lastMessageAt = Date.now();
    if (this.connection !== 'live') this.setConnection('live');
    this.emit(result);
  }

  stop() {
    this.source?.close();
    clearInterval(this.timer);
  }
}
