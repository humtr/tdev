import json
import unittest

from tdev.observer_frontier import Frontier


def event(ident, kind='rpc_parsed', instance='a'*16, **extra):
    return dict(instance=instance, eventId=ident, event=kind, request=ident,
                timeNs=ident*1000, **extra)


def mark(ident, run='b'*24, phase='cell_enter'):
    row = event(ident, 'host_witness', runTag=run, cellTag='c'*24, sequence=ident, phase=phase)
    row['request'] = 0
    return row


def sample(*events, instance='a'*16):
    return dict(observerTimeNs=100000, snapshot=dict(instance=instance, recent=list(events)))


class FrontierTest(unittest.TestCase):
    def test_baseline_is_historical_and_overlapping_snapshots_do_not_count_twice(self):
        f = Frontier()
        first = f.feed(sample(event(20), mark(21)))
        self.assertEqual(0, first['parsedRequestsSinceBaseline'])
        self.assertTrue(first['runs'][0]['retainedAtBaseline'])
        later = sample(mark(21), event(22), event(23, 'http_finished'), mark(24, phase='cell_exit'))
        second = f.feed(later)
        self.assertEqual((1, 1, 1, 0), tuple(second[k] for k in
            ('parsedRequestsSinceBaseline','httpFinishedSinceBaseline','witnessesSinceBaseline','missingEvents')))
        self.assertFalse(second['runs'][0]['retainedAtBaseline'])
        self.assertEqual(second, f.feed(later))
        self.assertEqual(21, first['runs'][0]['eventId'])  # No mutable previous sample.

    def test_gaps_internal_gaps_and_regression_are_not_hidden(self):
        f = Frontier(); f.feed(sample(event(10)))
        row = f.feed(sample(event(14), event(16)))
        self.assertEqual(4, row['missingEvents'])
        old = f.feed(sample(event(9)))
        self.assertEqual((16, 2, 1), (old['lastEventId'],old['parsedRequestsSinceBaseline'],old['regressions']))

    def test_unavailable_retains_frontier_and_restart_resets_baseline(self):
        f = Frontier(); f.feed(sample(mark(10)))
        absent = f.feed({'observerTimeNs':200000, 'unavailable':'timeout'})
        self.assertFalse(absent['available']); self.assertEqual(10, absent['lastEventId'])
        self.assertEqual(100000, absent['lastSnapshotNs'])
        changed = f.feed(sample(event(1,instance='d'*16),instance='d'*16))
        self.assertEqual((1,1,0,[]), (changed['generationChanges'],changed['baselineEventId'],
                                    changed['parsedRequestsSinceBaseline'],changed['runs']))

    def test_bounded_run_frontiers_whitelist_fields_and_keep_raw_snapshot_unmodified(self):
        f = Frontier(); f.feed(sample())
        rows = [mark(i,run=f'{i:024x}') for i in range(1,40)]
        rows[-1]['prompt'] = 'secret'; rows[-1]['command'] = 'private command'
        original = sample(*rows)
        state = f.feed(original)
        self.assertEqual((32,7,39), (len(state['runs']),state['runEvictions'],state['witnessesSinceBaseline']))
        self.assertNotIn('secret', json.dumps(state))
        self.assertEqual('secret', original['snapshot']['recent'][-1]['prompt'])

    def test_malformed_records_do_not_discard_other_evidence(self):
        f = Frontier(); f.feed(sample())
        bad = mark(3); bad['runTag'] = 'raw text'
        row = f.feed(sample(None, {'eventId':'bad'}, event(2), bad))
        self.assertEqual(3, row['invalidRecords'])
        self.assertEqual(1, row['parsedRequestsSinceBaseline'])
        self.assertFalse(f.feed({'snapshot':{'recent':None}})['available'])
