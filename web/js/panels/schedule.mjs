// To-do: dashboard card (mission tasks | cognitive tests per astronaut) and the expanded To-do page
// (overall mission + ground link, take-a-test launcher, and a task column per astronaut).
// Times are on the simulated clock; human check-ins are recorded against wall-clock time.
import { durationLabel, dayOf, escapeHtml } from '../format.mjs';
import { toast } from './dialog.mjs';
import { cardHead } from './card.mjs';
import { setHTML } from '../dom.mjs';

export const MISSION_TASKS = [
  { id: 'cabin', at: 12 * 60, title: 'Cabin review', detail: 'Verify CO₂, thermal and noise inputs' },
  { id: 'followup', at: 16 * 60, title: 'Follow-up review', detail: 'Review changes and open alerts' },
];
const TESTS = [
  { id: 'survey', at: 8 * 60 + 30, title: 'Daily check-in', short: 'Check-in' },
  { id: 'reaction', at: 9 * 60, title: 'Reaction-time test', short: 'Reaction' },
];

export const minuteOfDay = (iso) => Number(iso.slice(11, 13)) * 60 + Number(iso.slice(14, 16));
export const hhmm = (m) => `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(Math.round(m) % 60).padStart(2, '0')}`;

export function packetState(packet, elapsed) {
  const age = elapsed - packet.createdAt;
  if (age >= 2 * packet.delaySec) return { key: 'acked', label: 'Transport ack received' };
  if (age >= packet.delaySec) return { key: 'delivered', label: 'Delivered to ground', eta: 2 * packet.delaySec - age };
  return { key: 'transit', label: 'In transit', eta: packet.delaySec - age };
}

function testDone(ctx, astronautId, kind, day) {
  const summary = ctx.store.get().checkins[astronautId];
  const list = kind === 'survey' ? summary?.survey.entries : summary?.reaction.sessions;
  return (list || []).some((x) => (x.simulated_at || '').slice(0, 10) === day);
}

function testState(ctx, a, t, f) {
  const day = dayOf(f.clock.simulated_at);
  if (testDone(ctx, a.id, t.id, day)) return 'done';
  return minuteOfDay(f.clock.simulated_at) >= t.at ? 'due' : 'upcoming';
}

function missionState(ctx, t, f) {
  const day = dayOf(f.clock.simulated_at);
  if (ctx.store.get().tasksDone[`${day}:${t.id}`]) return 'done';
  return minuteOfDay(f.clock.simulated_at) >= t.at ? 'due' : 'upcoming';
}

const STATE_LABEL = { done: '✓ Done', due: 'Due', upcoming: 'Scheduled', active: 'In progress' };

function personalTasks(ctx, a, f) {
  const plan = ctx.baselines?.astronauts.find((x) => x.id === a.id)?.schedule;
  const now = minuteOfDay(f.clock.simulated_at);
  const timed = (start, end, title, detail) => ({ at: start, title, detail, state: now >= end ? 'done' : now >= start ? 'active' : 'upcoming', sim: true });
  const tasks = TESTS.map((t) => ({ at: t.at, title: t.title, detail: 'Human check-in', action: t.id, state: testState(ctx, a, t, f) }));
  if (plan) {
    const [[w1s, w1e], [w2s, w2e]] = plan.work_blocks_minute;
    tasks.push(timed(w1s, w1e, 'Work block', `${hhmm(w1s)}–${hhmm(w1e)}`));
    tasks.push(timed(plan.exercise_minute, plan.exercise_minute + 25, 'Exercise', '25 min, then 15 min recovery'));
    tasks.push(timed(w2s, w2e, 'Work block', `${hhmm(w2s)}–${hhmm(w2e)}`));
    tasks.push(timed(plan.bedtime_minute, plan.bedtime_minute + 1, 'Sleep period', 'Template night from BIDSleep'));
  }
  return tasks.sort((x, y) => x.at - y.at);
}

function onAction(ctx, e) {
  const b = e.target.closest('[data-test],[data-done],#queue');
  if (!b) return;
  const f = ctx.feed.state.frame;
  if (!f) return;
  if (b.dataset.test) ctx.openTest(b.dataset.test, b.dataset.astronaut);
  else if (b.dataset.done) ctx.store.set({ tasksDone: { ...ctx.store.get().tasksDone, [`${dayOf(f.clock.simulated_at)}:${b.dataset.done}`]: true } });
  else if (b.id === 'queue') queuePacket(ctx, f);
}

function queuePacket(ctx, f) {
  const s = ctx.store.get();
  const alerts = f.active_alerts.length;
  const packet = {
    id: `${f.run_id.slice(0, 6)}-${f.sequence}`,
    createdAt: f.clock.elapsed_seconds,
    delaySec: s.mode === 'deep' ? s.delayMin * 60 : 0,
    mode: s.mode,
    summary: `Crew review · ${alerts} active alert${alerts === 1 ? '' : 's'} (incl. cabin)`,
  };
  ctx.store.set({ packets: [packet, ...s.packets].slice(0, 12) });
  toast(s.mode === 'deep' ? `Packet queued. It arrives in ${s.delayMin} simulated min.` : 'Packet queued (ISS: zero-delay simplification).');
}

function packetsHtml(ctx, f, limit) {
  const s = ctx.store.get();
  if (!s.packets.length) return '<li class="muted small">No packets this run. Packets are simulated locally; nothing is transmitted.</li>';
  return s.packets.slice(0, limit).map((p) => {
    const st = packetState(p, f.clock.elapsed_seconds);
    return `<li class="packet packet--${st.key}"><span class="packet__dot" aria-hidden="true"></span>
      <div><strong>${escapeHtml(p.summary)}</strong>
      <span class="muted small">${st.label}${st.eta !== undefined ? ` · ${durationLabel(st.eta)} sim` : ''} · ${p.mode === 'deep' ? `${p.delaySec / 60} min delay` : 'ISS'}</span></div></li>`;
  }).join('');
}

const testButton = (state, t, a, compact) => `<button type="button" class="test-chip test-chip--${state}" data-test="${t.id}" data-astronaut="${a.id}"
  aria-label="${t.title} for ${a.name}: ${STATE_LABEL[state]}">${compact ? '' : `<span>${t.short}</span>`}<b>${state === 'done' ? '✓' : state === 'due' ? 'Due' : hhmm(t.at)}</b></button>`;

export function mountSchedule(el, ctx) {
  const { feed } = ctx;
  setHTML(el, `${cardHead({ idx: '02', title: 'To-do', page: 'todo' })}
    <div class="todo-card">
      <div class="progress" aria-hidden="true"><span id="todo-bar"></span></div>
      <h4>Next up</h4>
      <ol class="tasks" id="todo-next"></ol>
    </div>
    <footer class="card__foot"><span id="todo-count"></span><span id="todo-link" class="muted"></span></footer>`);
  el.dataset.expandCard = 'todo';
  el.addEventListener('click', (e) => onAction(ctx, e));

  return function render() {
    const f = feed.state.frame;
    if (!f) return;
    const items = [
      ...MISSION_TASKS.map((t) => ({ at: t.at, title: t.title, who: 'Crew', state: missionState(ctx, t, f), done: t.id })),
      ...f.astronauts.flatMap((a, i) => TESTS.map((t) => ({ at: t.at, title: t.title, who: `P${i + 1}`, astronaut: a.id, test: t.id, state: testState(ctx, a, t, f) }))),
    ];
    const done = items.filter((t) => t.state === 'done').length;
    const due = items.filter((t) => t.state === 'due').length;
    const next = items.filter((t) => t.state !== 'done')
      .sort((x, y) => (x.state === 'due' ? 0 : 1) - (y.state === 'due' ? 0 : 1) || x.at - y.at).slice(0, 3);
    el.querySelector('#todo-bar').style.width = `${(done / items.length) * 100}%`;
    setHTML(el.querySelector('#todo-next'), next.length ? next.map((t) => `<li class="task task--${t.state}">
      <span class="task__time mono">${hhmm(t.at)}</span>
      <div><strong>${t.title}</strong><span class="muted small">${t.who === 'Crew' ? 'Whole crew' : `${t.who} · ${f.astronauts.find((a) => a.id === t.astronaut).name}`}</span></div>
      ${t.state === 'due'
        ? (t.test ? `<button type="button" class="btn btn--small" data-test="${t.test}" data-astronaut="${t.astronaut}">Start</button>`
          : `<button type="button" class="btn btn--small" data-done="${t.done}">Done</button>`)
        : '<span class="task__state">Later</span>'}</li>`).join('')
      : '<li class="state state--ok"><strong>All done for today</strong></li>');
    el.querySelector('#todo-count').textContent = `${done}/${items.length} done${due ? ` · ${due} due` : ''}`;
    const s = ctx.store.get();
    el.querySelector('#todo-link').textContent = `Ground link ${s.mode === 'deep' ? `· ${s.delayMin} min` : '· ISS'}`;
  };
}

export const todoPage = {
  id: 'todo',
  kicker: (ctx) => { const f = ctx.feed.state.frame; return f ? `Mission day ${dayOf(f.clock.simulated_at)} · simulated clock` : 'Mission'; },
  title: () => 'To-do list',
  mount(body, ctx) {
    setHTML(body, `
      <div class="todo-page">
        <section class="panel todo-page__mission">
          <header class="panel__head"><h3>Overall mission</h3><span class="muted small" id="tp-env"></span></header>
          <ol class="tasks" id="tp-mission"></ol>
          <div class="ground"><header class="panel__head"><h4>Ground link</h4><button type="button" class="btn btn--small" id="queue">Queue ground review</button></header>
            <ul class="packets" id="tp-packets"></ul></div>
        </section>
        <section class="panel todo-page__tests">
          <header class="panel__head"><h3>Take test</h3><span class="muted small">Human input · wall-clock timing · display only</span></header>
          <div class="take-test" id="tp-tests"></div>
          <p class="footnote">Reaction test: 45 s of three games mixed at random (Tap, Go/No-Go, Left/Right). Daily check-in: six 1–5 items (higher = more concern). Results appear on each astronaut's Brain region.</p>
        </section>
        <div class="todo-page__people" id="tp-people"></div>
      </div>`);
    body.addEventListener('click', (e) => onAction(ctx, e));
    return {
      render() {
        const f = ctx.feed.state.frame;
        if (!f) return;
        const s = ctx.store.get();
        body.querySelector('#tp-env').textContent = s.mode === 'deep' ? `Deep Space · ${s.delayMin} min one-way` : 'ISS · near-real-time';
        setHTML(body.querySelector('#tp-mission'), MISSION_TASKS.map((t) => {
          const st = missionState(ctx, t, f);
          return `<li class="task task--${st}"><span class="task__time mono">${hhmm(t.at)}</span>
            <div><strong>${t.title}</strong><span class="muted small">${t.detail}</span></div>
            ${st === 'done' ? `<span class="task__state">${STATE_LABEL.done}</span>` : `<button type="button" class="btn btn--small${st === 'due' ? ' btn--primary' : ''}" data-done="${t.id}">Mark done</button>`}</li>`;
        }).join(''));
        setHTML(body.querySelector('#tp-packets'), packetsHtml(ctx, f, 3));
        setHTML(body.querySelector('#tp-tests'), f.astronauts.map((a, i) => `<div class="take-test__col">
          <span class="take-test__who">P${i + 1} · ${a.name}</span>
          ${TESTS.map((t) => { const st = testState(ctx, a, t, f); return `<button type="button" class="test-tile test-tile--${st}" data-test="${t.id}" data-astronaut="${a.id}">
            <span>${t.title}</span><b>${st === 'done' ? '✓ Done · repeat' : st === 'due' ? 'Due · start' : `Scheduled ${hhmm(t.at)}`}</b></button>`; }).join('')}
          </div>`).join(''));
        setHTML(body.querySelector('#tp-people'), f.astronauts.map((a, i) => `<section class="panel person-tasks">
          <header class="panel__head"><h3>P${i + 1} tasks</h3><span class="muted small">${a.name}</span></header>
          <ol class="tasks tasks--tight">${personalTasks(ctx, a, f).map((t) => `<li class="task task--${t.state}">
            <span class="task__time mono">${hhmm(t.at)}</span><div><strong>${t.title}</strong><span class="muted small">${t.detail}</span></div>
            ${t.action ? `<button type="button" class="btn btn--small${t.state === 'due' ? ' btn--primary' : ''}" data-test="${t.action}" data-astronaut="${a.id}">${t.state === 'done' ? 'Repeat' : 'Start'}</button>`
              : `<span class="task__state">${STATE_LABEL[t.state]}</span>`}</li>`).join('')}</ol></section>`).join(''));
      },
    };
  },
};
