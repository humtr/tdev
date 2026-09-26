"""Bounded local snapshot reduction. No MCP, storage, effects or server imports."""
from collections import OrderedDict


class Frontier:
    """Counters start AFTER the first snapshot of each process generation.

    Retained baseline witnesses are useful context, not evidence that the caller was
    executing while this observer ran. Missing events are never reconstructed.
    """
    def __init__(self):
        self.instance = None
        self.changes = self.invalid = self.unavailable = 0
        self.last_sample = None
        self.runs = OrderedDict()
        self.baseline = self.last = None
        self.parsed = self.finished = self.witnesses = self.gaps = self.regressions = 0
        self.run_evictions = 0

    def _witness(self, event, baseline):
        run = event.get('runTag')
        cell = event.get('cellTag')
        if (not isinstance(run, str) or len(run) != 24 or
                not isinstance(cell, str) or len(cell) != 24 or
                any(c not in '0123456789abcdef' for c in run + cell) or
                event.get('phase') not in ('cell_enter', 'tool_return', 'cell_exit') or
                type(event.get('sequence')) is not int or event['sequence'] < 1 or
                type(event.get('timeNs')) is not int):
            self.invalid += 1
            return
        row = {k: event[k] for k in ('runTag', 'cellTag', 'phase', 'sequence', 'eventId', 'timeNs')}
        row['retainedAtBaseline'] = baseline
        for key in ('callOrdinal', 'afterRequest'):
            if type(event.get(key)) is int and event[key] > 0:
                row[key] = event[key]
        self.runs[run] = row
        self.runs.move_to_end(run)
        if len(self.runs) > 32:
            self.runs.popitem(last=False)
            self.run_evictions += 1

    def feed(self, sample):
        snapshot = sample.get('snapshot')
        available = isinstance(snapshot, dict)
        if not available:
            self.unavailable += 1
        elif (not isinstance(snapshot.get('instance'), str) or
              not isinstance(snapshot.get('recent'), list)):
            self.invalid += 1
            available = False
        else:
            instance = snapshot['instance']
            events = {}
            for event in snapshot['recent']:
                if (not isinstance(event, dict) or event.get('instance') != instance or
                        type(event.get('eventId')) is not int or event['eventId'] < 1):
                    self.invalid += 1
                    continue
                events[event['eventId']] = event
            first = instance != self.instance
            if first:
                self.changes += self.instance is not None
                self.instance = instance
                self.runs.clear()
                self.parsed = self.finished = self.witnesses = self.gaps = self.regressions = 0
                self.run_evictions = 0
                self.baseline = self.last = max(events, default=0)
            if events and max(events) < self.last:
                self.regressions += 1
            for ident, event in sorted(events.items()):
                if not first and ident <= self.last:
                    continue
                if not first:
                    self.gaps += max(0, ident - self.last - 1)
                    self.last = ident
                    # Detached host_witness request=0 is not an HTTP request.
                    if type(event.get('request')) is int and event['request'] > 0:
                        self.parsed += event.get('event') == 'rpc_parsed'
                        self.finished += event.get('event') == 'http_finished'
                    self.witnesses += event.get('event') == 'host_witness'
                if event.get('event') == 'host_witness':
                    self._witness(event, first)
            self.last_sample = sample.get('observerTimeNs')
        return dict(schema=1, available=available, lastSnapshotNs=self.last_sample,
                    instance=self.instance, generationChanges=self.changes,
                    baselineEventId=self.baseline, lastEventId=self.last,
                    parsedRequestsSinceBaseline=self.parsed, httpFinishedSinceBaseline=self.finished,
                    witnessesSinceBaseline=self.witnesses, missingEvents=self.gaps,
                    regressions=self.regressions, invalidRecords=self.invalid,
                    unavailableSamples=self.unavailable, runEvictions=self.run_evictions,
                    runs=[dict(row) for row in self.runs.values()],
                    meaning='Observed server events; not host attempt counts, scheduling or UI proof')
