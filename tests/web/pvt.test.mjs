import test from 'node:test';
import assert from 'node:assert/strict';
import { PVT, TASK_IDS, classifyResponse, makeTrial, noResponse, pickTask, randomDelay, summarize } from '../../web/js/checkin/pvtLogic.mjs';

test('classifies false starts, anticipations, valid responses and timeouts', () => {
  assert.equal(classifyResponse(null, 1000).outcome, 'false_start');
  assert.equal(classifyResponse(1000, 1050).outcome, 'false_start');
  assert.deepEqual(classifyResponse(1000, 1280.4), { outcome: 'valid', rt_ms: 280 });
  assert.equal(classifyResponse(1000, 1000 + PVT.timeoutMs + 1).outcome, 'timeout');
});

test('summary keeps outcomes distinct and flags insufficient sessions', () => {
  const trials = [250, 300, 520, 280, 310].map((rt_ms) => ({ outcome: 'valid', rt_ms }))
    .concat([{ outcome: 'timeout', rt_ms: null }, { outcome: 'false_start', rt_ms: null }]);
  const s = summarize(trials);
  assert.deepEqual([s.valid_trials, s.lapses, s.timeouts, s.false_starts, s.median_reaction_time_ms, s.sufficient],
    [5, 1, 1, 1, 300, true]);
  assert.equal(summarize(trials.slice(0, 2)).sufficient, false);
  assert.equal(summarize([]).median_reaction_time_ms, null);
});

test('inter-stimulus delay stays within the configured window', () => {
  assert.equal(randomDelay(() => 0), PVT.minDelayMs);
  assert.equal(randomDelay(() => 1), PVT.maxDelayMs);
});

test('session is 45 s and every trial draws a game, never 3 of the same in a row', () => {
  assert.equal(PVT.durationMs, 45000);
  const seen = new Set();
  const history = [];
  let a = 12345; // mulberry32, seeded so the test is deterministic
  const rand = () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t ^= t + Math.imul(t ^ (t >>> 7), 61 | t); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  for (let i = 0; i < 300; i++) history.push(pickTask(history, rand));
  history.forEach((t) => seen.add(t));
  assert.deepEqual([...seen].sort(), [...TASK_IDS].sort());
  for (let i = 2; i < history.length; i++) assert.ok(!(history[i] === history[i - 1] && history[i] === history[i - 2]), `run at ${i}`);
  assert.notEqual(pickTask(['choice', 'choice'], () => 0.99), 'choice');
});

test('go/no-go and left/right classification', () => {
  const nogo = makeTrial('gonogo', () => 0.99);
  const go = makeTrial('gonogo', () => 0.1);
  assert.deepEqual([go.go, nogo.go], [true, false]);
  assert.equal(classifyResponse(1000, 1300, nogo).outcome, 'commission');
  assert.equal(noResponse(nogo).outcome, 'correct_withhold');
  assert.equal(noResponse(go).outcome, 'timeout');
  assert.equal(classifyResponse(1000, 1300, go).outcome, 'valid');
  const right = makeTrial('choice', () => 0.9);
  assert.equal(right.side, 'right');
  assert.equal(classifyResponse(1000, 1400, right, { side: 'left' }).outcome, 'wrong_response');
  assert.equal(classifyResponse(1000, 1400, right, { side: null }).outcome, 'wrong_response');
  assert.deepEqual(classifyResponse(1000, 1400, right, { side: 'right' }), { outcome: 'valid', rt_ms: 400 });
  assert.equal(classifyResponse(null, 1400, right, { side: 'right' }).outcome, 'false_start');
});

test('mixed summary: errors, per-game medians, lapses ignore slower choice trials', () => {
  const trials = [
    { task: 'simple', outcome: 'valid', rt_ms: 260 }, { task: 'simple', outcome: 'valid', rt_ms: 540 },
    { task: 'gonogo', outcome: 'valid', rt_ms: 310 }, { task: 'gonogo', outcome: 'commission', rt_ms: null },
    { task: 'gonogo', outcome: 'correct_withhold', rt_ms: null },
    { task: 'choice', outcome: 'valid', rt_ms: 520 }, { task: 'choice', outcome: 'wrong_response', rt_ms: null },
  ];
  const s = summarize(trials);
  assert.deepEqual([s.valid_trials, s.errors, s.commissions, s.wrong_responses, s.correct_withholds, s.lapses], [4, 2, 1, 1, 1, 1]);
  assert.equal(s.median_reaction_time_ms, 415);
  assert.deepEqual(s.by_task.choice, { valid_trials: 1, median_reaction_time_ms: 520 });
  assert.equal(s.by_task.simple.median_reaction_time_ms, 400);
});
