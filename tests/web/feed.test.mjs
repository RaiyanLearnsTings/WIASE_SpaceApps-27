import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { FeedState } from '../../web/js/feed.mjs';

const fixture = (name) => JSON.parse(readFileSync(new URL(`../../examples/${name}.json`, import.meta.url)));
const frame = (over = {}) => ({ ...fixture('state_normal'), ...over });

test('accepts frames in order and ignores stale or duplicate sequences', () => {
  const s = new FeedState();
  assert.equal(s.ingest(frame({ sequence: 5 })), 'new-run');
  assert.equal(s.ingest(frame({ sequence: 4 })), 'ignored');
  assert.equal(s.ingest(frame({ sequence: 5 })), 'ignored');
  assert.equal(s.ingest({ schema_version: 2 }), 'ignored');
});

test('a new run_id resets history and events', () => {
  const s = new FeedState();
  s.ingest(fixture('state_alerts'));
  assert.ok(s.events.length > 0);
  s.ingest(frame({ run_id: 'another-run', sequence: 1 }));
  assert.equal(s.history.length, 1);
  assert.equal(s.events.length, 0);
});

test('alert events are deduplicated by (run_id, event_id)', () => {
  const s = new FeedState();
  const a = fixture('state_alerts');
  s.ingest(a);
  const count = s.events.length;
  s.ingest({ ...a, sequence: a.sequence + 1, clock: { ...a.clock, elapsed_seconds: a.clock.elapsed_seconds + 1 } });
  assert.equal(s.events.length, count);
});

test('history is bounded, marks gaps and keeps nulls', () => {
  const s = new FeedState({ maxHistory: 3 });
  const base = frame();
  for (let i = 1; i <= 5; i++) {
    if (i === 4) s.markGap();
    s.ingest({ ...base, sequence: i, clock: { ...base.clock, elapsed_seconds: i * 60 } });
  }
  assert.equal(s.history.length, 3);
  assert.equal(s.history[1].gap, true);
  const asleep = Object.values(s.history[0].crew).find((c) => c.median_reaction_time_ms === null);
  if (asleep) assert.equal(asleep.median_reaction_time_ms, null); // never coerced to 0
});
