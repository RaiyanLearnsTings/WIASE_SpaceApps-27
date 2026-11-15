// Body-region model: which organs/nerves a hotspot represents, which live metrics and server
// alert rules drive it, and how to explain it. Pure module — tested in tests/web/organs.test.mjs.
//
// Status rules (deterministic, mirrors the server; adds no new thresholds):
//   alert       — a server alert for one of the region's rules is active
//   watch       — a metric is past its server threshold but no alert is confirmed (pending,
//                 or a telemetry-only metric such as BP / SpO₂ / noise that has no alert rule)
//   unavailable — feed stale/disconnected, or none of the region's metrics are present
//   normal      — metrics present and inside thresholds (not proof of good health)
//   info        — telemetry-only region with no thresholds (radiation)

export const STRUCTURES = {
  brain: 'Brain (cerebral hemispheres)',
  hypothalamus: 'Hypothalamus',
  brainstem: 'Brainstem',
  spinal_cord: 'Spinal cord',
  vagus: 'Vagus nerve (CN X)',
  heart: 'Heart',
  aorta: 'Aorta',
  arm_artery: 'Left subclavian–brachial artery (cuff site)',
  lungs: 'Lungs',
  trachea: 'Trachea',
  phrenic: 'Phrenic nerves (approximated path)',
  skin: 'Skin',
  arm_nerve: 'Brachial plexus & median nerve',
  ears: 'Inner ear / cochlea',
  auditory_nerve: 'Auditory nerve (CN VIII)',
  marrow: 'Bone marrow (pelvis, femurs)',
  spine_bones: 'Spine & rib cage',
};

export const ORGANS = [
  {
    id: 'brain',
    label: 'Brain & nervous system',
    short: 'Brain',
    structures: ['brain', 'brainstem', 'spinal_cord'],
    anchor: [0, 1.7, 0.06],
    metrics: ['median_reaction_time_ms', 'lapses', 'state_anxiety_score', 'last_sleep_duration_min'],
    rules: ['cognitive_stress'],
    checkins: true,
    nasa: [{ title: 'Risk of Behavioral Changes and Psychiatric Disorders', url: 'https://www.nasa.gov/reference/risk-of-behavioral-conditions-and-psychiatric-disorders/' }, { title: 'Risk of Inadequate Sleep and Irregular Schedules', url: 'https://www.nasa.gov/reference/risk-from-inadequate-sleep-and-irregular-schedules/' }],
    about: 'Cognitive performance (simulated PVT reaction time and lapses), state anxiety and last night’s sleep, each compared with this astronaut’s own baseline.',
    explain: {
      alert: 'At least two cognitive indicators have stayed beyond this astronaut’s personal threshold across fresh check-ins. This pattern matches the server’s cognitive-stress rule. It is a deviation from baseline, not a diagnosis.',
      watch: 'One or more cognitive or sleep measures are past the personal threshold but the alert rule has not confirmed (it needs 2 of 3 cognitive signals on fresh samples).',
      normal: 'Cognitive measures and last sleep are within this astronaut’s personal range.',
      unavailable: 'Cognitive check-ins are not sampled during sleep, exercise or recovery, or the feed is not live.',
    },
    checks: [
      'Repeat a standardized reaction-time check when the crew member is available.',
      'Review recent sleep, workload and schedule with the crew member.',
      'Follow mission behavioral-health procedures if concerns persist.',
    ],
  },
  {
    id: 'heart',
    label: 'Heart & autonomic control',
    short: 'Heart',
    structures: ['heart', 'vagus', 'brainstem'],
    anchor: [0.035, 1.28, 0.12],
    metrics: ['heart_rate_bpm'],
    rules: ['heart_rate_high'],
    nasa: [{ title: 'Risk of Cardiovascular Adaptations', url: 'https://www.nasa.gov/reference/risk-of-cardiovascular-adaptations/' }],
    about: 'Heart rate compared with an expected value for the current activity or sleep stage. The vagus nerve and brainstem regulate resting heart rate.',
    explain: {
      alert: 'Heart rate has stayed above the activity-adjusted personal threshold long enough to confirm an alert (12 simulated seconds).',
      watch: 'Heart rate is above the activity-adjusted threshold; the server is waiting to confirm it is sustained.',
      normal: 'Heart rate is within the expected range for the current activity.',
      unavailable: 'No current heart-rate reading.',
    },
    checks: [
      'Verify sensor placement and signal quality.',
      'Confirm current activity (recent exercise or movement raises heart rate).',
      'Follow the mission health protocol if elevation persists at rest.',
    ],
  },
  {
    id: 'vessels',
    label: 'Circulation · blood pressure',
    short: 'Blood pressure',
    structures: ['arm_artery', 'aorta', 'heart'],
    anchor: [0.285, 1.13, 0.06],
    metrics: ['systolic_mmhg', 'diastolic_mmhg'],
    rules: [],
    telemetryOnly: true,
    nasa: [{ title: 'Risk of Cardiovascular Adaptations', url: 'https://www.nasa.gov/reference/risk-of-cardiovascular-adaptations/' }],
    about: 'Cuff systolic and diastolic pressure (brachial artery). Baseline from the workbook’s seated PPG study; activity and overnight dipping are simulated.',
    explain: {
      watch: 'Blood pressure is past this astronaut’s personal threshold. There is no blood-pressure alert rule in this demo, so this is shown as Watch only.',
      normal: 'Blood pressure is within this astronaut’s personal range for the current activity.',
      unavailable: 'No current blood-pressure reading.',
    },
    checks: [
      'Repeat the measurement seated and at rest, with correct cuff size and arm position.',
      'Consider recent exercise, fluid shifts and medication timing.',
      'Escalate per mission medical procedures if confirmed.',
    ],
  },
  {
    id: 'lungs',
    label: 'Lungs & breathing',
    short: 'Lungs',
    structures: ['lungs', 'trachea', 'phrenic'],
    anchor: [-0.11, 1.31, 0.1],
    metrics: ['spo2_pct'],
    cabinMetrics: ['co2_ppm'],
    rules: [],
    cabinRules: ['co2_high'],
    nasa: [{ title: 'Risk of Hypoxia', url: 'https://www.nasa.gov/reference/risk-of-hypoxia/' }, { title: 'OCHMO-TB-004 Carbon Dioxide (technical brief)', url: 'https://www.nasa.gov/ochmo-tb-004-carbon-dioxide-2/' }],
    about: 'Blood oxygen saturation (SpO₂) with shared cabin CO₂ shown as context. Co-occurrence is not evidence that the cabin caused a change.',
    explain: {
      alert: 'The shared cabin CO₂ alert is active. It applies to the whole crew; the astronaut’s own SpO₂ is shown alongside it. No causal link is claimed.',
      watch: 'SpO₂ or cabin CO₂ is past its threshold without a confirmed alert.',
      normal: 'SpO₂ and cabin CO₂ are within their expected ranges.',
      unavailable: 'No current SpO₂ or CO₂ reading.',
    },
    checks: [
      'Verify CO₂ sensor readings and ventilation / CO₂-removal status per procedure.',
      'Re-check SpO₂ sensor placement.',
      'Ask the crew about headache, shortness of breath or difficulty concentrating.',
    ],
  },
  {
    id: 'skin',
    label: 'Skin & thermoregulation',
    short: 'Thermal',
    structures: ['skin', 'arm_nerve', 'hypothalamus'],
    anchor: [-0.33, 0.9, 0.06],
    cabinMetrics: ['temperature_c', 'relative_humidity_pct'],
    rules: [],
    cabinRules: ['cabin_heat_humidity'],
    about: 'Shared cabin temperature and humidity — the thermal load on the skin. The hypothalamus drives the body’s heat response; peripheral nerves sense it.',
    explain: {
      alert: 'Cabin temperature and humidity are both above baseline (confirmed). This is a shared environmental condition, not a measurement of the astronaut.',
      watch: 'Cabin temperature or humidity is above its threshold; the rule needs both to confirm.',
      normal: 'Cabin thermal conditions are within the expected range.',
      unavailable: 'No current cabin temperature or humidity reading.',
    },
    checks: [
      'Verify environmental readings and thermal-control status.',
      'Encourage hydration and check crew comfort.',
    ],
  },
  {
    id: 'ears',
    label: 'Hearing · cabin noise',
    short: 'Hearing',
    structures: ['ears', 'auditory_nerve'],
    anchor: [0.125, 1.63, 0.0],
    cabinMetrics: ['noise_dba'],
    rules: [],
    telemetryOnly: true,
    synthetic: true,
    about: 'Cabin noise level. No noise data was supplied, so this channel is a synthetic demo assumption.',
    explain: {
      watch: 'Synthetic cabin noise is above its demo threshold. No alert rule exists for noise.',
      normal: 'Synthetic cabin noise is within its demo range.',
      unavailable: 'No current noise reading.',
    },
    checks: ['Check hearing-protection use and noise sources (fans, pumps) per procedure.'],
  },
  {
    id: 'marrow',
    label: 'Bone marrow · radiation',
    short: 'Radiation',
    structures: ['marrow', 'spine_bones'],
    anchor: [0.11, 0.72, 0.09],
    rules: [],
    info: true,
    nasa: [{ title: 'Risk of Radiation-Induced Cancers', url: 'https://www.nasa.gov/reference/risk-of-radiation-induced-cancers/' }, { title: 'NASA RadLab (OSDR) radiation data', url: 'https://visualization.osdr.nasa.gov/radlab/gui/data-api/' }],
    about: 'Absorbed dose rate from the ISS RadLab DosTel1 extract. Blood-forming bone marrow is among the most radiation-sensitive tissues. Dose equivalent is not available and is not estimated.',
    explain: {
      info: 'Radiation is displayed as telemetry only. There is no alert rule, and absorbed dose is not converted to dose equivalent.',
      unavailable: 'No current radiation reading.',
    },
    checks: ['Track cumulative exposure with mission dosimetry procedures.'],
  },
];

export const ORGAN_BY_ID = Object.fromEntries(ORGANS.map((o) => [o.id, o]));

/** Which hotspot opens when a 3D structure is clicked. */
export const STRUCTURE_OWNER = {
  brain: 'brain', brainstem: 'brain', spinal_cord: 'brain', hypothalamus: 'skin',
  heart: 'heart', vagus: 'heart', aorta: 'vessels', arm_artery: 'vessels',
  lungs: 'lungs', trachea: 'lungs', phrenic: 'lungs', arm_nerve: 'skin',
  ears: 'ears', auditory_nerve: 'ears', marrow: 'marrow', spine_bones: 'marrow',
};

const RANK = { alert: 4, watch: 3, unavailable: 2, normal: 1, info: 0 };

/**
 * Evaluate a region for one astronaut on the current frame.
 * @returns {{status, metrics, alerts, missing}}
 */
export function organStatus(organ, astronaut, frame, { live = true } = {}) {
  const metrics = [];
  const missing = [];
  const cabin = frame?.cabin;

  for (const key of organ.metrics || []) {
    const c = astronaut?.comparisons?.[key];
    if (c && Number.isFinite(c.value)) metrics.push({ key, scope: 'astronaut', ...c });
    else missing.push(key);
  }
  for (const key of organ.cabinMetrics || []) {
    const c = cabin?.comparisons?.[key];
    if (c && Number.isFinite(c.value)) metrics.push({ key, scope: 'cabin', ...c });
    else missing.push(key);
  }

  const alerts = (frame?.active_alerts || []).filter((a) =>
    (organ.rules?.includes(a.rule) && a.target === astronaut?.id)
    || (organ.cabinRules?.includes(a.rule) && a.target === 'cabin'));

  let status;
  if (!live) status = 'unavailable';
  else if (organ.info) status = radiationValue(frame) === null ? 'unavailable' : 'info';
  else if (alerts.length) status = 'alert';
  else if (!metrics.length) status = 'unavailable';
  else if (metrics.some((m) => m.threshold_breached)) status = 'watch';
  else status = 'normal';

  return { status, metrics, alerts, missing };
}

export function radiationValue(frame) {
  const v = frame?.cabin?.radiation?.absorbed_dose_rate_ugy_h;
  return Number.isFinite(v) ? v : null;
}

export function worstStatus(statuses) {
  return statuses.reduce((worst, s) => (RANK[s] > RANK[worst] ? s : worst), 'info');
}

/**
 * Structures that should glow because their region is out of range: structure -> worst status.
 * Only alert and watch light up; normal/info/unavailable leave the anatomy in its base colours.
 */
export function criticalStructures(statuses) {
  const out = {};
  for (const organ of ORGANS) {
    const st = statuses?.[organ.id];
    if (st !== 'alert' && st !== 'watch') continue;
    for (const s of organ.structures) if (!out[s] || RANK[st] > RANK[out[s]]) out[s] = st;
  }
  return out;
}

/** Regions currently out of range for one astronaut, worst first. */
export function criticalRegions(statuses) {
  return ORGANS.filter((o) => statuses?.[o.id] === 'alert' || statuses?.[o.id] === 'watch')
    .sort((a, b) => RANK[statuses[b.id]] - RANK[statuses[a.id]]);
}

// Hotspot anchors for the real anatomy model, derived from web/models/structures.json
// (metres, feet at y = 0, facing +z, subject's left = +x). Points sit on the front of the structure
// (or the skin surface for limbs) so they are not hidden inside the body.
const ANCHOR_RULES = {
  brain: (s) => [s.brain.center[0], s.brain.center[1] + 0.015, s.brain.bbox_max[2]],
  heart: (s) => [s.heart.center[0] + 0.015, s.heart.center[1] - 0.01, s.heart.bbox_max[2] + 0.02],
  vessels: (s) => [s.arm_artery.bbox_max[0] - 0.05, (s.arm_artery.center[1] + s.arm_artery.bbox_min[1]) / 2 + 0.08, 0.05],
  lungs: (s) => [s.lungs.bbox_min[0] * 0.62, s.lungs.center[1] + 0.03, s.lungs.bbox_max[2]],
  skin: (s) => [s.skin.bbox_min[0] + 0.06, 0.98, 0.05],
  ears: (s) => [s.ears.bbox_max[0] + 0.035, s.ears.center[1], s.ears.center[2]],
  marrow: (s) => [-(s.marrow.bbox_max[0] * 0.6), s.marrow.center[1] - 0.05, s.marrow.bbox_max[2] + 0.02],
};

/** Map of organ id -> [x, y, z] from a structures.json list; falls back to the built-in anchors. */
export function anchorsFromStructures(list) {
  const byName = Object.fromEntries((list || []).map((s) => [s.name, s]));
  const out = {};
  for (const organ of ORGANS) {
    try {
      const p = ANCHOR_RULES[organ.id]?.(byName);
      out[organ.id] = p && p.every(Number.isFinite) ? p.map((v) => Math.round(v * 1000) / 1000) : organ.anchor;
    } catch { out[organ.id] = organ.anchor; }
  }
  return out;
}
