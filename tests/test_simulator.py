"""Simulator + server regression tests; run from repo root: python3 -m unittest discover -s tests -v"""
import json
import tempfile
import sys
import unittest
from pathlib import Path
from urllib.request import urlopen, Request
from threading import Thread

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'server'))
from simulator import Simulation, load_calibration
from calibrate import build
from server import LiveFeed, Server
from checkins import CheckinStore

class SimulatorTests(unittest.TestCase):
    def setUp(self):
        self.sim = Simulation(load_calibration())

    def test_calibration_matches_workbook(self):
        self.assertEqual(build(ROOT / 'data/Astronaut_Health_Data.xlsx'), load_calibration())

    def test_contract_and_reset(self):
        f = self.sim.snapshot(1)
        self.assertEqual([a['id'] for a in f['astronauts']], ['astro-1','astro-2','astro-3'])
        self.assertEqual(f['cabin']['id'], 'cabin')
        self.assertTrue(f['synthetic'])
        self.assertIsNone(f['cabin']['radiation']['dose_equivalent_rate_usv_h'])
        self.sim.set_speed(60)
        self.sim.advance(60)
        self.assertEqual(self.sim.snapshot(2)['clock']['elapsed_seconds'],60)
        self.sim.reset()
        self.assertNotEqual(self.sim.run_id, f['run_id'])
        self.assertEqual(self.sim.speed,60)
        self.assertEqual(self.sim.elapsed,0)

    def test_all_scenarios_open_and_clear(self):
        cases = [('high_resting_hr','astro-2','heart_rate_high'),('cognitive_stress','astro-1','cognitive_stress'),('co2_buildup','cabin','co2_high'),('warm_humid_cabin','cabin','cabin_heat_humidity')]
        for scenario,target,rule in cases:
            with self.subTest(scenario=scenario):
                self.sim.reset()
                self.sim.trigger(scenario,target,900)
                self.sim.advance(120)
                self.assertIn((target,rule), self.sim.monitor.active)
                self.sim.clear(scenario,target)
                self.sim.advance(120)
                self.assertNotIn((target,rule), self.sim.monitor.active)
                self.assertTrue(any(e['type']=='cleared' and e['rule']==rule for e in self.sim.monitor.events))

    def test_invalid_controls(self):
        for args in [('bogus','cabin',900),('high_resting_hr','cabin',900),('co2_buildup','cabin',1)]:
            with self.assertRaises(ValueError): self.sim.trigger(*args)
        with self.assertRaises(ValueError): self.sim.set_speed(2)

    def test_http_state_stream_and_control(self):
        feed=LiveFeed(self.sim)
        tmp=tempfile.TemporaryDirectory(); self.addCleanup(tmp.cleanup)
        server=Server(('127.0.0.1',0),feed,[],CheckinStore(Path(tmp.name)/'c.json'))
        thread=Thread(target=server.serve_forever,daemon=True)
        feed.thread.start(); thread.start()
        base=f'http://127.0.0.1:{server.server_port}'
        try:
            with urlopen(base+'/api/state',timeout=3) as r: state=json.load(r)
            self.assertEqual(len(state['astronauts']),3)
            with urlopen(base+'/api/stream',timeout=3) as r:
                self.assertTrue(r.readline().startswith(b'id:'))
                line = r.readline()
                self.assertTrue(line.startswith(b'data: '))
                self.assertEqual(json.loads(line[6:])['feed_id'], state['feed_id'])
            req=Request(base+'/api/speed',data=b'{"speed":60}',headers={'Content-Type':'application/json'})
            with urlopen(req,timeout=3) as r: self.assertEqual(json.load(r)['clock']['speed'],60)
            with urlopen(base+'/',timeout=3) as r: self.assertIn(b'WIASE', r.read())
            with self.assertRaises(Exception): urlopen(base+'/../server/server.py',timeout=3)
            body=json.dumps({'astronaut_id':'astro-2','responses':{'fatigue':4,'stress':2,'focus':3,'mood':1}}).encode()
            req=Request(base+'/api/checkins/survey',data=body,headers={'Content-Type':'application/json'})
            with urlopen(req,timeout=3) as r: self.assertEqual(r.status,201)
            with urlopen(base+'/api/checkins?astronaut=astro-2',timeout=3) as r:
                self.assertEqual(len(json.load(r)['survey']['entries']),1)
        finally:
            server.shutdown(); feed.close(); server.server_close(); thread.join(timeout=2)


class MergedTelemetryTests(unittest.TestCase):
    def setUp(self):
        self.sim = Simulation(load_calibration())

    def test_names_blood_pressure_and_noise(self):
        f = self.sim.snapshot(1)
        self.assertEqual([a['name'] for a in f['astronauts']], ['Astronaut 001','Astronaut 002','Astronaut 003'])
        for a in f['astronauts']:
            bp = a['blood_pressure']
            self.assertGreater(bp['systolic_mmhg'], bp['diastolic_mmhg'])
            self.assertIn('systolic_mmhg', a['comparisons'])
        self.assertIn('noise_dba', f['cabin'])
        self.assertIn('noise_dba', f['cabin']['synthetic_fields'])

    def test_bp_and_noise_never_alert(self):
        self.sim.trigger('warm_humid_cabin', 'cabin', 900)
        self.sim.trigger('high_resting_hr', 'astro-1', 900)
        self.sim.advance(300)
        rules = {rule for _, rule in self.sim.monitor.active}
        self.assertEqual(rules, {'cabin_heat_humidity', 'heart_rate_high'})

    def test_provenance_labels(self):
        p = self.sim.baselines()['provenance']
        self.assertEqual(p['noise_dba']['source'], 'synthetic')
        self.assertEqual(p['blood_pressure']['sheets'], ['PPG activities'])
        self.assertEqual(p['sensors']['source'], 'synthetic')

    def test_zone_sensors_are_additive_and_localize_scenarios(self):
        cabin = self.sim.snapshot(1)['cabin']
        for key in ('co2_ppm', 'temperature_c', 'relative_humidity_pct', 'noise_dba', 'comparisons'):
            self.assertIn(key, cabin)
        self.assertIn('sensors', cabin['synthetic_fields'])
        sensors = cabin['sensors']
        self.assertEqual(len({s['id'] for s in sensors}), 8)
        for s in sensors:
            self.assertTrue(0 <= s['x'] <= 1 and 0 <= s['y'] <= 1)
            self.assertIn(s['zone'], {'rest', 'work', 'systems', 'lab'})
            self.assertEqual(s['status'], 'normal')
        self.sim.trigger('co2_buildup', 'cabin', 900)
        self.sim.advance(300)
        co2 = {s['id']: s for s in self.sim.snapshot(2)['cabin']['sensors'] if s['metric'] == 'co2_ppm'}
        self.assertEqual(max(co2, key=lambda k: co2[k]['delta']), 'work-co2')
        self.assertEqual(co2['work-co2']['status'], 'watch')
        self.assertIn(('cabin', 'co2_high'), self.sim.monitor.active)


    def test_cumulative_absorbed_dose_integrates_radlab_rate(self):
        r0 = self.sim.snapshot(1)['cabin']['radiation']
        self.assertEqual(r0['cumulative_absorbed_dose_ugy'], 0)
        self.sim.advance(3600)
        r1 = self.sim.snapshot(2)['cabin']['radiation']
        self.assertGreater(r1['cumulative_absorbed_dose_ugy'], 0)
        self.assertIsNone(r1['dose_equivalent_rate_usv_h'])
        # one hour at a few µGy/h -> a few µGy; sanity bound against the instantaneous rates
        self.assertLess(r1['cumulative_absorbed_dose_ugy'], 3 * max(r0['absorbed_dose_rate_ugy_h'], r1['absorbed_dose_rate_ugy_h']))


class EvaluationTests(unittest.TestCase):
    def test_no_false_alerts_and_full_size_scenarios_detected(self):
        sys.path.insert(0, str(ROOT / 'tools'))
        from evaluate import false_alerts, detection
        self.assertEqual(false_alerts(7, 0.25), [])
        trials = detection(7, 4)
        self.assertTrue(all(t['detected'] for t in trials), trials)
        self.assertTrue(all(t['time_to_alert_s'] <= 60 for t in trials))


class CheckinTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.path = Path(self.tmp.name) / 'checkins.json'
        self.store = CheckinStore(self.path)

    def tearDown(self):
        self.tmp.cleanup()

    def reaction(self, rts, extra=()):
        trials = [{'delay_ms': 2500, 'rt_ms': rt, 'outcome': 'valid'} for rt in rts] + list(extra)
        return self.store.add_reaction({'astronaut_id': 'astro-1', 'trials': trials, 'duration_ms': 60000})

    def test_reaction_scoring(self):
        s = self.reaction([250, 300, 520, 280, 310], [{'delay_ms': 3000, 'rt_ms': None, 'outcome': 'timeout'},
                                                      {'delay_ms': 2100, 'rt_ms': None, 'outcome': 'false_start'}])
        self.assertEqual((s['valid_trials'], s['lapses'], s['timeouts'], s['false_starts']), (5, 1, 1, 1))
        self.assertEqual(s['median_reaction_time_ms'], 300)
        self.assertTrue(s['sufficient'])
        self.assertFalse(self.reaction([250, 260])['sufficient'])

    def test_reaction_baseline_needs_five_sufficient_sessions(self):
        for _ in range(4): self.reaction([300] * 6)
        self.assertEqual(self.store.summary('astro-1')['reaction']['baseline']['status'], 'building')
        self.reaction([300] * 6)
        b = self.store.summary('astro-1')['reaction']['baseline']
        self.assertEqual((b['status'], b['median_reaction_time_ms']), ('ready', 300))

    def test_mixed_games_scoring_and_protocol_baseline(self):
        mixed = [{'task': 'gonogo', 'delay_ms': 2000, 'rt_ms': None, 'outcome': 'commission'},
                 {'task': 'gonogo', 'delay_ms': 2000, 'rt_ms': None, 'outcome': 'correct_withhold'},
                 {'task': 'choice', 'delay_ms': 2000, 'rt_ms': 610, 'outcome': 'valid'},
                 {'task': 'choice', 'delay_ms': 2000, 'rt_ms': None, 'outcome': 'wrong_response'}]
        s = self.reaction([300, 320, 310, 290], mixed)
        self.assertEqual((s['errors'], s['commissions'], s['wrong_responses'], s['correct_withholds']), (2, 1, 1, 1))
        self.assertEqual(s['lapses'], 0)  # the slow choice response is not a lapse
        self.assertEqual(s['by_task']['choice'], {'valid_trials': 1, 'median_reaction_time_ms': 610})
        self.assertEqual(s['protocol_version'], 'reaction-mix-1')
        with self.assertRaises(ValueError):
            self.reaction([300], [{'task': 'memory', 'delay_ms': 1, 'rt_ms': 300, 'outcome': 'valid'}])
        # sessions from the old single-game protocol stay on record but never join the baseline
        for _ in range(5):
            self.reaction([300] * 6)
            self.store.data['reaction_sessions'][-1]['protocol_version'] = 'pvt-lite-1'
        self.assertEqual(self.store.summary('astro-1')['reaction']['baseline']['sessions'], 1)

    def test_invalid_payloads(self):
        bad = [{'astronaut_id': 'astro-9', 'trials': [{'delay_ms': 1, 'rt_ms': 300, 'outcome': 'valid'}]},
               {'astronaut_id': 'astro-1', 'trials': []},
               {'astronaut_id': 'astro-1', 'trials': [{'delay_ms': 1, 'rt_ms': None, 'outcome': 'valid'}]}]
        for body in bad:
            with self.assertRaises(ValueError): self.store.add_reaction(body)
        with self.assertRaises(ValueError):
            self.store.add_survey({'astronaut_id': 'astro-1', 'responses': {'fatigue': 6}})
        with self.assertRaises(ValueError):
            self.store.add_survey({'astronaut_id': 'astro-1', 'responses': {'happiness': 3}})

    def test_survey_nulls_amendment_and_persistence(self):
        e = self.store.add_survey({'astronaut_id': 'astro-2', 'responses': {'fatigue': 3, 'stress': 2}})
        self.assertIsNone(e['mean_score'])          # fewer than 4 answers
        self.assertIsNone(e['responses']['mood'])   # skipped stays null, never 0
        e2 = self.store.add_survey({'astronaut_id': 'astro-2',
                                    'responses': {'fatigue': 4, 'stress': 2, 'focus': 2, 'mood': 4}})
        self.assertEqual(e2['mean_score'], 3)
        self.assertEqual(len(e2['amendments']), 1)
        reloaded = CheckinStore(self.path)
        self.assertEqual(len(reloaded.summary('astro-2')['survey']['entries']), 1)


if __name__=='__main__': unittest.main()
