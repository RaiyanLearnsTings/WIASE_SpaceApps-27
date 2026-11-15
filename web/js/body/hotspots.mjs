// HTML hotspot buttons layered over the 3D canvas (or the 2D fallback). Real <button>s, so they
// are keyboard-focusable and screen-reader labelled; colour is always paired with an icon + text.
import { ORGANS } from '../organs.mjs';
import { STATUS } from '../format.mjs';

export function createHotspotLayer(container, onSelect) {
  const layer = document.createElement('div');
  layer.className = 'hotspots';
  const buttons = new Map();
  for (const organ of ORGANS) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'hotspot hotspot--unavailable';
    button.dataset.organ = organ.id;
    button.innerHTML = `<span class="hotspot__dot" aria-hidden="true"></span><span class="hotspot__label">${organ.short}</span>`;
    button.addEventListener('click', (e) => { e.stopPropagation(); onSelect(organ.id); });
    layer.append(button);
    buttons.set(organ.id, button);
  }
  container.append(layer);

  return {
    buttons,
    setStatuses(statuses, selected) {
      for (const [id, button] of buttons) {
        const status = statuses[id] || 'unavailable';
        button.className = `hotspot hotspot--${status}${selected === id ? ' is-selected' : ''}`;
        const organ = ORGANS.find((o) => o.id === id);
        button.setAttribute('aria-label', `${organ.label}: ${STATUS[status].label}`);
        button.setAttribute('aria-pressed', String(selected === id));
      }
    },
    place(id, xPx, yPx, behind) {
      const b = buttons.get(id);
      b.style.transform = `translate(${xPx}px, ${yPx}px)`;
      b.classList.toggle('is-behind', behind);
    },
  };
}
