// Guided tour for first-time viewers (judges). Coach marks sit in a manual popover so they stay above
// open page dialogs. Steps drive the app: jump to recorded chapters (or trigger live scenarios),
// open the astronaut page, select the brain, open the cabin map.
// ?tour=1 starts it; ?tour=auto advances on a timer (for screen-recording the demo video).

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

function steps(ctx) {
  const jump = async (id, target) => {
    if (ctx.mode === 'replay') await ctx.api.trigger(id);
    else ctx.feed.accept(await ctx.api.trigger(id, target, 900));
  };
  const closeDialog = () => { const d = document.getElementById('dialog'); if (d?.open) d.close(); };
  const closePage = () => { closeDialog(); ctx.pages.close(); };
  const openLatestStory = (rule, target) => {
    const e = ctx.feed.state.events.find((x) => x.type === 'opened' && x.rule === rule && x.target === target); // newest first
    if (e) ctx.openStory(e.alert_id, { stage: 2 });
  };
  return [
    { title: 'WIASE · crew health for deep space', text: 'Mars is up to 22 light-minutes away, so the crew must spot health changes themselves. WIASE compares each astronaut with their <b>own</b> baseline, calibrated from real data including NASA ISS cabin and radiation records.',
      target: '.brand', before: closePage },
    { title: 'Three astronauts, one glance', text: 'Each body is a real anatomy model. Organs and nerves of any region outside that person’s range light up: yellow for watch, crimson for alert.',
      target: '#card-crew' },
    { title: 'A change appears', text: 'Astronaut 002’s reaction time slows and anxiety rises on check-ins. Once 2 of 3 cognitive signals stay out of range, the server confirms an alert and 002’s brain lights up.',
      target: '#card-crew .crew-col[data-id="astro-2"]', before: () => jump('cognitive_stress', 'astro-2'), settle: 2200 },
    { title: 'How it was confirmed', text: 'Any alert can be walked through on its real frames: the personal threshold, the 12-second confirmation (yellow band), the moment the server opened it (red line), then recovery. Step through it with Back / Next.',
      target: '.story__nav', before: () => openLatestStory('cognitive_stress', 'astro-2'), settle: 900 },
    { title: 'The evidence behind it', text: 'Open the astronaut: the brain is isolated, and the panel shows each reading against expected value and threshold, the organs involved, and non-diagnostic checks to do next.',
      target: '#pp-side', before: async () => { closeDialog(); ctx.openPerson('astro-2'); await wait(900); ctx.store.set({ organ: 'brain' }); }, settle: 1800 },
    { title: 'The shared cabin', text: 'CO₂ builds up, worst in the Work module. The map shows which sensor drives the cabin alert, with a radius for how far past threshold it is. It is shown as context, not as the cause of a crew change.',
      target: '.cabin-page__svg', before: async () => { closePage(); await jump('co2_buildup', 'cabin'); await wait(500); ctx.openPage('cabin'); }, settle: 1800 },
    { title: 'Built for the delay', text: 'Deep Space mode simulates the one-way comms delay: ground review packets arrive minutes later, so the crew acts on board. Check-ins, trends, events and export are one click away.',
      target: '.topbar [aria-label="Operating environment"]', before: closePage },
    ...(ctx.mode === 'replay' ? [{ title: 'Explore at your own pace', text: 'Pause, drag the timeline or click a chapter tick to jump. Hover any chart (or focus it and use the arrow keys) for exact values; every chart on screen follows the same moment. Press <kbd>?</kbd> for keyboard shortcuts.',
      target: '.scrub', before: closePage, playing: true }] : []),
    { title: 'How we know it works', text: 'Measured on the simulator: 0 false alerts in 30 crew-days, every full-size change caught in ~15–21 s, and the smallest detectable change per signal. See About → Validation.',
      target: '#about-btn', before: closePage, last: true, playing: true },
  ];
}

export function createTour(ctx) {
  const pop = document.createElement('div');
  pop.className = 'tour';
  pop.setAttribute('popover', 'manual');
  pop.setAttribute('role', 'dialog');
  pop.setAttribute('aria-label', 'Guided tour');
  const ring = document.createElement('div');
  ring.className = 'tour-ring';
  ring.setAttribute('popover', 'manual');
  ring.setAttribute('aria-hidden', 'true');
  document.body.append(ring, pop);
  let list = [], i = 0, active = false, auto = false, timer = 0, marked = null;

  // Re-show so both sit on top of any dialog opened since (top layer is ordered by show time).
  const reshow = (el) => { try { if (el.matches(':popover-open')) el.hidePopover(); el.showPopover(); } catch { el.classList.add('is-open'); } };
  const show = () => { reshow(ring); reshow(pop); };
  const hide = () => { for (const el of [ring, pop]) { try { el.hidePopover(); } catch { el.classList.remove('is-open'); } } };

  function place(el) {
    marked = el;
    const r = el?.getBoundingClientRect();
    ring.style.display = r ? '' : 'none';
    if (r) Object.assign(ring.style, { left: `${r.left - 4}px`, top: `${r.top - 4}px`, width: `${r.width + 8}px`, height: `${r.height + 8}px` });
    const w = Math.min(380, innerWidth - 24);
    pop.style.width = `${w}px`;
    const h = pop.offsetHeight || 180;
    let x = r ? r.left + r.width / 2 - w / 2 : (innerWidth - w) / 2;
    let y = r ? (r.bottom + 12 + h < innerHeight ? r.bottom + 12 : r.top - h - 12) : (innerHeight - h) / 2;
    if (r && y < 8) {
      // Tall target: sit beside it (left if there is room, else right), vertically centred.
      y = Math.min(innerHeight - h - 8, Math.max(8, r.top + r.height / 2 - h / 2));
      x = r.left - w - 16 >= 8 ? r.left - w - 16 : r.right + 16;
    }
    pop.style.left = `${Math.max(12, Math.min(innerWidth - w - 12, x))}px`;
    pop.style.top = `${Math.max(8, y)}px`;
  }

  async function go(n) {
    clearTimeout(timer);
    i = Math.max(0, Math.min(list.length - 1, n));
    const s = list[i];
    pop.innerHTML = `<span class="card-kicker">Tour · ${i + 1} / ${list.length}</span><h3>${s.title}</h3><p>${s.text}</p>
      <div class="tour__actions"><button type="button" class="btn btn--small" data-tour="exit">${s.last ? 'Close' : 'Exit tour'}</button>
      <span class="spacer"></span>${i ? '<button type="button" class="btn btn--small" data-tour="back">Back</button>' : ''}
      ${s.last ? '<button type="button" class="btn btn--small btn--primary" data-tour="about">Open About</button>' : '<button type="button" class="btn btn--small btn--primary" data-tour="next">Next</button>'}</div>`;
    freeze(!s.playing);
    try { await s.before?.(); } catch (e) { console.warn('tour step', e); }
    await wait(s.settle || 350);
    if (!active) return;
    show();
    pop.dataset.target = s.target;
    place(document.querySelector(s.target));
    pop.querySelector('[data-tour="next"],[data-tour="about"]')?.focus({ preventScroll: true });
    if (auto && !s.last) timer = setTimeout(() => go(i + 1), 4200);
  }

  pop.addEventListener('click', (e) => {
    const b = e.target.closest('[data-tour]');
    if (!b) return;
    if (b.dataset.tour === 'next') go(i + 1);
    else if (b.dataset.tour === 'back') go(i - 1);
    else if (b.dataset.tour === 'about') { stop(); ctx.openPage('about'); }
    else stop();
  });
  document.addEventListener('keydown', (e) => { if (active && e.key === 'Escape') stop(); }, true);
  addEventListener('resize', () => { if (active) place(marked); });

  // The tour shows fixed moments (each step jumps to its chapter), so the recording does not need to keep
  // playing underneath it: holding it saves a full re-render of the dashboard ~3 times a second.
  const freeze = (on) => ctx.feed.setFrozen?.(on);
  function start({ autoplay = false } = {}) {
    list = steps(ctx);
    active = true;
    auto = autoplay;
    freeze(true);
    go(0);
  }
  function stop() {
    active = false;
    clearTimeout(timer);
    marked = null;
    freeze(false);
    hide();
  }
  return { start, stop, get active() { return active; } };
}
