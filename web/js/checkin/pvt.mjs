// Reaction-time check-in: 45 s of three mini-games drawn at random every trial (Tap, Go/No-Go,
// Left/Right) so the test can't be learned. Uses performance.now() (monotonic wall clock — never the
// accelerated simulation clock). Space / arrow keys or tap to respond. Leaving the tab interrupts.
import { openDialog, toast } from '../panels/dialog.mjs';
import { PVT, TASKS, classifyResponse, makeTrial, noResponse, pickTask, randomDelay, summarize } from './pvtLogic.mjs';

const MESSAGES = {
  false_start: 'Too early', timeout: 'Too slow', commission: 'That was a hold',
  wrong_response: 'Wrong direction', correct_withhold: 'Good hold',
};

const arrowSvg = (side) => `<svg viewBox="0 0 120 80" width="132" height="88" aria-hidden="true"${side === 'right' ? ' style="transform:scaleX(-1)"' : ''}>
  <path d="M8 40 L48 6 V28 H112 V52 H48 V74 Z" fill="currentColor"/></svg>`;

export function openReaction(ctx) {
  const { store, feed, api } = ctx;
  const astronautId = store.get().astronaut;
  const name = feed.state.frame?.astronauts.find((a) => a.id === astronautId)?.name || astronautId;
  const root = document.createElement('div');
  root.className = 'pvt';
  let run = null;
  const q = (s) => root.querySelector(s);

  const intro = () => {
    root.innerHTML = `
      <p>Recording for <strong>${name}</strong>. For ${PVT.durationMs / 1000} seconds, each target randomly uses one of three games.
        Wait for it, then respond as fast as you can. Don't anticipate.</p>
      <ol class="pvt__games">
        <li><span class="pvt__swatch pvt__swatch--simple" aria-hidden="true"></span><div><strong>${TASKS.simple.label}</strong><span class="muted small">Circle appears: press <kbd>Space</kbd> or tap.</span></div></li>
        <li><span class="pvt__swatch pvt__swatch--go" aria-hidden="true"></span><span class="pvt__swatch pvt__swatch--nogo" aria-hidden="true"></span><div><strong>${TASKS.gonogo.label}</strong><span class="muted small">Crimson: respond. Yellow: hold back — don't press.</span></div></li>
        <li><span class="pvt__swatch pvt__swatch--arrow mono" aria-hidden="true">←→</span><div><strong>${TASKS.choice.label}</strong><span class="muted small">Arrow appears: press <kbd>←</kbd>/<kbd>→</kbd> or tap that half of the panel.</span></div></li>
      </ol>
      <p class="muted small">Early (&lt;${PVT.anticipationMs} ms or before the target) = false start; no response within ${PVT.timeoutMs / 1000} s = timeout.
        Lapses = Tap/Go responses ≥ ${PVT.lapseMs} ms (a PVT convention, not validated here). Compare only with your own sessions; switching tabs stops the test.</p>
      <button type="button" class="btn btn--primary btn--large" id="pvt-start">Begin ${PVT.durationMs / 1000} s test</button>`;
    q('#pvt-start').addEventListener('click', start);
  };

  function start() {
    root.innerHTML = `
      <div class="pvt__arena" id="arena" tabindex="0" role="button" aria-label="Response area. Press Space, an arrow key, or tap when the target appears.">
        <span class="pvt__cue" id="cue" aria-live="polite"></span>
        <div class="pvt__target" id="target" aria-hidden="true"></div>
        <span class="pvt__msg" id="msg">Get ready…</span>
      </div>
      <div class="pvt__progress"><span id="bar"></span></div>
      <div class="row muted small"><span id="count">0 valid</span><span id="clock">${PVT.durationMs / 1000} s</span>
        <button type="button" class="btn btn--small" id="stop">Stop</button></div>`;
    run = { trials: [], tasks: [], startedAt: performance.now(), stimulusAt: null, waitStart: 0, delay: 0, timer: 0, n: 0, trial: null, done: false };
    const arena = q('#arena');
    arena.focus();
    arena.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      const r = arena.getBoundingClientRect();
      respond({ side: e.clientX < r.left + r.width / 2 ? 'left' : 'right' });
    });
    q('#stop').addEventListener('click', () => finish(true));
    schedule();
    tick();
  }

  function schedule() {
    const n = ++run.n;
    const task = pickTask(run.tasks);
    run.tasks.push(task);
    run.trial = makeTrial(task);
    run.delay = randomDelay();
    run.waitStart = performance.now();
    run.stimulusAt = null;
    const target = q('#target');
    target.className = 'pvt__target';
    target.textContent = '';
    q('#cue').textContent = TASKS[task].cue;
    q('#arena').dataset.task = task;
    run.timer = setTimeout(() => requestAnimationFrame(() => {
      if (run.done || n !== run.n) return; // a false start already ended this trial
      const t = run.trial;
      target.className = `pvt__target is-on pvt__target--${t.task === 'gonogo' ? (t.go ? 'go' : 'nogo') : t.task === 'choice' ? 'arrow' : 'simple'}`;
      target.innerHTML = t.task === 'choice' ? arrowSvg(t.side) : '';
      q('#msg').textContent = '';
      run.stimulusAt = performance.now();
      const windowMs = t.task === 'gonogo' && !t.go ? PVT.withholdMs : PVT.timeoutMs + 5;
      run.timer = setTimeout(() => { const r = noResponse(t); record(r, MESSAGES[r.outcome]); }, windowMs);
    }), run.delay);
  }

  function record(result, message) {
    clearTimeout(run.timer);
    run.trials.push({ task: run.trial.task, delay_ms: run.delay, ...result });
    q('#target').className = 'pvt__target';
    const msg = q('#msg');
    msg.textContent = message;
    msg.dataset.tone = result.outcome;
    const s = summarize(run.trials);
    q('#count').textContent = `${s.valid_trials} valid · ${s.errors} errors · ${s.false_starts} early · ${s.timeouts} missed`;
    if (performance.now() - run.startedAt >= PVT.durationMs) finish(false);
    else schedule();
  }

  function respond(input = {}) {
    if (!run || run.done) return;
    const now = performance.now();
    const result = classifyResponse(run.stimulusAt, now, run.trial, input);
    if (result.outcome === 'false_start' && run.stimulusAt === null) run.delay = Math.round(now - run.waitStart);
    record(result, result.outcome === 'valid' ? `${result.rt_ms} ms` : MESSAGES[result.outcome]);
  }

  function onKey(e) {
    if (!run || run.done || !root.isConnected) return;
    const side = { ArrowLeft: 'left', ArrowRight: 'right' }[e.code];
    if (e.code !== 'Space' && !side) return;
    e.preventDefault();
    if (!e.repeat) respond({ side: side || null });
  }
  function onHide() { if (document.hidden && run && !run.done) finish(true); }

  function tick() {
    if (!run || run.done) return;
    const elapsed = performance.now() - run.startedAt;
    q('#bar').style.width = `${Math.min(100, (elapsed / PVT.durationMs) * 100)}%`;
    q('#clock').textContent = `${Math.max(0, Math.ceil((PVT.durationMs - elapsed) / 1000))} s`;
    if (elapsed >= PVT.durationMs && run.stimulusAt === null) { finish(false); return; } // time's up while waiting
    requestAnimationFrame(tick);
  }

  async function finish(interrupted) {
    if (run.done) return;
    run.done = true;
    clearTimeout(run.timer);
    const duration = Math.round(performance.now() - run.startedAt);
    const local = summarize(run.trials);
    root.innerHTML = '<p class="muted">Saving…</p>';
    if (!run.trials.length) { root.innerHTML = '<p>No trials recorded.</p>'; return; }
    let saved = null, error = null;
    try {
      saved = await api.saveReaction({ astronaut_id: astronautId, trials: run.trials, duration_ms: duration,
        interrupted, simulated_at: feed.state.frame?.clock.simulated_at });
      await ctx.refreshCheckins(astronautId);
    } catch (e) { error = e.message; }
    const r = saved || local;
    const byTask = Object.entries(r.by_task || local.by_task).map(([task, b]) =>
      `<span><span class="label">${TASKS[task].label}</span><b class="mono">${b.median_reaction_time_ms !== null ? `${Math.round(b.median_reaction_time_ms)} ms` : '—'}</b><span class="muted small"> ${b.valid_trials} valid</span></span>`).join('');
    root.innerHTML = `
      <div class="pvt__result">
        <div><span class="label">Median RT</span><strong class="mono big">${r.median_reaction_time_ms ?? '—'}${r.median_reaction_time_ms ? ' ms' : ''}</strong></div>
        <div><span class="label">Valid trials</span><strong class="mono big">${r.valid_trials}</strong></div>
        <div><span class="label">Lapses ≥${PVT.lapseMs} ms</span><strong class="mono big">${r.lapses}</strong></div>
        <div><span class="label">Errors</span><strong class="mono big">${r.errors ?? local.errors}</strong></div>
        <div><span class="label">False starts / timeouts</span><strong class="mono big">${r.false_starts} / ${r.timeouts}</strong></div>
        <div><span class="label">Good holds</span><strong class="mono big">${r.correct_withholds ?? local.correct_withholds}</strong></div>
      </div>
      <div class="pvt__bytask">${byTask}</div>
      ${r.sufficient ? '' : `<p class="warn">Fewer than ${PVT.minValidTrials} valid trials, so the session is marked insufficient and excluded from the baseline.</p>`}
      ${interrupted ? '<p class="warn">Session interrupted. It is kept for the record but excluded from the baseline.</p>' : ''}
      <p class="${error ? 'warn' : 'muted small'}">${error ? `Not saved: ${error}` : `Saved for ${name}. Results appear under Brain & nervous system.`}</p>
      <button type="button" class="btn" id="again">Run again</button>`;
    q('#again').addEventListener('click', intro);
    if (!error) toast('Reaction test saved.');
  }

  intro();
  document.addEventListener('keydown', onKey);
  document.addEventListener('visibilitychange', onHide);
  openDialog({
    kicker: 'Human check-in · wall clock', title: 'Reaction-time test', body: root,
    onClose: () => {
      if (run && !run.done) { run.done = true; clearTimeout(run.timer); }
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('visibilitychange', onHide);
    },
  });
}
