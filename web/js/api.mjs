// Thin JSON helpers for the local WIASE server.

async function request(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: options.body ? { 'Content-Type': 'application/json' } : undefined,
  });
  let data = null;
  try { data = await response.json(); } catch { /* empty body */ }
  if (!response.ok) throw new Error(data?.error || `Request failed (${response.status})`);
  return data;
}

export const api = {
  baselines: () => request('/api/baselines'),
  scenarios: () => request('/api/scenarios'),
  speed: (speed) => request('/api/speed', { method: 'POST', body: JSON.stringify({ speed }) }),
  reset: () => request('/api/reset', { method: 'POST', body: '{}' }),
  trigger: (id, target, duration_seconds) => request('/api/scenarios/trigger', {
    method: 'POST', body: JSON.stringify(target ? { id, target, duration_seconds } : { id, duration_seconds }),
  }),
  clear: (id, target) => request('/api/scenarios/clear', {
    method: 'POST', body: JSON.stringify(id ? (target ? { id, target } : { id }) : {}),
  }),
  checkins: (astronaut) => request(`/api/checkins?astronaut=${encodeURIComponent(astronaut)}`),
  allCheckins: () => request('/api/checkins'),
  saveReaction: (body) => request('/api/checkins/reaction', { method: 'POST', body: JSON.stringify(body) }),
  saveSurvey: (body) => request('/api/checkins/survey', { method: 'POST', body: JSON.stringify(body) }),
};
