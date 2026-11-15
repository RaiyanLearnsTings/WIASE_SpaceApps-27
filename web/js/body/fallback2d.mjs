// Front-view SVG figure used when WebGL is unavailable. Same hotspots and selection behaviour.
import { ORGANS } from '../organs.mjs';
import { createHotspotLayer } from './hotspots.mjs';

const VIEW = { x0: -0.55, x1: 0.55, y0: -0.02, y1: 1.86 };

export class FallbackViewer {
  constructor(container, { onSelect }) {
    this.container = container;
    this.selected = null;
    this.statuses = {};
    const wrap = document.createElement('div');
    wrap.className = 'fallback2d';
    wrap.innerHTML = `
      <svg viewBox="-0.55 -1.86 1.1 1.88" preserveAspectRatio="xMidYMid meet" role="img"
           aria-label="Front-view body outline (3D view unavailable on this device)">
        <g transform="scale(1,-1)" fill="rgba(127,182,217,.08)" stroke="#7fb6d9" stroke-width=".006">
          <ellipse cx="0" cy="1.635" rx=".097" ry=".118"/>
          <path d="M-.05 1.53 L-.05 1.47 -.19 1.43 -.29 1.15 -.33 .82 -.30 .80 -.25 1.12 -.17 1.30 -.17 .93
                   -.15 .5 -.14 .04 -.06 .02 -.07 .5 -.02 .9 .02 .9 .07 .5 .06 .02 .14 .04 .15 .5 .17 .93
                   .17 1.30 .25 1.12 .30 .80 .33 .82 .29 1.15 .19 1.43 .05 1.47 .05 1.53Z"/>
        </g>
      </svg>`;
    container.append(wrap);
    this.wrap = wrap;
    this.hotspots = createHotspotLayer(container, onSelect);
    const place = () => {
      const { clientWidth: w, clientHeight: h } = container;
      const scale = Math.min(w / (VIEW.x1 - VIEW.x0), h / (VIEW.y1 - VIEW.y0));
      const ox = (w - scale * (VIEW.x1 - VIEW.x0)) / 2, oy = (h - scale * (VIEW.y1 - VIEW.y0)) / 2;
      for (const o of ORGANS) {
        this.hotspots.place(o.id, ox + (o.anchor[0] - VIEW.x0) * scale, oy + (VIEW.y1 - o.anchor[1]) * scale, false);
      }
    };
    new ResizeObserver(place).observe(container);
    place();
  }

  setStatuses(statuses) { this.statuses = statuses; this.hotspots.setStatuses(statuses, this.selected); }
  select(id) { this.selected = id; this.hotspots.setStatuses(this.statuses, id); }
  setView() { /* 2D view is fixed */ }
}
