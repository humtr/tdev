"""Installer-owned connection identities; no permissions or remote provisioning."""
import json
import re
from pathlib import Path

from .common import digest, private_file, require


def entries(settings):
    if 'connections' not in settings:
        if 'tunnelId' not in settings:
            return {}
        return {'legacy': {'id': 'legacy', 'name': 'default', 'tunnelId': settings['tunnelId'],
                           'authMode': settings.get('connectorAuth', 'bearer'), 'enabled': True,
                           'credentialId': None, 'profileDigest': settings['profileDigest']}}
    value = settings['connections']
    from jsonschema import Draft202012Validator
    schema = json.loads((Path(__file__).resolve().parents[2]/'contracts/connections.schema.json').read_bytes())
    require(Draft202012Validator(schema).is_valid(value), 'CONNECTION_CONFIG')
    names, tunnels = set(), set()
    for ident, c in value.items():
        require(c['id'] == ident, 'CONNECTION_ID')
        require(c['name'] not in names and c['tunnelId'] not in tunnels, 'CONNECTION_DUPLICATE')
        require(c['credentialId'] is not None or ident == 'legacy', 'CREDENTIAL_ID')
        names.add(c['name']); tunnels.add(c['tunnelId'])
    return value


def service(ident):
    return 'tdev-tunnel' if ident == 'legacy' else 'tdev-tunnel-' + ident


def services(settings):
    return ('tdev', *(service(i) for i in entries(settings)))


def paths(root, ident):
    root = Path(root)
    if ident == 'legacy':
        return root/'tunnel-profiles', 'tdev', root/'tunnel-health.url'
    require(re.fullmatch(r'conn_[0-9a-f]{32}', ident), 'CONNECTION_ID')
    base = root/'connections'/ident
    return base/'profiles', 'tdev', base/'health.url'


def select(settings, name):
    found = [c for c in entries(settings).values() if name in (c['id'], c['name'])]
    require(len(found) == 1, 'CONNECTION_NOT_FOUND')
    return found[0]


def compatible(root, bundle):
    """Reject old readers before changing services/pointers, including controller-only installs."""
    root, bundle = Path(root), Path(bundle)
    settings = json.loads(private_file(root/'resident.json')) if (root/'resident.json').exists() else {}
    config = json.loads(private_file(root/'config.json')) if (root/'config.json').exists() else {}
    if 'connections' in settings or config.get('connectionFormat'):
        require((bundle/'src/tdev/connections.py').is_file(), 'CONNECTION_VERSION',
                'This installation requires a connection-aware bundle; security state cannot be rolled back')
    if config and (bundle/'contracts/config.schema.json').exists():
        from jsonschema import Draft202012Validator
        schema = json.loads((bundle/'contracts/config.schema.json').read_bytes())
        require(Draft202012Validator(schema).is_valid(config), 'CONFIG_VERSION')


def verify_profiles(root, settings):
    for ident, c in entries(settings).items():
        directory, profile, _ = paths(root, ident)
        require(digest(private_file(directory/(profile+'.yaml'))) == c['profileDigest'], 'TUNNEL_PROFILE_CHANGED')
    if entries(settings):
        require(digest(Path(settings['runtime']['binary']).read_bytes()) == settings['runtime']['digest'], 'TUNNEL_BINARY_CHANGED')
