"""Disposable Git/config fixtures and HTTP process control, independent of tdev modules."""
import base64
import hashlib
import http.client
from http.server import BaseHTTPRequestHandler, HTTPServer
import json
import os
from pathlib import Path
import shutil
import socket
import subprocess
import sys
import tempfile
import threading
import time


SOURCE = Path(__file__).resolve().parents[2]
CONTRACT = json.loads((SOURCE / 'contracts/tools.schema.json').read_text())
VERSION = CONTRACT['x-mcp']['protocolVersion']
META = 'io.modelcontextprotocol/'
MAX_RESPONSE = 2 * 1024 * 1024


def read_response(response):
    data = response.read(MAX_RESPONSE + 1)
    if len(data) > MAX_RESPONSE:
        raise AssertionError('Acceptance response exceeded 2 MiB')
    return data


def git(*args, cwd=None):
    env = {k: os.environ[k] for k in ('PATH', 'PREFIX', 'TMPDIR', 'LD_LIBRARY_PATH') if k in os.environ}
    env.update(GIT_CONFIG_NOSYSTEM='1', GIT_CONFIG_GLOBAL=os.devnull,
               GIT_AUTHOR_NAME='Acceptance', GIT_AUTHOR_EMAIL='acceptance@localhost',
               GIT_COMMITTER_NAME='Acceptance', GIT_COMMITTER_EMAIL='acceptance@localhost',
               GIT_AUTHOR_DATE='2026-01-01T00:00:00Z', GIT_COMMITTER_DATE='2026-01-01T00:00:00Z',
               GIT_TERMINAL_PROMPT='0')
    return subprocess.check_output(['git', '-c', 'core.hooksPath=/dev/null', *args],
                                   cwd=cwd, env=env, stderr=subprocess.PIPE, timeout=15).decode().strip()


def eventually(read, predicate, seconds=15):
    deadline = time.monotonic() + seconds
    while True:
        value = read()
        if predicate(value):
            return value
        if time.monotonic() >= deadline:
            raise AssertionError(f'Timed out waiting for fixture: {value!r}')
        time.sleep(.03)


class Runtime:
    def __init__(self, object_format='sha1', *, request_timeout_seconds=15):
        self.request_timeout_seconds = request_timeout_seconds
        self.root = Path(tempfile.mkdtemp(prefix='tdev-acceptance-'))
        self.state = self.root / 'state'
        self.work = self.root / 'authored'
        self.remote = self.root / 'remote.git'
        self.config_file = self.root / 'config.json'
        self.process = None
        self.log = None
        self.log_thread = None
        self.requests = set()
        self.next_id = 0
        self.launch_environment = {}
        try:
            git('init', '--template=', '--object-format=' + object_format, '-b', 'main', str(self.work))
            (self.work / 'a.txt').write_text('hello\n')
            (self.work / 'b.txt').write_text('world\n')
            git('add', '.', cwd=self.work)
            git('commit', '-m', 'fixture', cwd=self.work)
            self.head = git('rev-parse', 'HEAD', cwd=self.work)
            git('init', '--template=', '--object-format=' + object_format, '--bare', str(self.remote))
            git('push', str(self.remote), 'HEAD:refs/heads/main', cwd=self.work)
            st = self.remote.stat()
            self.config = {'version': 1,
                'principals': {'alice': {'tokenHash': hashlib.sha256(b'alice-secret').hexdigest(),
                    'repos': {'test': ['refs/heads/main']},
                    'managedRefNamespaces': {'test': ['refs/heads/work/']}}},
                'repositories': {'test': {'kind': 'local', 'name': 'Human project',
                    'remote': str(self.remote), 'identity': f'local:{st.st_dev}:{st.st_ino}',
                    'refs': ['refs/heads/main'], 'managedRefNamespaces': ['refs/heads/work/'],
                    'validation': 'test -f a.txt', 'validationTimeoutSeconds': 20}}}
            self.save_config()
            self.start()
        except BaseException:
            self.stop()
            shutil.rmtree(self.root)
            raise

    def save_config(self):
        # Only synthetic operator configuration; atomic replacement exercises hot reads.
        staged = self.root / 'config.next'
        staged.write_text(json.dumps(self.config))
        staged.chmod(0o600)
        staged.replace(self.config_file)

    def start(self):
        if self.process is not None and self.process.poll() is None:
            raise AssertionError('Fixture controller already running')
        # Existing CLI accepts an explicit port. Verify PID at readiness, so a port race
        # fails rather than accidentally directing effects to another listener.
        with socket.socket() as reservation:
            reservation.bind(('127.0.0.1', 0))
            self.port = reservation.getsockname()[1]
        configured = os.environ.get('TDEV_ACCEPTANCE_COMMAND')
        argv = json.loads(configured) if configured else [sys.executable, '-m', 'tdev.server']
        if not isinstance(argv, list) or not argv or not all(isinstance(v, str) and v for v in argv):
            raise ValueError('TDEV_ACCEPTANCE_COMMAND must be a nonempty JSON argv array')
        env = {k: os.environ[k] for k in ('PATH', 'PREFIX', 'TMPDIR', 'LD_LIBRARY_PATH') if k in os.environ}
        (self.root / 'home').mkdir(exist_ok=True)
        env['HOME'] = str(self.root / 'home')
        # Fixture-owned utility wrappers exercise dispatch/persistence gaps;
        # the executable receives no implementation selector or fault switches.
        env.update(self.launch_environment)
        if configured is None:
            # Transitional launch adapter only; semantic tests do not import Python runtime.
            env['PYTHONPATH'] = str(SOURCE / 'src') + os.pathsep + str(SOURCE / '.tdev-deps')
        self.log = open(self.root / 'controller.log', 'ab')
        self.process = subprocess.Popen([*argv, '--state', str(self.state), '--config',
            str(self.config_file), '--port', str(self.port), '--diagnostics', 'off'],
            cwd=self.root, env=env, stdin=subprocess.DEVNULL, stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT, start_new_session=True)
        pipe, log = self.process.stdout, self.log

        def capture():
            with pipe:
                while chunk := pipe.read(8192):
                    remaining = max(0, 1024 * 1024 - log.tell())
                    log.write(chunk[:remaining])
                    log.flush()
        self.log_thread = threading.Thread(target=capture, daemon=True)
        self.log_thread.start()

        def ready():
            if self.process.poll() is not None:
                raise AssertionError('Controller exited: ' + (self.root / 'controller.log').read_text()[-4000:])
            conn = http.client.HTTPConnection('127.0.0.1', self.port, timeout=.5)
            try:
                conn.request('GET', '/healthz')
                response = conn.getresponse()
                value = json.loads(read_response(response))
                if value.get('pid') != self.process.pid:
                    raise AssertionError('Fixture port belongs to another process')
                return response.status == 200 and value.get('status') == 'up'
            except (ConnectionError, TimeoutError):
                return False
            finally:
                conn.close()
        eventually(ready, bool)

    def stop(self):
        if self.process is not None:
            if self.process.poll() is None:
                self.process.kill()
            self.process.wait(timeout=5)
            self.process = None
        if self.log_thread is not None:
            self.log_thread.join(timeout=5)
            if self.log_thread.is_alive():
                raise AssertionError('Owned controller log pipe remained open')
            self.log_thread = None
        if self.log is not None:
            self.log.close()
            self.log = None

    def restart(self):
        self.stop()
        self.start()

    def request(self, method='tools/list', params=None, headers=None, *, progress=None, port=None):
        self.next_id += 1
        meta = {META + 'protocolVersion': VERSION, META + 'clientCapabilities': {}}
        if progress is not None:
            meta['progressToken'] = progress
        params = {'_meta': meta, **(params or {})}
        selected = port or self.port
        h = {'Authorization': 'Bearer alice-secret', 'Content-Type': 'application/json',
             'Accept': 'application/json, text/event-stream', 'MCP-Protocol-Version': VERSION,
             'Mcp-Method': method}
        if method == 'tools/call':
            h['Mcp-Name'] = params.get('name', '')
        h.update(headers or {})
        h = {k: v for k, v in h.items() if v is not None}
        conn = http.client.HTTPConnection('127.0.0.1', selected, timeout=self.request_timeout_seconds)
        try:
            conn.request('POST', '/mcp', json.dumps({'jsonrpc': '2.0', 'id': self.next_id,
                'method': method, 'params': params}), h)
            response = conn.getresponse()
            data = read_response(response)
            media = response.getheader('Content-Type', '').split(';', 1)[0]
            if media == 'text/event-stream':
                values = [json.loads(line[5:]) for line in data.splitlines() if line.startswith(b'data:')]
                value = next(v for v in values if v.get('id') == self.next_id)
            else:
                value = json.loads(data) if data else None
            return response.status, media, value, data
        finally:
            conn.close()

    def call(self, tool, args, **kwargs):
        if tool in ('exec', 'validate'):
            self.requests.add(args['requestId'])
        status, _, value, _ = self.request('tools/call', {'name': 'tdev_' + tool,
                                           'arguments': {'request': args}}, **kwargs)
        if status != 200 or 'error' in value:
            raise AssertionError((status, value))
        result = value['result']['structuredContent']
        if not result['ok']:
            raise AssertionError(result)
        return result['result']

    def status(self, operation, **kwargs):
        return self.call('operation', {'action': 'status', 'operationId': operation, **kwargs})

    def terminal(self, operation):
        return eventually(lambda: self.status(operation, waitMs=100),
                          lambda v: v['status'] not in ('running', 'unknown'), seconds=25)

    def open(self):
        return self.call('task', {'action': 'open', 'requestId': 'open', 'repo': 'test',
            'ref': 'refs/heads/main', 'expectedHead': self.head})['result']

    def discard_reply(self, tool, args):
        """Forward exactly once, drain and discard the reply before the caller receives it."""
        completed = threading.Event()
        failures = []
        upstream_port = self.port
        upstream_timeout = self.request_timeout_seconds

        class Discard(BaseHTTPRequestHandler):
            def log_message(self, *unused):
                pass

            def do_POST(self):
                upstream = http.client.HTTPConnection('127.0.0.1', upstream_port, timeout=upstream_timeout)
                try:
                    body = self.rfile.read(int(self.headers['Content-Length']))
                    headers = dict(self.headers)
                    headers['Host'] = f'127.0.0.1:{upstream_port}'
                    upstream.request('POST', self.path, body, headers)
                    read_response(upstream.getresponse())
                    completed.set()
                except Exception as error:
                    failures.append(error)
                finally:
                    upstream.close()
                    self.close_connection = True

        with HTTPServer(('127.0.0.1', 0), Discard) as proxy:
            proxy.timeout = 20
            thread = threading.Thread(target=proxy.handle_request, daemon=True)
            thread.start()
            try:
                self.call(tool, args, port=proxy.server_port)
                raise AssertionError('Discard proxy unexpectedly returned a response')
            except http.client.RemoteDisconnected:
                pass
            finally:
                thread.join(timeout=20)
            if thread.is_alive() or failures or not completed.is_set():
                raise AssertionError(('Lost-response fixture did not forward once', failures))

    def close(self):
        try:
            if self.requests and (self.process is None or self.process.poll() is not None):
                self.stop()
                self.start()
            for request in self.requests:
                status, _, response, _ = self.request('tools/call', {'name': 'tdev_operation',
                    'arguments': {'request': {'action': 'status', 'lookupRequestId': request}}})
                if status != 200 or not response['result']['structuredContent']['ok']:
                    # Rejected admissions have no process. An actual transport failure is
                    # an error, not permission to delete a potentially live fixture.
                    error = response.get('result', {}).get('structuredContent', {}).get('error', {})
                    if error.get('code') == 'OPERATION_NOT_FOUND':
                        continue
                    raise AssertionError(('Cannot reconcile fixture cleanup', response))
                op = response['result']['structuredContent']['result']
                if op['status'] in ('running', 'unknown'):
                    self.call('operation', {'action': 'cancel', 'requestId': 'cleanup-' + op['id'],
                                           'operationId': op['id']})
                    self.terminal(op['id'])
        except BaseException:
            print('Unreconciled acceptance fixture retained at', self.root, file=sys.stderr)
            raise
        else:
            self.stop()
            shutil.rmtree(self.root)
        finally:
            self.stop()


def output(operation):
    return base64.b64decode(operation['output']['data'])
