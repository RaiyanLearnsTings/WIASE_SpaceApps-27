// Dashboard card: one column per astronaut with a 3D body thumbnail (out-of-range structures lit),
// server alert status, key vitals and the regions that need attention. Opens the astronaut page.
import { ACTIVITY, STATUS, fmt, statusPill } from '../format.mjs';
import { criticalRegions } from '../organs.mjs';
import { fallbackThumb } from '../body/thumbs.mjs';
import { cardHead } from './card.mjs';

export function mountCrew(el, ctx) {
  const { feed } = ctx;
  el.innerHTML = `${cardHead({ idx: '04', title: 'Crew', kicker: 'Lit organs = outside that person’s own range', keys: ['1', '2', '3'] })}
    <div class="crew-grid" id="crew-grid"><p class="muted">Waiting for the simulator…</p></div>
    <footer class="card__foot"><span id="crew-foot"></span><span class="muted">Select an astronaut for vitals, baselines and 3D</span></footer>`;
  const grid = el.querySelector('#crew-grid');
  let built = false;

  grid.addEventListener('click', (e) => {
    const col = e.target.closest('[data-open-astronaut]');
    if (col) ctx.openPerson(col.dataset.openAstronaut);
  });

  function build(f) {
    grid.innerHTML = f.astronauts.map((a) => `
      <article class="crew-col" data-id="${a.id}" data-open-astronaut="${a.id}">
        <button type="button" class="crew-col__open" data-open-astronaut="${a.id}" aria-label="Open ${a.name} details">
          <div class="crew-col__thumb">${ctx.thumbs ? '<canvas class="thumb" aria-hidden="true"></canvas>' : '<div class="thumb-fallback"></div>'}</div>
        </button>
        <div class="crew-col__info">
          <span class="crew-col__kicker">Astronaut</span>
          <strong class="crew-col__id">${a.name.replace(/^Astronaut\s*/, '')}</strong>
          <div class="crew-col__status"></div>
          <ul class="flags"></ul>
          <span class="crew-col__meta mono" data-meta></span>
        </div>
      </article>`).join('');
    built = true;
  }

  return function render() {
    const f = feed.state.frame;
    if (!f) return;
    if (!built) build(f);
    const live = feed.connection === 'live';
    for (const a of f.astronauts) {
      const col = grid.querySelector(`[data-id="${a.id}"]`);
      const status = live ? a.alert_status : 'unavailable';
      const regions = ctx.regionStatuses(a.id);
      col.className = `crew-col crew-col--${status}`;
      if (ctx.thumbs) ctx.thumbs.draw(col.querySelector('canvas'), regions);
      else col.querySelector('.thumb-fallback').innerHTML = fallbackThumb(regions);
      col.querySelector('.crew-col__status').innerHTML = statusPill(status, status === 'normal' ? 'Nominal' : STATUS[status].label);
      col.querySelector('[data-meta]').textContent = `${ACTIVITY[a.activity] || a.activity} · ${fmt(a.heart_rate_bpm, 'heart_rate_bpm')}`;
      const crit = criticalRegions(regions).slice(0, 3);
      col.querySelector('.flags').innerHTML = crit.length
        ? crit.map((o) => {
          // Regions with no personal alert rule light up from a shared cabin alert — say so, so "Nominal" + ▲ isn't contradictory.
          const shared = regions[o.id] === 'alert' && !(o.rules || []).length;
          return `<li class="flag flag--${regions[o.id]}"><span aria-hidden="true">${STATUS[regions[o.id]].icon}</span>${o.short}${shared ? '<small> · cabin</small>' : ''}</li>`;
        }).join('')
        : (live ? '' : '<li class="flag flag--quiet">No live data</li>');
    }
    const flagged = f.astronauts.filter((a) => a.alert_status === 'alert').length;
    el.querySelector('#crew-foot').textContent = live ? (flagged ? `${flagged} of 3 need attention` : 'All 3 nominal') : 'Feed not live';
  };
}
