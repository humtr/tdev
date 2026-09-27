"""Local operator connection lifecycle. Recoverable forward intent; no MCP management tool."""
import copy
import fcntl
import json
import re
import secrets
import shutil
import uuid
from pathlib import Path

from . import connection_model as cm
from .common import Fault, atomic_write, canonical, digest, private_file, require
from .resident import Installation, templates, sync


class Connections:
    def __init__(self, root, backend=None):
        self.installation = Installation(root, backend)
        self.root = self.installation.root
        self.journal = self.root/'connection-transaction.json'

    def settings(self):
        return self.installation.settings()

    def credential_file(self, c):
        if c['credentialId'] is None:
            return self.root/'connector.secret'
        return self.root/'connections'/c['id']/(c['credentialId']+'.secret')

    def observe(self, name=None):
        s = self.settings()
        selected = [cm.select(s, name)] if name else list(cm.entries(s).values())
        config = json.loads(private_file(self.root/'config.json'))
        rows = []
        for c in selected:
            row = {k:c[k] for k in ('id','name','tunnelId','authMode','enabled','credentialId')}
            row['credentialState'] = (config.get('credentials', {}).get(c['credentialId'], {}).get('state', 'missing')
                                      if c['credentialId'] else 'shared-legacy')
            row['healthy'] = False
            row['process'] = 'unknown'
            try:
                self.installation.owned(self.installation.svdir/cm.service(c['id']), s)
                row['pid'] = self.installation.backend.pid(self.installation.svdir/cm.service(c['id']))
                row['process'] = 'running'
                health = self.installation.backend.tunnel_ready(self.root, s, c['id'])
                row.update(health)
                row['healthy'] = True
            except (Fault, OSError, ValueError) as e:
                row['error'] = e.value['code'] if isinstance(e, Fault) else type(e).__name__
                if row['error'] == 'SERVICE_DOWN': row['process'] = 'stopped'
            rows.append(row)
        return {'connections': rows, 'recoveryPending': self.journal.exists()}

    def _new_credential(self, c, config):
        old = c['credentialId']
        if old:
            config['credentials'][old]['state'] = 'revoked'
        ident = 'cred_' + uuid.uuid4().hex
        c['credentialId'] = ident
        secret = secrets.token_urlsafe(48).encode()
        atomic_write(self.credential_file(c), secret)
        config['credentials'][ident] = {'principal': 'owner', 'tokenHash': digest(secret),
                                       'state': 'active' if c['enabled'] else 'disabled'}

    def _profile(self, c, config):
        directory, name, health = cm.paths(self.root, c['id'])
        file = directory/(name+'.yaml')
        data = private_file(file)
        require(c['profileDigest'] == '0'*64 or digest(data) == c['profileDigest'], 'TUNNEL_PROFILE_CHANGED')
        profile = json.loads(data)
        secret = private_file(self.credential_file(c)).strip()
        if c['credentialId']:
            require(config['credentials'][c['credentialId']]['tokenHash'] == digest(secret), 'LOCAL_CREDENTIAL_MISMATCH')
        else:
            require(config['principals']['owner']['tokenHash'] == digest(secret), 'LOCAL_CREDENTIAL_MISMATCH')
        # Keep raw connector.secret compatible. file: resolves the complete header value.
        header = (self.root/'tunnel-env/MCP_AUTHORIZATION' if c['id'] == 'legacy'
                  else self.root/'connections'/c['id']/'MCP_AUTHORIZATION')
        mcp = profile['mcp']
        for field in ('extra_headers', 'discovery_extra_headers'):
            headers = mcp.setdefault(field, {})
            for key in list(headers):
                if key.lower() == 'authorization': del headers[key]
            if not headers: mcp.pop(field)
        field = 'extra_headers' if c['authMode'] == 'tunnel' else 'discovery_extra_headers'
        mcp.setdefault(field, {})['Authorization'] = 'file:' + str(header)
        c['profileDigest'] = digest(canonical(profile))
        return {str(file.relative_to(self.root)): profile}, header, b'Bearer ' + secret

    def change(self, action, name=None, *, tunnel_id=None, key_file=None, mode=None, new_name=None):
        i = self.installation
        with i.lock():
            i.backend.preflight()
            i.recover()
            self.recover_locked()
            cm.compatible(self.root, self.root/'active')
            # Never install new auth records against an old running controller.
            require((self.root/'active/src/tdev/connections.py').is_file(), 'CONNECTION_VERSION',
                    'Update tdev before managing connections')
            s = copy.deepcopy(self.settings())
            before = private_file(self.root/'config.json')
            config = json.loads(before)
            require('owner' in config['principals'], 'PRINCIPAL_NOT_FOUND', 'Existing owner principal is required')
            s['connections'] = copy.deepcopy(cm.entries(s))
            if 'connections' not in self.settings() and 'legacy' in s['connections']:
                d = i.svdir/'tdev-tunnel'
                s['connections']['legacy']['enabled'] = not (d.exists() and i.backend.wanted_down(d))
            config['connectionFormat'] = 1
            config.setdefault('credentials', {})
            removed = None
            profiles = {}
            headers = {}
            cleanup = []
            if action == 'migrate':
                changed = []
            elif action == 'add':
                require(name and re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9_-]{0,47}', name), 'CONNECTION_NAME')
                require(tunnel_id and re.fullmatch(r'tunnel_[a-z0-9]{32}', tunnel_id), 'TUNNEL_ID_REQUIRED')
                require(all(c['name'] != name and c['tunnelId'] != tunnel_id for c in s['connections'].values()), 'CONNECTION_DUPLICATE')
                require(mode in ('tunnel','bearer'), 'CONNECTOR_AUTH')
                key = private_file(key_file).strip()
                require(key and len(key) <= 4096 and not any(x in key for x in (b'\n',b'\r',b'\0')), 'TUNNEL_KEY_REQUIRED')
                ident = 'conn_' + uuid.uuid4().hex
                c = {'id':ident,'name':name,'tunnelId':tunnel_id,'enabled':True,'authMode':mode,
                     'credentialId':None,'profileDigest':'0'*64}
                s['connections'][ident] = c
                base = self.root/'connections'/ident
                # Installation-owned copy. Removing it never revokes an upstream key or touches its source.
                atomic_write(base/'runtime.secret', key)
                directory, profile, health = cm.paths(self.root, ident)
                atomic_write(directory/(profile+'.yaml'), canonical({
                    'config_version':1,
                    'control_plane':{'base_url':'https://api.openai.com','tunnel_id':tunnel_id,
                                     'api_key':'file:'+str(base/'runtime.secret')},
                    'health':{'listen_addr':'127.0.0.1:0','url_file':str(health)},
                    'admin_ui':{'open_browser':False},'log':{'level':'info','format':'json'},
                    'mcp':{'server_urls':[{'channel':'main','url':f"http://127.0.0.1:{s['port']}/mcp"}]}}))
                self._new_credential(c, config)
                changed = [ident]
            else:
                c = cm.select(s, name)
                ident = c['id']
                changed = [ident]
                old_secret = self.credential_file(c)
                if action in ('enable', 'mode', 'rotate'):
                    directory, profile, _ = cm.paths(self.root, ident)
                    require(digest(private_file(directory/(profile+'.yaml'))) == c['profileDigest'], 'TUNNEL_PROFILE_CHANGED')
                if action == 'mode':
                    require(mode in ('tunnel','bearer'), 'CONNECTOR_AUTH'); c['authMode'] = mode
                elif action == 'rename':
                    require(new_name and re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9_-]{0,47}',new_name), 'CONNECTION_NAME')
                    require(all(other['id']==ident or other['name']!=new_name for other in s['connections'].values()), 'CONNECTION_DUPLICATE')
                    c['name'] = new_name
                    changed = []
                elif action in ('enable','disable','revoke','remove'):
                    if action == 'revoke':
                        require(c['credentialId'], 'SHARED_CREDENTIAL', 'Legacy token is shared; rotate this connection to a dedicated token first')
                    c['enabled'] = action == 'enable'
                    if c['credentialId']:
                        cred = config['credentials'][c['credentialId']]
                        if action == 'enable': require(cred['state'] != 'revoked', 'CREDENTIAL_REVOKED', 'Rotate before enabling')
                        if cred['state'] != 'revoked':
                            cred['state'] = 'revoked' if action in ('revoke','remove') else ('active' if c['enabled'] else 'disabled')
                    if action == 'remove':
                        removed = s['connections'].pop(ident)
                elif action == 'rotate':
                    self._new_credential(c, config)
                    if old_secret != self.root/'connector.secret': cleanup.append(str(old_secret.relative_to(self.root)))
                else:
                    raise Fault('CONNECTION_ACTION')
            for ident in changed:
                if ident in s['connections']:
                    c = s['connections'][ident]
                    # Enabling/disabling a legacy mode must not rewrite its profile unnecessarily.
                    if action in ('add','mode','rotate'):
                        files, header, _ = self._profile(c, config)
                        profiles.update(files)
                        # Journal contains references/hashes, never secret bytes.
                        headers[str(header.relative_to(self.root))] = str(self.credential_file(c).relative_to(self.root))
            cm.entries(s)
            self._write_intent(s, config, before, changed, profiles, headers, removed, cleanup)
            self.recover_locked()
            return self.observe(None if action in ('remove','migrate') else c['id'])

    def _write_intent(self, settings, config, before, changed, profiles, headers, removed, cleanup):
        atomic_write(self.journal, canonical({'id':uuid.uuid4().hex,'settings':settings,
            'settingsBefore':digest(private_file(self.root/'resident.json')),
            'config':config,'configBefore':digest(before),'changed':changed,'profiles':profiles,
            'headers':headers,'removed':removed,'cleanup':cleanup}))

    def recover_locked(self):
        if not self.journal.exists(): return
        i = self.installation
        j = json.loads(private_file(self.journal))
        s = j['settings']
        cm.entries(s)
        current = private_file(self.root/'resident.json')
        require(digest(current) in (j['settingsBefore'],digest(canonical(s))), 'CONNECTION_CONFIG_CHANGED')
        with open(self.root/'config.lock','a+b') as lock:
            fcntl.flock(lock,fcntl.LOCK_EX)
            current = private_file(self.root/'config.json')
            require(digest(current) in (j['configBefore'],digest(canonical(j['config']))), 'CONFIG_CHANGED')
            # Revoke first. Recovery always finishes intent; never resurrect an old credential.
            atomic_write(self.root/'config.json', canonical(j['config']))
        for ident in j['changed']:
            d = i.svdir/cm.service(ident)
            if d.exists():
                i.owned(d, s)
                i.backend.down(d)
        for file, secret_file in j['headers'].items():
            atomic_write(self.root/file,b'Bearer '+private_file(self.root/secret_file).strip())
        for file, profile in j['profiles'].items(): atomic_write(self.root/file,canonical(profile))
        atomic_write(self.root/'resident.json',canonical(s))
        templates(self.root,s)
        removed = j['removed']
        if removed:
            d = i.svdir/cm.service(removed['id'])
            if d.exists():
                backup = self.root/'service-backups'/j['id']/d.name
                backup.parent.mkdir(parents=True,exist_ok=True,mode=0o700)
                i.backend.remove(d,backup)
        for ident in j['changed']:
            if ident in cm.entries(s):
                c = cm.entries(s)[ident]
                i.write_service(cm.service(ident),s)
                if c['enabled']:
                    require(not i.backend.wanted_down(i.svdir/'tdev'), 'CONTROLLER_DOWN')
                    i.backend.up(i.svdir/cm.service(ident))
        for file in j['cleanup']: (self.root/file).unlink(missing_ok=True)
        if removed and removed['id'] != 'legacy':
            directory = self.root/'connections'/removed['id']
            if directory.exists(): shutil.rmtree(directory)
        self.journal.unlink()
        sync(self.root)

    def token(self, name):
        # Explicit local operator delivery only; never return token bytes in receipts.
        with self.installation.lock():
            require(not self.journal.exists(), 'CONNECTION_RECOVERY_REQUIRED')
            c = cm.select(self.settings(),name)
            config = json.loads(private_file(self.root/'config.json'))
            if c['credentialId']:
                require(config['credentials'][c['credentialId']]['state'] != 'revoked', 'CREDENTIAL_REVOKED')
                expected = config['credentials'][c['credentialId']]['tokenHash']
            else: expected = config['principals']['owner']['tokenHash']
            token = private_file(self.credential_file(c)).strip()
            require(digest(token)==expected,'LOCAL_CREDENTIAL_MISMATCH')
            from .installer_setup import deliver_token
            return deliver_token(token,self.credential_file(c))
