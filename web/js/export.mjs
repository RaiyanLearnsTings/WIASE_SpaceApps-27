// Session export: everything shown in the demo, with provenance, as one JSON download.
export async function exportSession(ctx) {
  const { feed, store, api, baselines } = ctx;
  const s = store.get();
  let checkins = null;
  try { checkins = await api.allCheckins(); } catch { /* server offline: export without */ }
  const data = {
    app: 'WIASE crew health console',
    exported_at_utc: new Date().toISOString(),
    disclaimer: 'Synthetic demonstration data. Not a medical device; no diagnosis or clinical validation.',
    settings: { mode: s.mode, one_way_delay_min: s.mode === 'deep' ? s.delayMin : 0 },
    provenance: baselines?.provenance ?? null,
    run_id: feed.state.runId,
    current_frame: feed.state.frame,
    history: feed.state.history,
    alert_events: feed.state.events,
    acknowledgements: s.acks,
    ground_packets: s.packets,
    tasks_marked_done: s.tasksDone,
    human_checkins: checkins,
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), { href: url, download: `wiase-session-${data.exported_at_utc.slice(0, 19).replace(/:/g, '')}.json` });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
