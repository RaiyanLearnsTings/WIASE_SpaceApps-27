// About & data page: the mission problem, how detection works, which NASA and open data drive
// which signals, measured detector validation, limitations, credits and AI-use disclosure.
// Tabs instead of scrolling. Validation numbers come from web/demo/validation.json (tools/evaluate.py).
import { escapeHtml } from '../format.mjs';
import { ATTRIBUTION } from '../body/anatomy.mjs';

const DATA = [
  { name: 'NASA Environmental Data App (OSDR) · ISS RR-6 cabin', nasa: true, url: 'https://visualization.osdr.nasa.gov/eda/',
    drives: 'Cabin CO₂, temperature and humidity: the 24-hour ISS profile replayed on the mission clock, and every cabin baseline and alert.' },
  { name: 'NASA RadLab (OSDR) · DosTel1', nasa: true, url: 'https://visualization.osdr.nasa.gov/radlab/gui/data-api/',
    drives: 'Absorbed dose rate (5-min medians) and cumulative absorbed dose on the bone-marrow region. No dose-equivalent conversion.' },
  { name: 'NASA Human Research Program risks · OCHMO CO₂ brief', nasa: true, url: 'https://www.nasa.gov/hrp/risks/',
    drives: 'Context for each body region (sleep, behaviour, cardiovascular, hypoxia, CO₂, radiation). Not used as thresholds.' },
  { name: 'BIDSleep (PhysioNet)', url: 'https://physionet.org/content/bidsleep-dataset/1.0.1/',
    drives: 'Per-astronaut sleep night: stages, duration, efficiency and stage-specific heart rate.' },
  { name: 'Pulse Transit Time PPG (PhysioNet)', url: 'https://physionet.org/content/pulse-transit-time-ppg/1.1.0/',
    drives: 'Seated heart rate, SpO₂ and cuff blood-pressure baselines.' },
  { name: 'OpenNeuro ds004902', url: 'https://openneuro.org/datasets/ds004902',
    drives: 'Normal-sleep PVT reaction time and lapses (simulated cognitive check-ins).' },
  { name: 'QoL_Stress (PhysioNet)', url: 'https://physionet.org/content/qol-stress/1.0.0/',
    drives: 'Relaxed-phase STAI-S state-anxiety baseline.' },
];

const STEPS = [
  ['Measure', 'Wearable-style vitals, cognitive check-ins and the shared cabin, on one mission clock.'],
  ['Personal baseline', 'Each person’s own centre and robust spread (1.4826 × MAD), adjusted for activity and sleep stage.'],
  ['Deviation', 'Flag when a reading is ≥ 3 robust spreads (or a minimum meaningful change) away from that person’s expected value.'],
  ['Confirm', 'Only alert if it persists 12 simulated seconds; cognitive stress needs 2 of 3 signals on fresh check-ins.'],
  ['Explain', 'Show the reading vs expected vs threshold, light the organs and nerves involved, suggest non-diagnostic checks.'],
  ['Recover', 'Clear only after 8 s back inside 70 % of the trigger distance; missing data never counts as recovery.'],
];

function overview() {
  return `<div class="about-grid">
    <section class="panel"><header class="panel__head"><h3>The problem</h3></header>
      <p>On the way to Mars a message to Earth takes <strong>3–22 minutes one way</strong>. A crew of three cannot wait for a
        flight surgeon to notice a trend. They need on-board decision support that knows what is normal <em>for each person</em>,
        tells them early when something changes, and explains why, without claiming to diagnose.</p>
      <p>WIASE watches each astronaut’s heart rate, blood pressure, SpO₂, sleep and cognition, plus the shared cabin air,
        against personal baselines calibrated from real data, including <strong>NASA ISS cabin and radiation records</strong>.</p>
      <p class="muted small">Synthetic demonstration. Not flight software, medical advice or a validated device.</p>
    </section>
    <section class="panel"><header class="panel__head"><h3>How detection works</h3></header>
      <ol class="pipeline">${STEPS.map(([t, d], i) => `<li><span class="pipeline__n">${i + 1}</span><div><strong>${t}</strong><span class="muted small">${d}</span></div></li>`).join('')}</ol>
    </section>
    <section class="panel"><header class="panel__head"><h3>Who uses it</h3></header>
      <ul class="plain">
        <li><strong>Crew</strong>: a 45-second reaction test mixing three random mini-games (Tap, Go/No-Go, Left/Right) and a six-question daily check-in; their own trends without a stigmatising score.</li>
        <li><strong>Crew medical officer</strong>: who needs attention, what changed, is the cabin also changing, what to check next.</li>
        <li><strong>Ground</strong>: review packets that arrive after the communication delay; the crew does not wait for them.</li>
      </ul>
    </section>
  </div>`;
}

function data(ctx) {
  const prov = ctx.baselines?.provenance || {};
  return `<div class="about-data">
    <table class="data-table"><thead><tr><th>Source</th><th>What it drives in WIASE</th></tr></thead><tbody>
      ${DATA.map((d) => `<tr><th scope="row">${d.nasa ? '<span class="tag tag--nasa">NASA</span> ' : ''}<a href="${d.url}" target="_blank" rel="noopener">${escapeHtml(d.name)} ↗</a></th>
        <td>${d.drives}</td></tr>`).join('')}
    </tbody></table>
    <p class="muted small">Synthetic or assumed (labelled everywhere in the app): cabin noise (${escapeHtml(prov.noise_dba?.note || 'no data supplied')}),
      zone sensor offsets on the cabin map, O₂ fraction / pressure (fixed reference), crew identities, schedules and scenario effects.
      Baselines combine independent study participants; they are not longitudinal astronaut records.</p>
  </div>`;
}

function validation(v) {
  if (!v) return '<p class="muted">Validation results not found. Run <code>python3 tools/evaluate.py</code>.</p>';
  const LABEL = { high_resting_hr: 'Elevated resting HR', cognitive_stress: 'Cognitive stress', co2_buildup: 'Cabin CO₂ buildup', warm_humid_cabin: 'Warm, humid cabin' };
  const UNIT = { high_resting_hr: 'bpm', cognitive_stress: 'ms RT', co2_buildup: 'ppm', warm_humid_cabin: '°C' };
  const s = (x) => (x === null || x === undefined ? '—' : `${Math.round(x)} s`);
  return `<div class="about-grid about-grid--2">
    <section class="panel"><header class="panel__head"><h3>Full-size scenarios</h3>
      <span class="muted small">${v.method.seeds.length} seeds · ${v.false_alerts.crew_days} clean crew-days</span></header>
      <p class="big-stat"><strong>${v.false_alerts.total}</strong> false alerts in ${v.false_alerts.crew_days} simulated crew-days with nothing injected</p>
      <table class="data-table"><thead><tr><th>Scenario</th><th>Detected</th><th>Median time to alert</th><th>Clears after end</th></tr></thead><tbody>
        ${Object.entries(v.scenarios).map(([k, r]) => `<tr><th scope="row">${LABEL[k]}</th><td class="mono">${r.detected}/${r.injections}</td>
          <td class="mono">${s(r.median_time_to_alert_s)}</td><td class="mono">${s(r.median_time_to_clear_s)}</td></tr>`).join('')}
      </tbody></table></section>
    <section class="panel"><header class="panel__head"><h3>Sensitivity: smallest change caught</h3></header>
      <table class="data-table"><thead><tr><th>Scenario</th>${(v.sensitivity.high_resting_hr || []).map((r) => `<th>${Math.round(r.intensity * 100)}%</th>`).join('')}</tr></thead><tbody>
        ${Object.entries(v.sensitivity).map(([k, rows]) => `<tr><th scope="row">${LABEL[k]}</th>${rows.map((r) =>
          `<td class="mono ${r.detected === r.injections ? 'ok' : r.detected ? 'part' : 'miss'}">+${r.change}<small> ${UNIT[k]}</small><br>${r.detected}/${r.injections}</td>`).join('')}</tr>`).join('')}
      </tbody></table>
      <p class="muted small">A sustained heart-rate rise is caught reliably at +28 bpm (missed at +14), CO₂ at +340 ppm (half the time at +200). The cognitive rule needs the full
        change because it requires 2 of 3 signals over wide personal spreads. We would tune it with real crew data.</p>
    </section>
    <p class="footnote about-note">${escapeHtml(v.method.note)} The simulator’s noise is cleaner than real wearables, so real false-alarm
      rates are unknown. Reproduce: <code>python3 tools/evaluate.py</code> → docs/VALIDATION.md.</p>
  </div>`;
}

function credits() {
  return `<div class="about-grid">
    <section class="panel"><header class="panel__head"><h3>Limitations</h3></header>
      <ul class="plain">
        <li>Crew telemetry is simulated (calibrated on Earth studies and ISS records); no real astronaut data.</li>
        <li>Thresholds are demo rules (personal robust spreads), not NASA or clinical limits.</li>
        <li>ISS cabin data does not model deep-space conditions; radiation is absorbed dose only.</li>
        <li>Human check-ins are display-only and never open alerts. Nothing here diagnoses or treats.</li>
      </ul></section>
    <section class="panel"><header class="panel__head"><h3>Credits & licences</h3></header>
      <ul class="plain small">
        <li>${ATTRIBUTION} Phrenic nerves approximated.</li>
        <li>three.js r170, GLTFLoader, OrbitControls (MIT) · meshoptimizer decoder (MIT).</li>
        <li>Fonts: IBM Plex Sans, Sans Condensed and Mono (SIL Open Font License 1.1), bundled in web/vendor/fonts for offline use.</li>
        <li>Datasets as listed on the Data tab, under their own licences.</li>
      </ul></section>
    <section class="panel"><header class="panel__head"><h3>Use of AI tools</h3></header>
      <p class="small">The concept, design decisions, data selection and calibration choices are the team’s. An AI coding assistant
        (Claude Code) helped write and test code and documentation, and drove a scripted Blender pipeline that built the anatomy
        model from Z-Anatomy. No AI-generated images, video or audio are used in the app.</p>
      <p class="muted small">Team Super Space Sages · NASA Space Apps Challenge 2026.</p></section>
  </div>`;
}

export const aboutPage = {
  id: 'about',
  kicker: () => 'Crew health decision support for deep space',
  title: () => 'About WIASE',
  mount(body, ctx) {
    let tab = 'overview';
    let v = null;
    fetch('demo/validation.json').then((r) => (r.ok ? r.json() : null)).then((x) => { v = x; render(); }).catch(() => {});
    body.innerHTML = `<div class="about">
      <div class="tabs" role="tablist">${[['overview', 'Overview'], ['data', 'Data & NASA sources'], ['validation', 'Validation'], ['credits', 'Limits, credits & AI use']]
        .map(([k, l]) => `<button type="button" role="tab" data-about-tab="${k}">${l}</button>`).join('')}</div>
      <div class="about__body" id="about-body"></div></div>`;
    body.addEventListener('click', (e) => {
      const t = e.target.closest('[data-about-tab]');
      if (t) { tab = t.dataset.aboutTab; render(); }
    });
    function render() {
      body.querySelectorAll('[data-about-tab]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.aboutTab === tab)));
      const html = tab === 'overview' ? overview() : tab === 'data' ? data(ctx) : tab === 'validation' ? validation(v) : credits();
      const el = body.querySelector('#about-body');
      if (el.dataset.html !== `${tab}:${!!v}`) { el.innerHTML = html; el.dataset.html = `${tab}:${!!v}`; }
    }
    return { render };
  },
};
