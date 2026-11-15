// Transition veil for the app's heavy moments (speed changes, chapter jumps, restarts, live scenario
// triggers). Instead of letting the dashboard stutter through a burst of work in plain view, a short
// scrim covers it with a plain statement of what is happening ("Switching 10× → 60×"), the work runs
// underneath, and the veil lifts once the new state has been drawn.
//  - shown for at least MIN_MS so it reads as deliberate, never as a flicker
//  - the top bar stays visible (it shows the control that was used)
//  - reduced-effects mode: no blur; reduced motion: no fade or progress animation
//  - nested or overlapping calls share one veil; errors still lift it
const MIN_MS = 380;
const frame = () => new Promise((r) => requestAnimationFrame(() => r()));
let veil = null;
let depth = 0;

function ensureVeil() {
  if (veil) return veil;
  veil = document.createElement('div');
  veil.className = 'veil';
  veil.setAttribute('role', 'status');
  veil.setAttribute('aria-live', 'polite');
  veil.innerHTML = '<div class="veil__card"><span class="veil__label"></span><span class="veil__bar" aria-hidden="true"><i></i></span></div>';
  document.body.append(veil);
  return veil;
}

/** Cover the dashboard below the top bar (the bar may be taller, or scrolled away, on small screens). */
function place(el) {
  const bar = document.getElementById('topbar')?.getBoundingClientRect();
  el.style.top = `${Math.max(0, Math.round(bar ? bar.bottom + 4 : 0))}px`;
}

/**
 * Run `work` (sync or async) behind the veil. Resolves with work's result after the next render.
 * @param {string} label  e.g. "Switching 10× → 60×"
 */
export async function withTransition(label, work) {
  const el = ensureVeil();
  depth += 1;
  const started = performance.now();
  el.querySelector('.veil__label').textContent = label;
  place(el);
  el.classList.remove('is-leaving');
  el.classList.add('is-on');
  await frame(); await frame(); // let the veil paint before the heavy work starts
  try {
    return await work();
  } finally {
    await frame(); await frame(); // the app re-renders on the next animation frame; let that land underneath
    const wait = MIN_MS - (performance.now() - started);
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    depth -= 1;
    if (depth === 0) {
      el.classList.add('is-leaving');
      setTimeout(() => { if (depth === 0) el.classList.remove('is-on', 'is-leaving'); }, 200);
    }
  }
}
