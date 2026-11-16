// Issues + response protocols. Pure module (tested in tests/web/issues.test.mjs).
//
// An "issue" is anything the crew should know about right now:
//   alert — a server alert is active (authoritative, deterministic rules)
//   watch — a reading is past its personal threshold without a confirmed alert, or a telemetry-only
//           signal (BP, SpO₂, noise) is out of range. Shown so nothing is hidden; never an alert.
// Each issue links to a protocol: why it matters, what you might notice, ordered steps with an owner,
// when to escalate, and when to re-check. `space` explains, in plain words, why it is different in spaceflight. Steps are non-diagnostic and defer to mission procedures.

const CREW = 'Crew member';
const CMO = 'Crew medical officer';
const ALL = 'Whole crew';

export const PROTOCOLS = {
  heart_rate_high: {
    title: 'Heart rate high for current activity',
    why: 'Heart rate is well above this person’s own expected value for what they are doing. Usual causes are recent exertion, stress, heat, dehydration, illness or a loose sensor; occasionally it needs medical attention.',
    space: 'In weightlessness body fluids shift toward the head and, over months, the heart and blood vessels adapt to doing less work. The same task can then push heart rate higher than it would on Earth. Daily exercise sessions are part of the schedule, so check the timeline first.',
    notice: ['Racing or pounding heartbeat', 'Shortness of breath', 'Dizziness', 'Chest discomfort'],
    steps: [
      [CREW, 'Stop strenuous work and sit or rest quietly for 5 minutes.'],
      [CREW, 'Reseat the heart-rate sensor and confirm good skin contact.'],
      [CREW, 'Note anything that explains it: recent exercise, caffeine, stress, poor sleep, feeling unwell.'],
      [CREW, 'Drink water unless fluid limits apply.'],
      [CMO, 'Re-check after rest. If it stays high, log it and review together.'],
    ],
    escalate: 'Chest pain, fainting, severe breathlessness or an irregular pulse: stop, alert the crew medical officer immediately and follow the emergency medical procedure.',
    recheck: '5 minutes after resting',
  },
  cognitive_stress: {
    title: 'Slower reactions and higher anxiety',
    why: 'Slower reaction time, more lapses and higher anxiety raise the chance of errors in safety-critical work. Common drivers are fatigue, short sleep, workload, stress or high cabin CO₂.',
    space: 'Isolation, confinement, shifted sleep schedules and the long communication delay add up over a deep-space mission, and no one on Earth can step in quickly. A small slowdown matters most during safety-critical work such as robotics, docking or spacewalk preparation.',
    notice: ['Trouble concentrating', 'Headache', 'Irritability', 'Unusual tiredness'],
    steps: [
      [CREW, 'Pause or hand off safety-critical tasks; use two-person verification for anything that must continue.'],
      [CREW, 'Take a short break away from the workstation; hydrate and eat if it has been a while.'],
      [CREW, 'Check the Cabin card: is CO₂ or temperature also elevated?'],
      [CREW, 'Repeat the reaction-time test after 15–20 minutes of rest.'],
      [CMO, 'Review last night’s sleep and today’s workload; rebalance the schedule if possible.'],
      [CMO, 'If it persists across check-ins, follow the behavioural-health procedure and arrange a private conversation (with ground when the link allows).'],
    ],
    escalate: 'Confusion, severe headache, or any thoughts of self-harm: alert the crew medical officer immediately.',
    recheck: 'Repeat the reaction test in 15–20 minutes',
  },
  co2_high: {
    title: 'Cabin CO₂ above baseline',
    why: 'Raised CO₂ affects everyone in the shared air and is associated with headache, fatigue and poorer concentration (NASA OCHMO technical brief TB-004).',
    space: 'Without gravity, exhaled air does not rise and drift away, so CO₂ can collect around a person’s face wherever airflow is weak, for example in a sleep station. Fans keep the air mixed, so a blocked vent can create a local pocket even when the cabin average looks normal.',
    notice: ['Headache', 'Fatigue', 'Shortness of breath', 'Difficulty concentrating'],
    steps: [
      [ALL, 'Open the Cabin map and find the module with the highest CO₂ reading.'],
      [CREW, 'Confirm with a second sensor or handheld meter to rule out a faulty sensor.'],
      [CREW, 'Check that ventilation fans and air inlets in that module are running and unobstructed.'],
      [CREW, 'Check CO₂-removal system status and alarms per procedure.'],
      [ALL, 'Reduce crowding and strenuous work in the affected module; move if anyone has symptoms.'],
      [CMO, 'Ask each crew member about headache or breathlessness; compare with their cognitive check-ins.'],
    ],
    escalate: 'Symptoms in more than one person, or CO₂ still rising after ventilation checks: follow the atmosphere contingency procedure and notify ground.',
    recheck: 'Every 5–10 minutes until back in range',
  },
  cabin_heat_humidity: {
    title: 'Cabin warm and humid',
    why: 'Heat and humidity together make it harder for the body to cool itself, add fatigue and can affect equipment.',
    space: 'Without gravity there is no natural convection: warm air and sweat stay on the skin unless fans move them away, so the body sheds heat less easily. The humidity system also recovers water from the air, so a fault can affect the water supply too.',
    notice: ['Sweating', 'Thirst', 'Fatigue', 'Headache'],
    steps: [
      [ALL, 'Open the Cabin map and find the warmest module (Systems is often first).'],
      [CREW, 'Check thermal-control setpoints and status per procedure.'],
      [CREW, 'Check the humidity-control / condensate system for faults.'],
      [ALL, 'Increase airflow where people are working; postpone exercise and heavy tasks.'],
      [ALL, 'Drink water regularly and watch each other for signs of heat strain.'],
    ],
    escalate: 'Dizziness, confusion or nausea: stop exertion, cool down and alert the crew medical officer.',
    recheck: 'Every 10 minutes',
  },
  blood_pressure: {
    title: 'Blood pressure outside personal range',
    why: 'A single reading outside this person’s range is often technique or activity related; a confirmed change is worth a medical review. There is no alert rule for blood pressure in this demo.',
    space: 'In weightlessness fluids shift toward the head and the body adapts by lowering its blood volume. Readings can differ from a person’s Earth values, and dizziness on standing is a known problem after returning to gravity.',
    notice: ['Headache', 'Dizziness on standing', 'Blurred vision'],
    steps: [
      [CREW, 'Sit quietly for 5 minutes, arm supported at heart level, correct cuff size.'],
      [CREW, 'Re-measure and log both readings.'],
      [CREW, 'Note recent exercise, fluid intake, medication timing and stress.'],
      [CMO, 'Review the logged readings and trend.'],
    ],
    escalate: 'Severe headache, chest pain, vision change or weakness: alert the crew medical officer immediately.',
    recheck: '5 minutes after resting',
  },
  spo2_low: {
    title: 'Blood oxygen below personal range',
    why: 'A low SpO₂ reading is often a cold finger or sensor movement, but a real drop matters. Telemetry only; there is no alert rule for it.',
    space: 'Life support controls the cabin’s oxygen and pressure. If more than one person shows a low reading at the same time, suspect the atmosphere, not the people.',
    notice: ['Breathlessness', 'Dizziness', 'Headache'],
    steps: [
      [CREW, 'Stay still, warm your hands and reseat the oximeter; re-measure.'],
      [CREW, 'Rest and breathe normally for 5 minutes, then re-measure.'],
      [ALL, 'Check cabin atmosphere status (O₂ is a fixed assumption in this demo; check CO₂ on the Cabin card).'],
      [CMO, 'Log both readings and review if still low.'],
    ],
    escalate: 'Breathlessness, blue lips or confusion: alert the crew medical officer immediately and follow the hypoxia procedure.',
    recheck: '5 minutes after resting',
  },
  noise_high: {
    title: 'Cabin noise above range (synthetic channel)',
    why: 'Sustained noise adds fatigue and can affect hearing. This channel is synthetic in the demo.',
    space: 'Fans and pumps run all day in a spacecraft and there is nowhere quiet to go. Long exposure is a known hearing risk for crews, which is why hearing protection is used in loud modules.',
    notice: ['Ringing ears', 'Difficulty hearing speech', 'Headache'],
    steps: [
      [ALL, 'Wear hearing protection in the loud module.'],
      [CREW, 'Find the source (fans, pumps) and check for faults or loose panels.'],
      [ALL, 'Limit time in the loud module and log exposure.'],
    ],
    escalate: 'Ringing ears or a change in hearing: tell the crew medical officer.',
    recheck: 'Every 30 minutes',
  },
};

/** Which protocols belong to each body region (for "Response steps" from the astronaut page). */
export const REGION_PROTOCOLS = {
  brain: ['cognitive_stress'], heart: ['heart_rate_high'], vessels: ['blood_pressure'],
  lungs: ['co2_high', 'spo2_low'], skin: ['cabin_heat_humidity'], ears: ['noise_high'],
};

const COGNITIVE = ['median_reaction_time_ms', 'lapses', 'state_anxiety_score'];
const ev = (key, c) => ({ key, value: c.value, expected: c.expected, threshold: c.threshold, breached: !!c.threshold_breached });

export function collectIssues(frame, { live = true } = {}) {
  if (!frame || !live) return [];
  const name = (id) => (id === 'cabin' ? 'Cabin' : frame.astronauts.find((a) => a.id === id)?.name || id);
  const out = [];
  const add = (level, protocol, target, evidence, since = null) => {
    if (!PROTOCOLS[protocol]) return;
    out.push({ id: `${protocol}:${target}`, level, protocol, target, who: name(target), since, evidence, title: PROTOCOLS[protocol].title });
  };
  for (const a of frame.active_alerts || []) {
    add('alert', a.rule, a.target, Object.entries(a.signals || {}).map(([k, s]) => ev(k, s)), a.opened_at);
  }
  const has = (protocol, target) => out.some((i) => i.id === `${protocol}:${target}`);
  for (const a of frame.astronauts || []) {
    const c = a.comparisons || {};
    if (c.heart_rate_bpm?.threshold_breached && !has('heart_rate_high', a.id)) add('watch', 'heart_rate_high', a.id, [ev('heart_rate_bpm', c.heart_rate_bpm)]);
    const cog = COGNITIVE.filter((k) => c[k]?.threshold_breached);
    if (cog.length && !has('cognitive_stress', a.id)) add('watch', 'cognitive_stress', a.id, cog.map((k) => ev(k, c[k])));
    const bp = ['systolic_mmhg', 'diastolic_mmhg'].filter((k) => c[k]);
    if (bp.some((k) => c[k].threshold_breached)) add('watch', 'blood_pressure', a.id, bp.map((k) => ev(k, c[k])));
    if (c.spo2_pct?.threshold_breached) add('watch', 'spo2_low', a.id, [ev('spo2_pct', c.spo2_pct)]);
  }
  const cab = frame.cabin?.comparisons || {};
  if (cab.co2_ppm?.threshold_breached && !has('co2_high', 'cabin')) add('watch', 'co2_high', 'cabin', [ev('co2_ppm', cab.co2_ppm)]);
  const heat = ['temperature_c', 'relative_humidity_pct'].filter((k) => cab[k]);
  if (heat.some((k) => cab[k].threshold_breached) && !has('cabin_heat_humidity', 'cabin')) add('watch', 'cabin_heat_humidity', 'cabin', heat.map((k) => ev(k, cab[k])));
  if (cab.noise_dba?.threshold_breached) add('watch', 'noise_high', 'cabin', [ev('noise_dba', cab.noise_dba)]);
  return out.sort((x, y) => (x.level === 'alert' ? 0 : 1) - (y.level === 'alert' ? 0 : 1));
}

/** Issues relevant to one region of one astronaut (cabin-wide issues count for every astronaut). */
export function issuesForRegion(issues, regionId, astronautId) {
  const protocols = REGION_PROTOCOLS[regionId] || [];
  return issues.filter((i) => protocols.includes(i.protocol) && (i.target === astronautId || i.target === 'cabin'));
}
