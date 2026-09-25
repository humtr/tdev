"""Optional watch/capture and principal-scoped incident delivery.

No database, operational retry, cancellation, provider or code mutation is owned here.
Request hooks only update bounded memory. Persistence and expiry have independent workers.
"""
import copy
import json
from pathlib import Path
import queue
import secrets
import threading
import time

from .common import Fault, atomic_write, canonical, private_file, require
from .diagnostics import Recorder, RuntimeDiagnostics, SEGMENT_BYTES


def elapsed():
    # Suspend counts toward lease expiry on Linux/Android.
    if hasattr(time, 'CLOCK_BOOTTIME'):
        return time.clock_gettime(time.CLOCK_BOOTTIME)
    return time.monotonic()


class PolicyRecorder(Recorder):
    def __init__(self, policy, **kwargs):
        self.policy = policy
        super().__init__(**kwargs)

    def bind(self, request, principal):
        self.policy.bind(request, principal)

    def emit(self, request, event, **fields):
        capture = self.policy.observe(request, event, fields)
        if capture or (self.policy.mode == 'watch' and event in ('rpc_parsed', 'dispatch_started', 'dispatch_failed',
                                 'dispatch_finished', 'response_failed', 'http_finished')):
            # Watch retains a memory ring but performs no event-log writes.
            super().emit(request, event, **fields, _persist=capture)

    def payload_tag(self, data):
        return super().payload_tag(data) if self.policy.mode == 'trace' else None

    def tool_result(self, request, value):
        if value.get('error', {}).get('effect') == 'unknown':
            self.policy.trigger_request(request, 'uncertain_effect')

    def offers(self, principal):
        return self.policy.offers(principal)

    def mode(self):
        return self.policy.mode


class DiagnosticsPolicy:
    LIMIT = 32
    OFFER_INTERVAL = 15
    PUBLIC = ('id', 'reason', 'createdAt', 'capture', 'delivery', 'offers',
              'lastOfferedAt', 'acknowledgedAt')

    def __init__(self, directory, source, options=None, clock=elapsed):
        options = options or {}
        self.directory = Path(directory)
        self.clock = clock
        self.trace_seconds = options.get('traceSeconds', 120)
        self.slow_seconds = options.get('slowSeconds', 30)
        self.cooldown = options.get('cooldownSeconds', 300)
        self._lock = threading.RLock()
        self._stop = threading.Event()
        self._base_mode = options.get('mode', 'watch')
        self._mode, self._deadline, self._expires_at = self._base_mode, 0, None
        self._incident = []
        self._requests = {}
        self._silence_until = 0
        self._revision = self._saved_revision = 0
        self._storage_errors = self._evicted = 0
        self._save_queue = queue.Queue(maxsize=1)
        self.runtime = RuntimeDiagnostics(directory, source,
                         recorder_factory=lambda **kw: PolicyRecorder(self, **kw))
        self.recorder = self.runtime.recorder
        self._storage_disabled = self.recorder.runtime_identity.get('persistence') != 'enabled'
        if self._storage_disabled:
            self._storage_errors += 1
        self._load()
        self.runtime.control_handler = self.local
        self._writer = threading.Thread(target=self._save, daemon=True)
        self._monitor = threading.Thread(target=self._watch, daemon=True)
        self._writer.start()
        self._monitor.start()

    @property
    def mode(self):
        with self._lock:
            self._expire()
            return self._mode

    def _touch(self):
        self._revision += 1

    def _evidence(self):
        return self.recorder.snapshot()['recent'][-16:]

    def _expire(self, stopped=False):
        if self._mode == 'trace' and (stopped or self.clock() >= self._deadline):
            self._mode, self._expires_at = self._base_mode, None
            evidence = self._evidence()
            for row in self._incident:
                if row['capture'] == 'active':
                    row['capture'] = 'stopped' if stopped else 'expired'
                    row['evidence'] = row.get('evidence', [])[:16] + evidence
            self._touch()

    def _load(self):
        filename = self.directory / 'incidents.json'
        if self._storage_disabled or not filename.exists():
            return
        try:
            require(filename.lstat().st_size <= SEGMENT_BYTES, 'DIAGNOSTIC_STATE')
            state = json.loads(private_file(filename))
            require(state['schema'] == 1 and state['keyId'] == self.recorder.key_id,
                    'DIAGNOSTIC_STATE')
            rows = state['incidents']
            require(isinstance(rows, list) and len(rows) <= self.LIMIT, 'DIAGNOSTIC_STATE')
            from jsonschema import Draft202012Validator
            schema = json.loads((Path(__file__).resolve().parents[2] / 'contracts/tools.schema.json').read_bytes())
            validator = Draft202012Validator(schema['$defs']['DiagnosticIncident'])
            for row in rows:
                require(validator.is_valid({k: row[k] for k in self.PUBLIC}), 'DIAGNOSTIC_STATE')
                require(isinstance(row['owner'], str) and len(row['owner']) == 24,
                        'DIAGNOSTIC_STATE')
                require(isinstance(row.get('evidence', []), list) and len(row.get('evidence', [])) <= 32,
                        'DIAGNOSTIC_STATE')
                if row['capture'] == 'active':
                    row['capture'] = 'interrupted'
            self._incident = rows
            self._evicted = int(state.get('evicted', 0))
            self._touch()  # Persist restart terminalization without resuming a lease.
        except Exception:
            # Preserve corrupt/incompatible bytes, and never overwrite them silently.
            self._storage_errors += 1
            self._storage_disabled = True

    def bind(self, request, principal):
        with self._lock:
            if self.mode == 'off':
                return
            if len(self._requests) >= 256:
                self._requests.pop(next(iter(self._requests)))
            self._requests[request] = {'owner': self.recorder.tag(principal), 'started': None,
                                       'reported': False}

    def observe(self, request, event, fields):
        with self._lock:
            self._expire()
            row = self._requests.get(request)
            if row:
                if event == 'dispatch_started':
                    row['started'] = self.clock()
                if event in ('dispatch_finished', 'dispatch_failed'):
                    row['started'] = None
                if event in ('dispatch_failed', 'response_failed'):
                    self._trigger(row['owner'], event)
                if event == 'http_finished':
                    self._requests.pop(request, None)
            return self._mode == 'trace'

    def trigger_request(self, request, reason):
        with self._lock:
            row = self._requests.get(request)
            if row:
                self._trigger(row['owner'], reason)

    def _trigger(self, owner, reason, seconds=None, replay=None):
        self._expire()
        seconds = self.trace_seconds if seconds is None else seconds
        if replay is not None:
            found = next((r for r in self._incident if r['owner'] == owner and r.get('replay') == replay), None)
            if found:
                require(found['seconds'] == seconds, 'REQUEST_CONFLICT')
                return
        else:
            if self._mode == 'off' or self.clock() < self._silence_until:
                return
            if any(r['owner'] == owner and r['reason'] == reason
                   and time.time() - r['createdAt'] < self.cooldown for r in self._incident):
                return
        if self._mode != 'trace':
            self._mode = 'trace'
            self._deadline = self.clock() + seconds
            self._expires_at = time.time() + seconds
        if len(self._incident) == self.LIMIT:
            # Finite diagnostic history; never delete operational receipts/evidence.
            acknowledged = next((r for r in self._incident if r['delivery'] == 'acknowledged'), self._incident[0])
            self._incident.remove(acknowledged)
            self._evicted += 1
        self._incident.append(dict(id=secrets.token_hex(16), owner=owner, reason=reason,
            createdAt=time.time(), capture='active', delivery='queued', offers=0,
            lastOfferedAt=None, acknowledgedAt=None, replay=replay, seconds=seconds,
            evidence=self._evidence()))
        self._touch()

    def _public(self, row):
        return {k: row[k] for k in self.PUBLIC}

    def inspect(self, principal):
        owner = self.recorder.tag(principal)
        with self._lock:
            self._expire()
            return dict(mode=self._mode, expiresAt=self._expires_at,
                        incidents=[self._public(r) for r in self._incident if r['owner'] == owner],
                        storagePending=self._saved_revision < self._revision,
                        storageErrors=self._storage_errors, evicted=self._evicted)

    def tool(self, principal, args):
        owner = self.recorder.tag(principal)
        with self._lock:
            action = args['action']
            if action == 'activate':
                seconds = args.get('seconds', self.trace_seconds)
                require(type(seconds) is int and 1 <= seconds <= 300, 'DIAGNOSTIC_DURATION')
                require(isinstance(args.get('requestId'), str) and 1 <= len(args['requestId']) <= 128,
                        'DIAGNOSTIC_REQUEST')
                self._trigger(owner, 'manual', seconds, self.recorder.tag(args['requestId']))
            elif action == 'stop':
                if self._mode == 'trace':
                    self._expire(stopped=True)
                    self._silence_until = self.clock() + self.cooldown
            elif action == 'acknowledge':
                row = next((r for r in self._incident if r['owner'] == owner and r['id'] == args.get('incidentId')), None)
                require(row is not None, 'INCIDENT_NOT_FOUND')
                if row['delivery'] != 'acknowledged':
                    row['delivery'], row['acknowledgedAt'] = 'acknowledged', time.time()
                    self._touch()
            else:
                require(action == 'inspect', 'DIAGNOSTIC_ACTION')
            return self.inspect(principal)

    def offers(self, principal):
        owner = self.recorder.tag(principal)
        now = time.time()
        with self._lock:
            self._expire()
            rows = [r for r in self._incident if r['owner'] == owner and r['delivery'] != 'acknowledged'
                    and (r['lastOfferedAt'] is None or now - r['lastOfferedAt'] >= self.OFFER_INTERVAL)][:3]
            for row in rows:
                row['delivery'], row['lastOfferedAt'] = 'offered', now
                row['offers'] += 1
            if rows:
                self._touch()
            return [self._public(r) for r in rows]

    def local(self, command):
        # This socket is restricted to the owning OS UID. No arbitrary file/exec commands.
        if command == {'action': 'snapshot'}:
            result = self.recorder.snapshot()
            with self._lock:
                result['policy'] = self.inspect('@local-operator')
                result['incidents'] = copy.deepcopy(self._incident)
            return result
        try:
            require(isinstance(command, dict) and command.get('action') in ('activate', 'stop'), 'DIAGNOSTIC_ACTION')
            allowed = {'action', 'requestId', 'seconds'} if command['action'] == 'activate' else {'action'}
            require(set(command) <= allowed, 'DIAGNOSTIC_ACTION')
            return self.tool('@local-operator', command)
        except Fault as error:
            return {'error': error.value}

    def _watch(self):
        while not self._stop.wait(.1):
            with self._lock:
                self._expire()
                for row in self._requests.values():
                    if self._mode != 'off' and row['started'] is not None and not row['reported'] and self.clock() - row['started'] >= self.slow_seconds:
                        row['reported'] = True
                        self._trigger(row['owner'], 'slow_dispatch')
                dirty = self._revision > self._saved_revision
                if dirty and not getattr(self, '_storage_disabled', False):
                    state = dict(schema=1, keyId=self.recorder.key_id, revision=self._revision,
                                 evicted=self._evicted, incidents=copy.deepcopy(self._incident))
                    # Replace a stale queued save. Never wait for a blocked disk writer.
                    try:
                        self._save_queue.put_nowait(state)
                    except queue.Full:
                        try:
                            self._save_queue.get_nowait()
                        except queue.Empty:
                            pass
                        try:
                            self._save_queue.put_nowait(state)
                        except queue.Full:
                            pass

    def _save(self):
        while not self._stop.is_set() or not self._save_queue.empty():
            try:
                state = self._save_queue.get(timeout=.2)
            except queue.Empty:
                continue
            try:
                data = canonical(state)
                require(len(data) <= SEGMENT_BYTES, 'DIAGNOSTIC_STATE_LIMIT')
                atomic_write(self.directory / 'incidents.json', data)
                with self._lock:
                    self._saved_revision = max(self._saved_revision, state['revision'])
            except Exception:
                with self._lock:
                    self._storage_errors += 1
                self._stop.wait(.5)

    def close(self):
        # Final state is best-effort; bounded close never waits indefinitely for storage.
        with self._lock:
            self._expire(stopped=True)
            if not getattr(self, '_storage_disabled', False):
                state = dict(schema=1, keyId=self.recorder.key_id, revision=self._revision,
                             evicted=self._evicted, incidents=copy.deepcopy(self._incident))
                try:
                    self._save_queue.get_nowait()
                except queue.Empty:
                    pass
                try:
                    self._save_queue.put_nowait(state)
                except queue.Full:
                    pass
        self._stop.set()
        self._monitor.join(.3)
        self._writer.join(.3)
        self.runtime.close()
