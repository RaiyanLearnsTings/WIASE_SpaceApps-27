// WIASE bootstrap: live feed + UI store → a no-scroll dashboard of four cards, each expanding into a
// full page over a blurred backdrop (astronaut, to-do, alerts, cabin). The 3D viewer is created once
// and re-parented into the astronaut page; crew thumbnails share one small offscreen renderer.
import { api as liveApi } from './api.mjs';
import { ReplayFeed, replayApi, detectMode } from './replay.mjs';
import { LiveFeed } from './feed.mjs';
import { createStore } from './store.mjs';
import { ORGANS, organStatus } from './organs.mjs';
import { mountTopbar } from './panels/topbar.mjs';
import { mountCrew } from './panels/crew.mjs';
import { mountCabin, cabinPage } from './panels/cabin.mjs';
import { mountSchedule, todoPage } from './panels/schedule.mjs';
import { mountBottom, alertsPage } from './panels/bottom.mjs';
import { personPage } from './panels/person.mjs';
import { aboutPage } from './panels/about.mjs';
import { createTour } from './tour.mjs';
import { collectIssues } from './issues.mjs';
import { openResponse } from './panels/respond.mjs';
import { createPageHost } from './panels/overlay.mjs';
import { toast } from './panels/dialog.mjs';
import { openReaction } from './checkin/pvt.mjs';
import { openSurvey } from './checkin/survey.mjs';
import { exportSession } from './export.mjs';
import { FallbackViewer } from './body/fallback2d.mjs';

const $ = (id) => document.getElementById(id);
const store = createStore();
// Live when the local WIASE server answers; otherwise (static hosting) play the recorded demo run.
const mode = await detectMode();
let feed, api, run = null;
if (mode === 'replay') {
  run = await fetch('demo/run.json').then((r) => r.json());
  feed = new ReplayFeed(run);
  api = replayApi(feed, run);
} else {
  feed = new LiveFeed('/api/stream');
  api = liveApi;
}
document.body.dataset.mode = mode;
const PAGES = { person: personPage, todo: todoPage, alerts: alertsPage, cabin: cabinPage, about: aboutPage };

/** Re-render a region while keeping keyboard focus on the equivalent control. */
function withFocus(el, render) {
  const active = document.activeElement;
  let selector = null;
  if (active && el.contains(active) && active !== el) {
    const attr = [...active.attributes].find((a) => a.name.startsWith('data-') || a.name === 'id');
    if (attr) selector = `${active.tagName.toLowerCase()}[${attr.name}="${CSS.escape(attr.value)}"]`;
  }
  render();
  if (selector && !el.contains(document.activeElement)) el.querySelector(selector)?.focus({ preventScroll: true });
}

let statusCache = { frame: null, live: null, map: {} };
let issueCache = { frame: null, live: null, list: [] };
const ctx = {
  store, feed, api, withFocus, mode, run,
  baselines: null,
  scenarios: [],
  durations: { min_seconds: 60, max_seconds: 3600 },
  viewer: null,
  viewerIsFallback: false,
  viewerHost: (() => {
    const el = document.createElement('div');
    el.className = 'viewer';
    el.id = 'viewer';
    el.tabIndex = 0;
    el.setAttribute('aria-label', '3D body. Drag to rotate, right-drag or shift-drag to pan, scroll to zoom, arrow keys to pan.');
    return el;
  })(),
  thumbs: null,
  pageEl: $('page'),
  currentAstronaut() {
    return feed.state.frame?.astronauts.find((a) => a.id === store.get().astronaut) || null;
  },
  /** Region statuses for one astronaut on the current frame (memoised per frame). */
  regionStatuses(id) {
    const f = feed.state.frame;
    const live = feed.connection === 'live';
    if (statusCache.frame !== f || statusCache.live !== live) statusCache = { frame: f, live, map: {} };
    if (!statusCache.map[id]) {
      const a = f?.astronauts.find((x) => x.id === id);
      statusCache.map[id] = Object.fromEntries(ORGANS.map((o) => [o.id, organStatus(o, a, f, { live }).status]));
    }
    return statusCache.map[id];
  },
  openPage(id) { pages.open(PAGES[id]); },
  openResponse: (id) => openResponse(ctx, id),
  /** Current issues (alerts first, then watch items); memoised per frame. */
  issues() {
    const f = feed.state.frame;
    const live = feed.connection === 'live';
    if (issueCache.frame !== f || issueCache.live !== live) issueCache = { frame: f, live, list: collectIssues(f, { live }) };
    return issueCache.list;
  },
  openPerson(id) { store.set({ astronaut: id, organ: null }); pages.open(personPage); },
  openTest(kind, id) {
    if (id) store.set({ astronaut: id });
    if (kind === 'reaction') openReaction(ctx); else openSurvey(ctx);
  },
  openReaction: () => openReaction(ctx),
  openSurvey: () => openSurvey(ctx),
  exportSession: () => exportSession(ctx),
  async refreshCheckins(id = store.get().astronaut) {
    try {
      const summary = await ctx.api.checkins(id);
      store.set({ checkins: { ...store.get().checkins, [id]: summary } });
    } catch { /* shown as loading/unavailable */ }
  },
};
const pages = createPageHost(ctx);
ctx.pages = pages;
ctx.tour = createTour(ctx);

async function loadMetadata() {
  try {
    const [baselines, scen] = await Promise.all([ctx.api.baselines(), ctx.api.scenarios()]);
    ctx.baselines = baselines;
    ctx.scenarios = scen.scenarios;
    ctx.durations = scen.durations;
    for (const a of baselines.astronauts) ctx.refreshCheckins(a.id);
    scheduleRender();
  } catch {
    setTimeout(loadMetadata, 3000);
  }
}

// ---- 3D -----------------------------------------------------------------------------------
async function mountViewers() {
  const onSelect = (id) => store.set({ organ: id && store.get().organ === id ? null : id });
  try {
    const { BodyViewer, webglAvailable } = await import('./body/scene.mjs');
    if (!webglAvailable()) throw new Error('WebGL unavailable');
    ctx.viewer = new BodyViewer(ctx.viewerHost, { onSelect });
    const { BodyThumbs } = await import('./body/thumbs.mjs');
    ctx.thumbs = new BodyThumbs();
    ctx.thumbs.ready.then(scheduleRender);
  } catch (error) {
    console.warn('3D viewer unavailable, using 2D fallback:', error);
    ctx.viewerHost.classList.add('is-fallback');
    ctx.viewer = new FallbackViewer(ctx.viewerHost, { onSelect });
    ctx.viewerIsFallback = true;
  }
  ctx.viewer.select(store.get().organ);
  remountCrew();
}

// ---- rendering ----------------------------------------------------------------------------
const cards = [
  [$('topbar'), mountTopbar($('topbar'), ctx)],
  [$('card-alerts'), mountBottom($('card-alerts'), ctx)],
  [$('card-todo'), mountSchedule($('card-todo'), ctx)],
  [$('card-cabin'), mountCabin($('card-cabin'), ctx)],
];
let crewRender = null;
let crewBuiltWith;
function remountCrew() {
  crewBuiltWith = ctx.thumbs;
  crewRender = mountCrew($('card-crew'), ctx);
  scheduleRender();
}

let queued = false;
function scheduleRender() {
  if (queued) return;
  queued = true;
  requestAnimationFrame(() => { queued = false; render(); });
}

function render() {
  for (const [el, fn] of cards) withFocus(el, fn);
  if (crewBuiltWith !== ctx.thumbs) remountCrew();
  if (crewRender) withFocus($('card-crew'), crewRender);
  if (pages.active) withFocus(ctx.pageEl, pages.render);
  if (feed.state.frame && ctx.viewer) ctx.viewer.setStatuses(ctx.regionStatuses(store.get().astronaut));
}

// ---- events -------------------------------------------------------------------------------
document.addEventListener('click', (e) => {
  const issue = e.target.closest('[data-issue]');
  if (issue) { ctx.openResponse(issue.dataset.issue); return; }
  const b = e.target.closest('[data-expand]');
  if (b) { ctx.openPage(b.dataset.expand); return; }
  // Clicking anywhere on a card's body expands it too, unless the click was on its own control.
  const card = e.target.closest('[data-expand-card]');
  if (card && !e.target.closest('button, a, input, select, label, [role="button"], [data-open-astronaut]')) ctx.openPage(card.dataset.expandCard);
});

feed.subscribe((_, reason) => {
  if (reason === 'new-run') {
    store.set({ packets: [], acks: {}, tasksDone: {}, responses: {} });
    if (feed.state.sequence > 1 && mode === 'live') toast('New simulation run — local acknowledgements and packets cleared.');
  }
  scheduleRender();
});

store.subscribe((state, patch) => {
  if ('organ' in patch) {
    ctx.viewer?.select(state.organ);
    if (!('regionTab' in patch)) store.set({ regionTab: 'readings' });
  }
  if ('astronaut' in patch && !state.checkins[state.astronaut]) ctx.refreshCheckins(state.astronaut);
  scheduleRender();
});

// Tick the ground-link packet countdown even when no frame arrives.
setInterval(scheduleRender, 1000);

feed.start();
loadMetadata();
mountViewers();

// ?tour=1 starts the guided tour once data is on screen; ?tour=auto also advances it on a timer (video capture).
const tourParam = new URLSearchParams(location.search).get('tour');
if (tourParam) {
  const begin = () => (feed.state.frame && ctx.baselines ? setTimeout(() => ctx.tour.start({ autoplay: tourParam === 'auto' }), 1500) : setTimeout(begin, 300));
  begin();
}
