"""Exact same-origin Phase A deployment/readback. Never logs credentials.

Upload is NOT retried after response loss: inspect provider state first. Only
explicitly named predecessor product classes may be retired. No unrelated
Worker, D1, R2, Access application or account cleanup is performed.
"""
from __future__ import annotations
import argparse
import datetime
import hashlib
import json
import os
from pathlib import Path
import re
import shlex
import stat
import sys
import urllib.error
import urllib.request
import uuid


def private_bytes(filename: str | Path) -> bytes:
    p = Path(filename).absolute()
    s = p.lstat()
    if not stat.S_ISREG(s.st_mode) or p.is_symlink() or p.resolve() != p or s.st_mode & 0o077 or s.st_size > 4 * 1024 * 1024:
        raise RuntimeError('Unsafe private installation file')
    return p.read_bytes()


def credentials(filename: str) -> dict[str, str]:
    values = {}
    for line in private_bytes(filename).decode().splitlines():
        match = re.match(r'\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$', line)
        if match:
            parts = shlex.split(match[2], comments=True)
            values[match[1]] = parts[0] if parts else ''
    for key in ['CLOUDFLARE_API_TOKEN', 'CLOUDFLARE_ACCOUNT_ID']:
        if not values.get(key):
            raise RuntimeError('Missing required provider credential')
    return values


class ProviderError(RuntimeError):
    def __init__(self, status: int, codes: list, messages: list):
        super().__init__('Provider operation failed')
        self.status, self.codes, self.messages = status, codes, messages


class Provider:
    def __init__(self, values: dict[str, str]):
        self.base = 'https://api.cloudflare.com/client/v4/accounts/' + values['CLOUDFLARE_ACCOUNT_ID']
        self.token = values['CLOUDFLARE_API_TOKEN']

    def call(self, path: str, method: str = 'GET', body=None, content_type: str = 'application/json'):
        data = json.dumps(body, separators=(',', ':')).encode() if isinstance(body, (dict, list)) else body
        req = urllib.request.Request(self.base + path, data=data, method=method,
                                     headers={'Authorization': 'Bearer ' + self.token, 'Content-Type': content_type})
        try:
            response = urllib.request.urlopen(req, timeout=60)
            status, raw = response.status, response.read()
        except urllib.error.HTTPError as error:
            status, raw = error.code, error.read()
        try:
            result = json.loads(raw)
        except (UnicodeError, json.JSONDecodeError):
            raise ProviderError(status, [], ['Non-JSON provider response']) from None
        if status >= 400 or result.get('success') is not True:
            errors = result.get('errors') or []
            raise ProviderError(status, [e.get('code') for e in errors], [str(e.get('message', ''))[:2000].replace(self.token, '[redacted]') for e in errors])
        return result.get('result')


def write_evidence(filename: str, value: dict) -> None:
    p = Path(filename)
    p.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    with p.open('w', encoding='utf-8') as f:
        json.dump(value, f, indent=2)
        f.write('\n')
        f.flush()
        os.fsync(f.fileno())


def digest(raw: bytes) -> str:
    return 'sha256:' + hashlib.sha256(raw).hexdigest()


def active(deployments: dict) -> dict:
    values = deployments.get('deployments') or []
    if not values:
        raise RuntimeError('No observed active deployment')
    newest = max(values, key=lambda v: v['created_on'])
    versions = newest.get('versions') or []
    if len(versions) != 1 or versions[0].get('percentage') != 100:
        raise RuntimeError('Expected a single exact active Worker version')
    return newest


def main() -> None:
    os.umask(0o077)
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('action', choices=['read', 'deploy'])
    parser.add_argument('--credentials', required=True)
    parser.add_argument('--installation', required=True)
    parser.add_argument('--output', required=True)
    parser.add_argument('--expected-version')
    args = parser.parse_args()
    manifest = json.loads(private_bytes(args.installation))
    config = json.loads(private_bytes(manifest['configFile']))
    edge = config['edge']
    worker = manifest['workerName']
    if not re.fullmatch(r'[A-Za-z0-9_-]+', worker):
        raise RuntimeError('Invalid Worker name')
    provider = Provider(credentials(args.credentials))
    root = '/workers/scripts/' + worker
    subdomain = provider.call('/workers/subdomain')
    if manifest['origin'] != f"https://{worker}.{subdomain['subdomain']}.workers.dev" or edge['origin'] != manifest['origin']:
        raise RuntimeError('Actual workers.dev binding differs from installation')
    route = provider.call(root + '/subdomain')
    app = provider.call('/access/apps/' + manifest['accessApplicationId'])
    if app.get('domain') != manifest['origin'][8:] + '/mcp' or app.get('aud') != edge['applicationAudience'] or not (app.get('oauth_configuration') or {}).get('enabled'):
        raise RuntimeError('Human Access application binding differs')
    policies = provider.call('/access/apps/' + manifest['accessApplicationId'] + '/policies')
    settings = provider.call(root + '/settings')
    deployment = active(provider.call(root + '/deployments'))
    active_config_text = next((b.get('text') for b in settings.get('bindings', []) if b.get('name') == 'DEV2_CONFIG_JSON'), None)
    active_config = json.loads(active_config_text) if active_config_text is not None else None
    configuration_readback = {'present': active_config is not None, 'matchesInstalled': active_config == edge,
                              'sourceCommitOid': active_config.get('sourceCommitOid') if active_config else None,
                              'edgeBundleDigest': active_config.get('edgeBundleDigest') if active_config else None,
                              'installationId': active_config.get('installationId') if active_config else None}
    observation = {'observedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(), 'action': args.action,
                   'origin': manifest['origin'], 'sourceCommitOid': manifest['sourceCommitOid'],
                   'schemaDigest': manifest['schemaDigest'], 'edgeBundleDigest': manifest['edgeBundleDigest'],
                   'route': route, 'deployment': deployment, 'configurationReadback': configuration_readback,
                   'access': {'id': app['id'], 'domain': app['domain'], 'aud': app['aud'],
                              'issuer': edge['issuer'], 'oauthEnabled': True, 'policyIds': [p['id'] for p in policies]},
                   'bindings': [{k: b.get(k) for k in ['name', 'type', 'class_name', 'script_name', 'namespace_id']} for b in settings.get('bindings', [])],
                   'exports': settings.get('exports'), 'mutationPerformed': False}
    write_evidence(args.output, observation)
    if args.action == 'read':
        print(json.dumps(observation))
        return
    expected = args.expected_version
    if not expected or deployment['versions'][0]['version_id'] != expected:
        raise RuntimeError('Active deployment changed; rebind before mutation')
    worker_bytes = private_bytes(Path(manifest['releaseDirectory']) / 'worker.mjs')
    if digest(worker_bytes) != manifest['edgeBundleDigest'] or edge['sourceCommitOid'] != manifest['sourceCommitOid']:
        raise RuntimeError('Installed edge bytes or source identity changed')
    secret = private_bytes(config['deviceKeyFile']).decode().strip()
    if digest(secret.encode()) != edge['deviceCredentialDigest']:
        raise RuntimeError('Device credential binding changed')
    namespaces = provider.call('/workers/durable_objects/namespaces')
    local_classes = {n.get('class') for n in namespaces if n.get('script') == worker}
    retired = set(manifest.get('retireClasses', []))
    if local_classes - retired - {'Dev2RendezvousDO'}:
        raise RuntimeError('Unrelated local Durable Object class would be affected')
    exports = {'Dev2RendezvousDO': {'type': 'durable-object', 'storage': 'sqlite'}}
    for name in sorted(local_classes & retired):
        exports[name] = {'type': 'durable-object', 'state': 'deleted'}
    metadata = {'main_module': 'worker.mjs', 'compatibility_date': '2026-08-15', 'compatibility_flags': ['nodejs_compat'],
                'exports': exports,
                'bindings': [{'name': 'DEV2_CONFIG_JSON', 'type': 'plain_text', 'text': json.dumps(edge, separators=(',', ':'))},
                             {'name': 'DEV2_DEVICE_SECRET', 'type': 'secret_text', 'text': secret},
                             {'name': 'DEV2_VERSION', 'type': 'version_metadata'},
                             {'name': 'DEV2_ROUTER', 'type': 'durable_object_namespace', 'class_name': 'Dev2RendezvousDO'}],
                'observability': {'enabled': True, 'logs': {'enabled': True, 'invocation_logs': True}},
                'annotations': {'workers/message': 'dev-2 Phase A ' + manifest['sourceCommitOid']}}
    boundary = 'dev2-' + uuid.uuid4().hex
    parts = []
    for name, media, data in [('metadata', 'application/json', json.dumps(metadata, separators=(',', ':')).encode()), ('worker.mjs', 'application/javascript+module', worker_bytes)]:
        parts.extend([f'--{boundary}\r\nContent-Disposition: form-data; name="{name}"; filename="{name}"\r\nContent-Type: {media}\r\n\r\n'.encode(), data, b'\r\n'])
    parts.append(f'--{boundary}--\r\n'.encode())
    # No retry here. A lost upload response requires independent active readback.
    result = provider.call(root, 'PUT', b''.join(parts), 'multipart/form-data; boundary=' + boundary)
    after = active(provider.call(root + '/deployments'))
    route_after = provider.call(root + '/subdomain')
    if route_after.get('enabled') is not True or route_after.get('previews_enabled') is not False:
        provider.call(root + '/subdomain', 'POST', {'enabled': True, 'previews_enabled': False})
        route_after = provider.call(root + '/subdomain')
    current = provider.call(root + '/settings')
    installed_config = next((b.get('text') for b in current.get('bindings', []) if b.get('name') == 'DEV2_CONFIG_JSON'), None)
    if installed_config is None or json.loads(installed_config) != edge:
        raise RuntimeError('Active configuration readback mismatch')
    observation.update({'completedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(), 'mutationPerformed': True,
                        'beforeDeployment': deployment, 'deployment': after, 'route': route_after,
                        'configurationReadback': {'present': True, 'matchesInstalled': True, 'sourceCommitOid': edge['sourceCommitOid'], 'edgeBundleDigest': edge['edgeBundleDigest'], 'installationId': edge['installationId']},
                        'upload': {k: result.get(k) for k in ['id', 'etag', 'created_on', 'modified_on', 'startup_time_ms']},
                        'exports': current.get('exports'), 'retiredProductClasses': sorted(local_classes & retired),
                        'bindings': [{k: b.get(k) for k in ['name', 'type', 'class_name', 'script_name', 'namespace_id']} for b in current.get('bindings', [])]})
    write_evidence(args.output, observation)
    print(json.dumps(observation))


if __name__ == '__main__':
    try:
        main()
    except ProviderError as error:
        print(json.dumps({'event': 'provider_failure', 'http': error.status, 'codes': error.codes, 'messages': error.messages}), file=sys.stderr)
        sys.exit(1)
    except Exception as error:
        print(json.dumps({'event': 'deployment_not_confirmed', 'type': type(error).__name__, 'reason': str(error)[:500]}), file=sys.stderr)
        sys.exit(1)
