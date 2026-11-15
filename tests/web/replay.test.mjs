import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ReplayFeed, replayApi } from '../../web/js/replay.mjs';
import { createLocalCheckins, scoreReaction } from '../../web/js/checkin/localStore.mjs';

const run = JSON.parse(readFileSync(new URL('../../web/demo/run.json', import.meta.url)));
const memory = () => { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v) }; };

test('recorded run is a valid schema-1 recording with chapters in order', () => {
  assert.equal(run.schema_version, 1);
  assert.ok(run.frames.length > 300);
  const at = run.chapters.map((c) => c.at);
  assert.deepEqual(at, [...at].sort((a, b) => a - b));
  for (const c of run.chapters) assert.ok(c.at <= run.duration_seconds, c.id);
});

test('seeking forward keeps full history and every alert event exactly once', () => {
  const feed = new ReplayFeed(run);
  feed.seek(0);
  feed.seek(feed.last);
  assert.equal(feed.state.history.length, Math.min(run.frames.length, 600));
  const ids = feed.state.events.map((e) => e.event_id);
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(feed.state.events.some((e) => e.rule === 'co2_high' && e.type === 'opened'));
  assert.equal(feed.state.frame.active_alerts.length, 0); // recording ends recovered
});

test('chapter jumps land on the recorded alerts; rewinding starts a new run', async () => {
  const feed = new ReplayFeed(run);
  const api = replayApi(feed, run, createLocalCheckins(memory()));
  const reasons = [];
  feed.subscribe((_, r) => reasons.push(r));
  feed.seek(0);
  await api.trigger('co2_buildup');
  assert.ok(feed.state.frame.active_alerts.some((a) => a.rule === 'co2_high'));
  const runId = feed.state.runId;
  await api.reset();
  assert.notEqual(feed.state.runId, runId);
  assert.equal(reasons.at(-1), 'new-run');
  await assert.rejects(api.trigger('high_resting_hr'));
});

test('ticks advance by rate × time and loop after the end', () => {
  let now = 0;
  const feed = new ReplayFeed(run, { now: () => now });
  feed.seek(0);
  feed.rate = 60;
  feed.tick(1000); // 60 sim-s = 3 frames of 20 s
  assert.equal(feed.index, 3);
  feed.seek(feed.last);
  const pass = feed.pass;
  feed.tick(250); now += 7000; feed.tick(250);
  assert.equal(feed.index, 0);
  assert.equal(feed.pass, pass + 1);
});

test('local check-ins mirror server scoring and survey amendment', () => {
  const store = createLocalCheckins(memory());
  const trials = [300, 320, 510, 280, 290].map((rt) => ({ delay_ms: 2500, rt_ms: rt, outcome: 'valid' }));
  assert.deepEqual({ ...scoreReaction(trials), sufficient: true }, scoreReaction(trials));
  assert.equal(scoreReaction(trials).lapses, 1);
  assert.equal(scoreReaction(trials).median_reaction_time_ms, 300);
  store.addReaction({ astronaut_id: 'astro-1', trials, duration_ms: 60000 });
  store.addSurvey({ astronaut_id: 'astro-1', responses: { fatigue: 2, stress: 3, focus: 1, mood: 2 } });
  store.addSurvey({ astronaut_id: 'astro-1', responses: { fatigue: 4 } });
  const s = store.summary('astro-1');
  assert.equal(s.reaction.sessions.length, 1);
  assert.equal(s.survey.entries.length, 1);
  assert.equal(s.survey.entries[0].amendments.length, 1);
  assert.equal(s.survey.entries[0].mean_score, null); // < 4 answers
});
