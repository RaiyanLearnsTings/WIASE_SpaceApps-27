// Daily questionnaire (original demo items, 24-hour lookback, 1–5, higher = more concern).
// Not the validated STAI-S/PSS instruments. Every item can be skipped; skipped stays null.
import { openDialog, toast } from '../panels/dialog.mjs';

const ITEMS = [
  ['fatigue', 'How fatigued have you felt today?', 'Not at all', 'Extremely'],
  ['sleep_quality', 'How poor was your most recent sleep?', 'Not poor at all', 'Extremely poor'],
  ['stress', 'How stressed have you felt today?', 'Not at all', 'Extremely'],
  ['focus', 'How difficult has it been to concentrate today?', 'Not at all', 'Extremely'],
  ['mood', 'How low or irritable have you felt today?', 'Not at all', 'Extremely'],
  ['discomfort', 'How much physical discomfort have you experienced today?', 'None', 'Extreme'],
];
const SYMPTOMS = [['headache', 'Headache'], ['dizziness', 'Dizziness'], ['nausea', 'Nausea'],
  ['shortness_of_breath', 'Shortness of breath'], ['other', 'Other'], ['none', 'None'], ['prefer_not_to_say', 'Prefer not to say']];

export function openSurvey(ctx) {
  const { store, feed, api } = ctx;
  const astronautId = store.get().astronaut;
  const name = feed.state.frame?.astronauts.find((a) => a.id === astronautId)?.name || astronautId;
  const form = document.createElement('form');
  form.className = 'survey';
  form.innerHTML = `
    <p>For <strong>${name}</strong> · past 24 hours · 1 = not at all, 5 = extremely. Skip anything you prefer not to answer.</p>
    ${ITEMS.map(([key, prompt, lo, hi]) => `
      <fieldset class="likert"><legend>${prompt}</legend>
        <div class="likert__scale"><span class="muted small">${lo}</span>
          ${[1, 2, 3, 4, 5].map((v) => `<label><input type="radio" name="${key}" value="${v}"><span>${v}</span></label>`).join('')}
          <span class="muted small">${hi}</span>
          <label class="likert__skip"><input type="radio" name="${key}" value="" checked><span>Skip</span></label></div>
      </fieldset>`).join('')}
    <div class="row">
      <label class="field">Sleep last night (hours, optional)<input type="number" name="sleep_hours" min="0" max="24" step="0.25"></label>
    </div>
    <fieldset class="symptoms"><legend>Any symptoms? (optional)</legend>
      ${SYMPTOMS.map(([k, l]) => `<label class="check"><input type="checkbox" name="symptoms" value="${k}"> ${l}</label>`).join('')}
    </fieldset>
    <label class="field">Notes (optional, stays on this server)<textarea name="note" rows="2" maxlength="1000"></textarea></label>
    <p class="footnote">Original demo items, not a validated clinical instrument. Urgent symptoms should go through mission medical procedures, not this form.</p>
    <div class="row"><button type="submit" class="btn btn--primary">Save check-in</button><span class="warn" id="survey-error"></span></div>`;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = new FormData(form);
    const responses = Object.fromEntries(ITEMS.map(([k]) => [k, data.get(k) ? Number(data.get(k)) : null]));
    const hours = data.get('sleep_hours');
    try {
      await api.saveSurvey({
        astronaut_id: astronautId, responses,
        sleep_hours: hours === '' ? null : Number(hours),
        symptoms: data.getAll('symptoms'),
        note: data.get('note') || null,
        simulated_at: feed.state.frame?.clock.simulated_at,
      });
      await ctx.refreshCheckins(astronautId);
      toast(`Check-in saved for ${name}.`);
      dlg.close();
    } catch (err) {
      form.querySelector('#survey-error').textContent = err.message;
    }
  });
  const dlg = openDialog({ kicker: 'Human check-in · wall clock', title: 'Daily check-in', body: form, wide: true });
}
