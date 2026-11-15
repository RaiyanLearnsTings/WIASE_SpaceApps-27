// One-row control bar: identity, environment + comms delay, mission clock, speed, connection,
// and three entry points — Simulate (scenarios / recorded chapters), Tour, About — plus Settings.
// Everything that used to crowd a second row lives in the Simulate panel.
import { clockOf, elapsedLabel, durationLabel, escapeHtml } from '../format.mjs';
import { openDialog, toast } from './dialog.mjs';

const DURATIONS = [5, 15, 30, 60];

export function mountTopbar(el, ctx) {
  const { store, feed, api } = ctx;
  el.innerHTML = `
    <div class="brand" aria-label="WIASE crew health console"><span class="brand__mark" aria-hidden="true">//</span><strong>WIASE</strong></div>
    <div class="group">
      <div class="segmented" role="group" aria-label="Operating environment">
        <button type="button" data-mode="deep">Deep Space</button><button type="button" data-mode="iss">ISS</button>
      </div>
      <span class="mono muted small" id="delay" title="Illustrative one-way communication delay (assumption)"></span>
    </div>
    <span class="spacer"></span>
    <div class="clockblock" title="Simulated mission time (UTC) and time since the run started">
      <span class="mono clock" id="sim-clock">--:--:--</span><span class="mono muted small" id="elapsed">T+—</span>
    </div>
    <div class="segmented segmented--quiet" role="group" aria-label="Simulation speed">
      <button type="button" data-speed="1">1×</button><button type="button" data-speed="10">10×</button><button type="button" data-speed="60">60×</button>
    </div>
    <span class="conn" id="conn" role="status"></span>
    <span class="topbar__rule" aria-hidden="true"></span>
    <button type="button" class="btn btn--primary" id="sim-btn">Simulate <span class="count" id="sc-count"></span></button>
    <button type="button" class="btn" id="tour-btn" title="Guided tour of WIASE">Tour</button>
    <button type="button" class="btn" id="about-btn">About</button>
    <button type="button" class="icon-btn" id="settings-btn" aria-label="Settings and export">⚙</button>`;

  const q = (s) => el.querySelector(s);
  el.querySelectorAll('[data-mode]').forEach((b) => b.addEventListener('click', () => store.set({ mode: b.dataset.mode })));
  el.querySelectorAll('[data-speed]').forEach((b) => b.addEventListener('click', async () => {
    try { feed.accept(await api.speed(Number(b.dataset.speed))); } catch (e) { toast(e.message, 'error'); }
  }));
  q('#sim-btn').addEventListener('click', () => openSimulate(ctx));
  q('#settings-btn').addEventListener('click', () => openSettings(ctx));
  q('#tour-btn').addEventListener('click', () => ctx.tour?.start());
  q('#about-btn').addEventListener('click', () => ctx.openPage('about'));

  return function render() {
    const f = feed.state.frame;
    const s = store.get();
    const conn = q('#conn');
    const label = ctx.mode === 'replay' && feed.connection === 'live' ? 'Recorded'
      : { connecting: 'Connecting', live: 'Live', stale: 'Stale', offline: 'Offline' }[feed.connection];
    conn.className = `conn conn--${feed.connection}${ctx.mode === 'replay' ? ' conn--replay' : ''}`;
    conn.innerHTML = `<span class="conn__dot" aria-hidden="true"></span>${label}<span class="sr-only"> simulator connection</span>`;
    conn.title = ctx.mode === 'replay' ? `Pre-recorded run of the WIASE simulator (synthetic data). Chapter: ${feed.currentChapter().label}. Run the Python server locally for the live simulator.`
      : feed.lastMessageAt ? `Last frame received ${new Date(feed.lastMessageAt).toISOString().slice(11, 19)} UTC (wall clock)` : '';
    q('#sim-clock').textContent = f ? `${clockOf(f.clock.simulated_at)} UTC` : '--:--:-- UTC';
    q('#elapsed').textContent = elapsedLabel(f?.clock.elapsed_seconds);
    el.querySelectorAll('[data-mode]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.mode === s.mode)));
    el.querySelectorAll('[data-speed]').forEach((b) => b.setAttribute('aria-pressed', String(Number(b.dataset.speed) === f?.clock.speed)));
    q('#delay').textContent = s.mode === 'deep' ? `${s.delayMin} min delay` : 'live link';
    q('#sc-count').textContent = f?.active_scenarios.length || '';
  };
}

/** Simulate panel: live scenarios (server) or recorded chapters (static demo). */
function openSimulate(ctx) {
  const { feed, api, store } = ctx;
  const body = document.createElement('div');
  body.className = 'simulate';
  const replay = ctx.mode === 'replay';
  const draw = () => {
    const f = feed.state.frame;
    if (!f) return;
    if (replay) {
      const now = feed.currentChapter().id;
      body.innerHTML = `<p class="muted">This is a recorded run of the WIASE simulator. Jump to any moment; the dashboard updates as if it were live.</p>
        <ol class="sim-list">${ctx.run.chapters.map((c, i) => `<li class="sim-row${c.id === now ? ' is-current' : ''}">
          <span class="sim-row__n mono">${String(i + 1).padStart(2, '0')}</span>
          <div><strong>${escapeHtml(c.label)}</strong><span class="muted small">${escapeHtml(c.description)}</span></div>
          <button type="button" class="btn btn--small" data-jump="${c.id}">${c.id === now ? 'Playing' : 'Jump'}</button></li>`).join('')}</ol>
        <div class="row"><button type="button" class="btn" data-restart>Restart from the beginning</button></div>`;
      return;
    }
    const crew = f.astronauts;
    const active = f.active_scenarios;
    if (body.contains(document.activeElement) && document.activeElement.matches('select')) return;
    const keep = { target: body.querySelector('#sc-target')?.value || store.get().astronaut, duration: body.querySelector('#sc-duration')?.value || '15' };
    body.innerHTML = `<p class="muted">Inject a synthetic change and watch detection, the alert and recovery. Alerts confirm after 12 simulated seconds.</p>
      <div class="row sim-opts">
        <label class="field">Crew target<select id="sc-target">${crew.map((a) => `<option value="${a.id}" ${a.id === keep.target ? 'selected' : ''}>${a.name}</option>`).join('')}</select></label>
        <label class="field">Duration<select id="sc-duration">${DURATIONS.map((m) => `<option value="${m}" ${String(m) === keep.duration ? 'selected' : ''}>${m} sim min</option>`).join('')}</select></label>
      </div>
      <ol class="sim-list">${ctx.scenarios.map((sc) => {
        const on = active.filter((a) => a.id === sc.id);
        return `<li class="sim-row${on.length ? ' is-current' : ''}">
          <span class="tag">${sc.scope === 'cabin' ? 'Cabin' : 'Crew'}</span>
          <div><strong>${escapeHtml(sc.label)}</strong><span class="muted small">${escapeHtml(sc.description)}${on.map((a) => ` · <b>active on ${a.target}, ${durationLabel(a.remaining_seconds)} left</b>`).join('')}</span></div>
          <button type="button" class="btn btn--small" data-trigger="${sc.id}" data-scope="${sc.scope}">Trigger</button></li>`;
      }).join('')}</ol>
      <div class="row"><button type="button" class="btn" data-clear ${active.length ? '' : 'disabled'}>Clear all scenarios</button>
        <span class="spacer"></span><button type="button" class="btn" data-reset title="Restart the simulated clock and clear scenarios">Reset run</button></div>`;
  };
  body.addEventListener('click', async (e) => {
    const t = e.target.closest('[data-jump],[data-restart],[data-trigger],[data-clear],[data-reset]');
    if (!t) return;
    try {
      if (t.dataset.jump) { await api.trigger(t.dataset.jump); dlg.close(); toast(`Jumped to: ${ctx.run.chapters.find((c) => c.id === t.dataset.jump).label}`); }
      else if ('restart' in t.dataset || 'reset' in t.dataset) { feed.accept(await api.reset()); dlg.close(); toast(replay ? 'Recording restarted.' : 'Simulation reset — new run started.'); }
      else if ('clear' in t.dataset) feed.accept(await api.clear());
      else {
        const target = t.dataset.scope === 'cabin' ? 'cabin' : body.querySelector('#sc-target').value;
        feed.accept(await api.trigger(t.dataset.trigger, target, Number(body.querySelector('#sc-duration').value) * 60));
        toast(`${ctx.scenarios.find((s) => s.id === t.dataset.trigger).label} started.`);
      }
      draw();
    } catch (err) { toast(err.message, 'error'); }
  });
  draw();
  const off = feed.subscribe(draw);
  const dlg = openDialog({ kicker: replay ? 'Recorded demo' : 'Simulation controls', title: replay ? 'Chapters' : 'Scenarios', body, onClose: off });
}

function openSettings(ctx) {
  const { store } = ctx;
  const s = store.get();
  const body = document.createElement('form');
  body.className = 'settings';
  body.innerHTML = `
    <label class="field">One-way communication delay in Deep Space mode: <strong id="delay-out">${s.delayMin} min</strong>
      <input type="range" min="1" max="22" step="1" value="${s.delayMin}" name="delay">
    </label>
    <p class="muted small">Illustrative assumption (Mars one-way light time is roughly 3–22 minutes). It only affects simulated
      ground-review packets. ISS mode is simplified to a zero-delay link.</p>
    <hr>
    <div class="row"><div><strong>Export session</strong><p class="muted small">Current state, history, events, acknowledgements and check-ins as one JSON file, with provenance.</p></div>
      <span class="spacer"></span><button type="button" class="btn" id="export-btn">Export JSON ↓</button></div>`;
  body.delay.addEventListener('input', () => {
    body.querySelector('#delay-out').textContent = `${body.delay.value} min`;
    store.set({ delayMin: Number(body.delay.value) });
  });
  body.querySelector('#export-btn').addEventListener('click', () => ctx.exportSession());
  openDialog({ kicker: 'Preferences', title: 'Settings', body });
}
