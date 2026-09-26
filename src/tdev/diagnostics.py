"""Bounded, best-effort diagnostic collector for HTTP boundary investigation.

No sink I/O runs under the producer lock. This is not a durable audit ledger.
Identity tags correlate within one diagnostic key generation; they grant no authority.
"""
from collections import deque
import hashlib
import hmac
import itertools
import json
import os
import queue
import secrets
import threading
import time
import argparse
from pathlib import Path
import socket
import stat
import struct

from .common import atomic_write, private_file


class Recorder:
    def __init__(self, sink=None, capacity=256, key=None, identity=None):
        if capacity <= 0:
            raise ValueError('capacity must be positive')
        self.instance = secrets.token_hex(8)
        self._key = key if key is not None else secrets.token_bytes(32)
        self.runtime_identity = dict(identity or {})
        self.key_id = hashlib.sha256(self._key).hexdigest()[:16]
        self._requests = itertools.count(1)
        self._events = itertools.count(1)
        self._lock = threading.Lock()
        self._ring = deque(maxlen=capacity)
        self._active = {}
        self._capacity = capacity
        self._sink = sink
        self._queue = queue.Queue(maxsize=capacity)
        self._stop = threading.Event()
        self._counts = dict(emitted=0, ring_overwrites=0, active_evictions=0,
                            sink_drops=0, sink_errors=0, sink_written=0)
        self._writer = None
        if sink is not None:
            self._writer = threading.Thread(target=self._drain, daemon=True)
            self._writer.start()

    def request(self):
        return next(self._requests)

    def tag(self, value):
        if type(value) not in (str, int):
            return None
        # Never serialize arbitrary objects, commands, payloads or credentials.
        # JSON permits escaped lone surrogates; tagging must not reject an ID
        # that the existing JSON envelope can return with ensure_ascii=True.
        data = (type(value).__name__ + ':' + str(value)).encode('utf-8', 'surrogatepass')
        return hmac.new(self._key, data, hashlib.sha256).hexdigest()[:24]

    def payload_tag(self, data):
        return hmac.new(self._key, data, hashlib.sha256).hexdigest()[:24]

    def identity(self, message, known_tools):
        params = message.get('params') if isinstance(message, dict) else None
        if not isinstance(params, dict):
            params = {}
        args = params.get('arguments')
        if not isinstance(args, dict):
            args = {}
        return {
            'rpcTag': self.tag(message.get('id')),
            'method': message.get('method') if message.get('method') in ('tools/call', 'tools/list', 'server/discover') else 'other',
            'tool': params.get('name') if isinstance(params.get('name'), str) and params.get('name') in known_tools else 'other',
            'requestTag': self.tag(args.get('requestId')),
            'lookupTag': self.tag(args.get('lookupRequestId')),
            'operationTag': self.tag(args.get('operationId')),
            'taskTag': self.tag(args.get('taskId')),
            'action': args.get('action') if args.get('action') in (
                'status', 'stdin', 'cancel', 'retire', 'open', 'inspect', 'list', 'close') else None,
        }

    def outcome(self, value):
        result = value.get('result')
        result = result if isinstance(result, dict) else {}
        receipt = result.get('result')
        receipt = receipt if isinstance(receipt, dict) else {}
        error = value.get('error')
        error = error if isinstance(error, dict) else {}
        return {'ok': value.get('ok') is True,
                'operationTag': self.tag(result.get('id')),
                'status': result.get('status') if result.get('status') in ('running','unknown','succeeded','failed','cancelled') else None,
                'effect': result.get('effect') if result.get('effect') in ('none','unknown','committed') else None,
                'terminal': receipt.get('terminal') if type(receipt.get('terminal')) is bool else None,
                'errorTag': self.tag(error.get('code'))}

    def emit(self, request, event, **fields):
        persist = fields.pop('_persist', True)
        track = fields.pop('_track', True)
        allowed = {'rpcTag','method','tool','requestTag','lookupTag','operationTag','taskTag',
                   'ok','status','effect','terminal','errorTag','authenticated','bytes',
                   'responseTag','httpStatus','durationNs','failureClass','stage','action',
                   'principalTag','runTag','cellTag','sequence','phase','callOrdinal','afterRequest'}
        value = dict(instance=self.instance, pid=os.getpid(), request=request,
                     event=event, timeNs=time.time_ns(),
                     monotonicNs=time.monotonic_ns())
        if event == 'http_parse_started':
            value.update(runtime=self.runtime_identity, keyId=self.key_id)
        if hasattr(time, 'CLOCK_BOOTTIME'):
            value['boottimeNs'] = time.clock_gettime_ns(time.CLOCK_BOOTTIME)
        value.update({k:v for k,v in fields.items() if k in allowed and v is not None})
        with self._lock:
            value['eventId'] = next(self._events)
            for name in ('rpcTag', 'method', 'tool', 'requestTag', 'lookupTag', 'operationTag', 'taskTag', 'action'):
                if track and name not in value and name in self._active.get(request, {}):
                    value[name] = self._active[request][name]
            self._counts['emitted'] += 1
            self._counts['ring_overwrites'] += len(self._ring) == self._capacity
            self._ring.append(value)
            if not track:
                pass  # Detached observations are not active HTTP requests.
            elif event == 'http_finished':
                self._active.pop(request, None)
            else:
                if request not in self._active and len(self._active) == self._capacity:
                    self._active.pop(next(iter(self._active)))
                    self._counts['active_evictions'] += 1
                self._active[request] = value
        if self._sink and persist:
            try:
                self._queue.put_nowait(value)
            except queue.Full:
                with self._lock:
                    self._counts['sink_drops'] += 1
        return value

    def _drain(self):
        while not self._stop.is_set() or not self._queue.empty():
            try:
                value = self._queue.get(timeout=.05)
            except queue.Empty:
                continue
            try:
                self._sink(json.dumps(value, sort_keys=True, separators=(',', ':'))+'\n')
                with self._lock:
                    self._counts['sink_written'] += 1
            except Exception:
                with self._lock:
                    self._counts['sink_errors'] += 1
            finally:
                self._queue.task_done()

    def snapshot(self):
        # Independent of the sink thread: useful even if write/flush is blocked.
        with self._lock:
            return dict(schema=1, instance=self.instance, pid=os.getpid(), keyId=self.key_id,
                        identity=self.runtime_identity, sampledNs=time.time_ns(),
                        counts=dict(self._counts), queueDepth=self._queue.qsize(),
                        active=list(self._active.values()), recent=list(self._ring))

    def close(self, timeout=.2):
        self._stop.set()
        if self._writer:
            self._writer.join(timeout)
        return self._writer is None or not self._writer.is_alive()


SEGMENT_BYTES = 2 * 1024 * 1024
SEGMENTS = 4
SNAPSHOT_BYTES = 2 * 1024 * 1024


def private_directory(directory):
    directory = Path(directory)
    directory.mkdir(mode=0o700, exist_ok=True)
    info = directory.lstat()
    if not stat.S_ISDIR(info.st_mode) or info.st_uid != os.getuid() or info.st_mode & 0o077:
        raise ValueError('diagnostic directory must be private and owned')
    return directory


def identity(source):
    """Bind loaded package files and bundle label; does not attest host delivery."""
    source = Path(source)
    manifest = source / 'manifest.json'
    files = {str(p.relative_to(source)): hashlib.sha256(p.read_bytes()).hexdigest()
             for p in sorted((source / 'src/tdev').glob('*.py'))}
    files['contracts/tools.schema.json'] = hashlib.sha256(
        (source / 'contracts/tools.schema.json').read_bytes()).hexdigest()
    return dict(bundle=json.loads(manifest.read_bytes())['id'] if manifest.is_file() else None,
                sourceDigest=hashlib.sha256(json.dumps(files, sort_keys=True).encode()).hexdigest())


class RotatingSink:
    """Single writer; opens per record so rotation/export never holds a producer lock."""
    def __init__(self, directory, max_bytes=SEGMENT_BYTES, segments=SEGMENTS):
        if max_bytes <= 0 or segments < 2:
            raise ValueError('invalid log bounds')
        self.directory = Path(directory)
        self.max_bytes, self.segments = max_bytes, segments

    def __call__(self, line):
        data = line.encode()
        if len(data) > self.max_bytes:
            raise ValueError('diagnostic record exceeds segment bound')
        current = self.directory / 'events.0.jsonl'
        fd = os.open(current, os.O_WRONLY | os.O_APPEND | os.O_CREAT | os.O_NOFOLLOW | os.O_NONBLOCK, 0o600)
        try:
            info = os.fstat(fd)
            if not stat.S_ISREG(info.st_mode) or info.st_uid != os.getuid() or info.st_mode & 0o077:
                raise ValueError('unsafe diagnostic log')
            if info.st_size + len(data) > self.max_bytes:
                os.close(fd)
                fd = None
                for n in range(self.segments - 1, 0, -1):
                    old = self.directory / f'events.{n-1}.jsonl'
                    if old.exists():
                        os.replace(old, self.directory / f'events.{n}.jsonl')
                fd = os.open(current, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
            with os.fdopen(fd, 'ab', closefd=False) as stream:
                stream.write(data)
                stream.flush()
        finally:
            if fd is not None:
                os.close(fd)


def control_address(directory):
    # Linux/Android abstract sockets avoid sockaddr_un's short filesystem-path limit.
    label = hashlib.sha256(str(Path(directory).resolve()).encode()).hexdigest()[:32]
    return '\0tdev-diagnostic-' + str(os.getuid()) + '-' + label


def same_uid(connection):
    _, uid, _ = struct.unpack('3i', connection.getsockopt(socket.SOL_SOCKET, socket.SO_PEERCRED, 12))
    return uid == os.getuid()


class RuntimeDiagnostics:
    """Installation-local recorder and read-only operator snapshot channel.

    Initialization failure degrades to memory-only recording. Neither the log writer
    nor the operator socket participates in tool admission, cancellation or recovery.
    """
    def __init__(self, directory, source, recorder_factory=Recorder):
        self.directory = Path(directory)
        self._stop = threading.Event()
        self._socket = self._control = None
        try:
            metadata = identity(source)
        except (OSError, ValueError, KeyError):
            metadata = {'sourceIdentity': 'unavailable'}
        key, sink = None, None
        try:
            private_directory(self.directory)
            key_file = self.directory / 'correlation.key'
            if not key_file.exists() and not key_file.is_symlink():
                # Controller owns the state lock, hence a single key initializer.
                atomic_write(key_file, secrets.token_bytes(32))
            key = private_file(key_file)
            if len(key) != 32:
                raise ValueError('invalid correlation key')
            sink = RotatingSink(self.directory)
            metadata['persistence'] = 'enabled'
        except Exception:
            key = None
            metadata['persistence'] = 'unavailable'
        self.recorder = recorder_factory(sink=sink, key=key, identity=metadata)
        try:
            self._socket = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
            self._socket.bind(control_address(self.directory))
            self._socket.listen(4)
            self._socket.settimeout(.1)
            metadata['control'] = 'enabled'
            self._control = threading.Thread(target=self._serve, daemon=True)
        except OSError:
            if self._socket:
                self._socket.close()
            self._socket = None
            metadata['control'] = 'unavailable'
        self.recorder.runtime_identity = metadata
        # A per-process record binds rotated events even after the process exits.
        if sink:
            try:
                self.recorder._queue.put_nowait(dict(event='runtime_started', **self.recorder.snapshot()))
            except queue.Full:
                pass
        if self._control:
            self._control.start()

    def _serve(self):
        while not self._stop.is_set():
            try:
                connection, _ = self._socket.accept()
            except socket.timeout:
                continue
            except OSError:
                return
            with connection:
                try:
                    connection.settimeout(.5)
                    if same_uid(connection):
                        command = bytearray()
                        while b'\n' not in command and len(command) <= 4096:
                            chunk = connection.recv(4096)
                            if not chunk:
                                break
                            command.extend(chunk)
                        if len(command) > 4096:
                            continue
                        request = json.loads(command)
                        handler = getattr(self, 'control_handler', None)
                        if handler:
                            value = handler(request)
                        elif request == {'action': 'snapshot'}:
                            value = self.recorder.snapshot()
                        else:
                            value = {'error': 'unsupported_command'}
                        data = json.dumps(value, separators=(',', ':')).encode()
                        if len(data) <= SNAPSHOT_BYTES:
                            connection.sendall(data)
                except (OSError, ValueError, TypeError, KeyError):
                    pass

    def close(self):
        self._stop.set()
        if self._socket:
            self._socket.close()
        if self._control:
            self._control.join(.7)
        return self.recorder.close()


def control(directory, command, timeout=2):
    with socket.socket(socket.AF_UNIX, socket.SOCK_STREAM) as connection:
        connection.settimeout(timeout)
        connection.connect(control_address(directory))
        if not same_uid(connection):
            raise ValueError('diagnostic peer ownership mismatch')
        data = json.dumps(command, separators=(',', ':')).encode() + b'\n'
        if len(data) > 4096:
            raise ValueError('diagnostic command exceeds bound')
        connection.sendall(data)
        chunks, size = [], 0
        while True:
            data = connection.recv(65536)
            if not data:
                break
            size += len(data)
            if size > SNAPSHOT_BYTES:
                raise ValueError('diagnostic snapshot exceeds bound')
            chunks.append(data)
    return json.loads(b''.join(chunks))


def snapshot(directory, timeout=2):
    return control(directory, {'action': 'snapshot'}, timeout)


def export(directory, destination):
    """Pin a bounded evidence copy, never pause execution or rotate the source.

    Files are copied by descriptor, so rename cannot mix file contents. Rotation
    can still omit/duplicate segments across opens; hashes and coverage disclose it.
    """
    directory, destination = Path(directory), Path(destination)
    # Refuse reuse/overwrite, including a symlink. The caller owns this export.
    destination.mkdir(mode=0o700)
    report = dict(schema=1, startedNs=time.time_ns(), files={}, gaps=[],
                  atomic=False, meaning='server evidence, not host receipt or visible progress')
    try:
        observed = snapshot(directory)
        atomic_write(destination / 'snapshot.json', json.dumps(observed, sort_keys=True).encode())
        report['instance'] = observed['instance']
    except (OSError, ValueError):
        report['gaps'].append('live_snapshot_unavailable')
    for name in [*(f'events.{n}.jsonl' for n in range(SEGMENTS)), 'incidents.json']:
        fd = None
        try:
            fd = os.open(directory / name, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
            info = os.fstat(fd)
            if not stat.S_ISREG(info.st_mode) or info.st_uid != os.getuid() or info.st_mode & 0o077:
                raise ValueError('unsafe diagnostic log')
            with os.fdopen(fd, 'rb', closefd=False) as stream:
                data = stream.read(SEGMENT_BYTES + 1)
            if len(data) > SEGMENT_BYTES:
                raise ValueError('oversize diagnostic log')
            atomic_write(destination / name, data)
            rows = []
            for line in data.splitlines():
                try:
                    row = json.loads(line)
                    if isinstance(row, dict):
                        rows.append(row)
                except ValueError:
                    report['gaps'].append(name + ':partial_record')
            coverage = {}
            for row in rows:
                if type(row.get('eventId')) is int and isinstance(row.get('instance'), str):
                    coverage.setdefault(row['instance'], []).append(row['eventId'])
            report['files'][name] = dict(bytes=len(data), sha256=hashlib.sha256(data).hexdigest(),
                                        coverage={k:dict(first=min(v), last=max(v), records=len(v))
                                                  for k,v in coverage.items()})
        except FileNotFoundError:
            report['gaps'].append(name + ':absent_or_rotated')
        except (OSError, ValueError):
            report['gaps'].append(name + ':unavailable')
        finally:
            if fd is not None:
                os.close(fd)
    report['finishedNs'] = time.time_ns()
    atomic_write(destination / 'export.json', json.dumps(report, sort_keys=True, indent=2).encode())
    return report


def main():
    parser = argparse.ArgumentParser(description='Local read-only diagnostic snapshot/evidence export')
    parser.add_argument('action', choices=('snapshot', 'export', 'activate', 'stop'))
    parser.add_argument('--state', required=True)
    parser.add_argument('--output')
    parser.add_argument('--seconds', type=int, default=120)
    parser.add_argument('--request-id')
    args = parser.parse_args()
    if args.action == 'export' and not args.output:
        parser.error('export requires a new --output directory')
    directory = Path(args.state) / 'diagnostics'
    if args.action == 'export':
        value = export(directory, args.output)
    else:
        command = {'action': args.action}
        if args.action == 'activate':
            command.update(seconds=args.seconds, requestId=args.request_id or secrets.token_hex(16))
        value = control(directory, command)
    print(json.dumps(value, sort_keys=True))


if __name__ == '__main__':
    main()
