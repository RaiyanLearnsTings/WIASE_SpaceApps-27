// Cheap DOM writes for code that re-renders on every data frame. Assigning the same innerHTML again
// still makes the browser re-parse it, throw away the old nodes, lose hover/focus state and redo
// style and layout, so these helpers write only when the content actually changed.

/** Set innerHTML only if it differs from what this helper last wrote into the element. */
export function setHTML(el, html) {
  if (!el || el.__html === html) return false;
  el.innerHTML = html;
  el.__html = html;
  return true;
}

/** Set textContent only when it changed. */
export function setText(el, text) {
  if (el && el.textContent !== text) el.textContent = text;
}

/** Set className only when it changed (an identical write can still trigger a style recalc). */
export function setClass(el, cls) {
  if (el && el.className !== cls) el.className = cls;
}

/** Forget what setHTML wrote (call after replacing the element's content some other way). */
export function resetHTML(el) { if (el) el.__html = undefined; }

// ---- reduced-effects ("lite") mode ----------------------------------------------------------
// Weaker laptops (few cores / little memory) get no backdrop blur and a lower-resolution 3D view.
// The choice is stored per browser and can be changed in Settings: 'auto' | 'on' | 'off'.
const KEY = 'wiase-effects';
export function effectsPreference() {
  try { return localStorage.getItem(KEY) || 'auto'; } catch { return 'auto'; }
}
export function lowPowerDevice(nav = globalThis.navigator) {
  const cores = nav?.hardwareConcurrency || 8;
  const memory = nav?.deviceMemory || 8; // Chrome/Edge only; others report nothing
  return cores <= 4 || memory <= 4;
}
export function liteMode(pref = effectsPreference(), nav = globalThis.navigator) {
  return pref === 'on' || (pref === 'auto' && lowPowerDevice(nav));
}
export function setEffectsPreference(pref) {
  try { localStorage.setItem(KEY, pref); } catch { /* private mode */ }
  applyEffects();
}
let sessionLite = false; // set by the frame-rate check below; not stored, so it is re-measured next visit
export function applyEffects() {
  const lite = liteMode() || (sessionLite && effectsPreference() === 'auto');
  document.documentElement.classList.toggle('lite', lite);
  document.dispatchEvent(new CustomEvent('wiase:effects', { detail: { lite } }));
  return lite;
}

/** Median of frame intervals in ms (pure; tested). */
export function medianInterval(times) {
  const d = [];
  for (let i = 1; i < times.length; i++) d.push(times[i] - times[i - 1]);
  if (!d.length) return 0;
  d.sort((a, b) => a - b);
  return d[d.length >> 1];
}

let checked = false;
/**
 * Hardware hints miss laptops with many cores but a weak GPU, so the first time a page opens (with its
 * blurred backdrop) measure real frame pacing for ~1 s. If the median frame takes longer than `limitMs`
 * (≈ under 35 fps), switch this visit to reduced effects and call `onSwitch` once.
 */
export function checkFrameRate({ limitMs = 28, onSwitch = () => {} } = {}) {
  if (checked || effectsPreference() !== 'auto' || document.documentElement.classList.contains('lite')) return;
  checked = true;
  const times = [];
  const start = performance.now();
  const step = (t) => {
    if (t - start > 300) times.push(t); // skip the page's entrance animation
    if (t - start < 1300) { requestAnimationFrame(step); return; }
    if (!document.hidden && medianInterval(times) > limitMs) {
      sessionLite = true;
      applyEffects();
      onSwitch();
    }
  };
  requestAnimationFrame(step);
}
