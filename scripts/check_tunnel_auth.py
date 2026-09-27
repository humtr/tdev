"""Pinned real tunnel-client + generated profiles + real tdev, with a local mock control plane.

No OpenAI account calls, production config, credentials or services are used.
Run explicitly with --binary /path/to/tunnel-client after ordinary deterministic tests.
"""
import argparse
import datetime
import http.client
import json
import os
from pathlib import Path
import queue
import subprocess
import tempfile
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from tdev import admin
from tdev.common import atomic_write, canonical
from tdev.core import Controller
from tdev.installer import configure
from tdev.server import META, VERSION, make_server


def exercise(binary, mode):
    with tempfile.TemporaryDirectory(prefix='tdev-tunnel-auth-') as temp:
        root = Path(temp)
        (root/'bin').mkdir(); (root/'bin/tunnel-client').symlink_to(binary)
        admin.init_config(root)
        secret = (root/'connector.secret').read_text()
        runtime_key = 'fixture-runtime-key-separate-from-local-service'
        atomic_write(root/'runtime.key',runtime_key.encode())
        controller = Controller(root/'state',json.loads((root/'config.json').read_bytes()))
        server = make_server(controller)
        local, sent = [], []
        original = server.RequestHandlerClass
        class Observed(original):
            def ingress(self):
                local.append((self.headers.get('Mcp-Method'), self.headers.get('Authorization')))
                return super().ingress()
            def send(self,status,value=None,**kwargs):
                sent.append((self.headers.get('Mcp-Method'),status))
                return super().send(status,value,**kwargs)
        server.RequestHandlerClass = Observed
        pending, responses, upstream = queue.Queue(), {}, []
        lock = threading.Lock()
        class ControlPlane(BaseHTTPRequestHandler):
            def log_message(self,*args): pass
            def reply(self,value):
                data=canonical(value)
                self.send_response(200); self.send_header('Content-Type','application/json')
                self.send_header('Content-Length',str(len(data))); self.end_headers()
                try: self.wfile.write(data)
                except BrokenPipeError: pass  # Fixture shutdown can interrupt an empty poll.
            def do_GET(self):
                upstream.append(dict(self.headers))
                assert self.headers.get('Authorization')=='Bearer '+runtime_key
                if not self.path.split('?',1)[0].endswith('/poll'):
                    self.reply({'id':'tunnel_'+'a'*32})
                    return
                try: command=pending.get(timeout=.1)
                except queue.Empty: command=None
                self.reply({'commands':[command] if command else []})
            def do_POST(self):
                data=self.rfile.read(int(self.headers.get('Content-Length','0')))
                upstream.append({'headers':dict(self.headers),'body':data.decode()})
                assert self.headers.get('Authorization')=='Bearer '+runtime_key
                value=json.loads(data)
                with lock: responses[value['request_id']]=value
                self.reply({})
        cp=ThreadingHTTPServer(('127.0.0.1',0),ControlPlane); cp.daemon_threads=True
        threads=[threading.Thread(target=s.serve_forever,daemon=True) for s in (server,cp)]
        for t in threads: t.start()
        profile=root/'input-profile.yaml'
        atomic_write(profile,canonical({'control_plane':{'base_url':f'http://127.0.0.1:{cp.server_port}'}}))
        configure(root,port=server.server_port,tunnel_id='tunnel_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',key_file=root/'runtime.key',
                  profile_file=profile,auth_mode=mode)
        logfile=root/'client.log'
        proc=None
        try:
            # Redirected output is checked for either secret; no human terminal receives it.
            env={k:os.environ[k] for k in ('PATH','PREFIX','TMPDIR','LD_LIBRARY_PATH','SSL_CERT_FILE') if k in os.environ}
            env['HOME']=str(root)
            with logfile.open('wb') as log:
                proc=subprocess.Popen([str(binary),'run','--profile-dir',str(root/'tunnel-profiles'),
                                       '--profile','tdev'],env=env,cwd=root,stdin=subprocess.DEVNULL,stdout=log,stderr=log)
            def rpc(ident,method='tools/list',auth=None):
                params={'_meta':{META+'protocolVersion':VERSION,META+'clientCapabilities':{}}}
                headers={'Mcp-Protocol-Version':[VERSION],'Mcp-Method':[method]}
                if method=='tools/call':
                    params.update(name='tdev_project',arguments={'action':'list'})
                    headers['Mcp-Name']=['tdev_project']
                if auth is not None: headers['authorization']=[auth]
                pending.put({'request_id':ident,'shard_token':'fixture-shard','command_type':'jsonrpc',
                             'channel':'main','created_at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'headers':headers,
                             'jsonrpc':{'jsonrpc':'2.0','id':ident,'method':method,'params':params}})
                until=time.monotonic()+20
                while time.monotonic()<until:
                    assert proc.poll() is None, 'tunnel-client exited: '+logfile.read_text().replace(secret,'<local>').replace(runtime_key,'<runtime>')[-2500:]
                    with lock: response=responses.get(ident)
                    if response is not None: return response
                    time.sleep(.05)
                raise AssertionError('Timed out awaiting fixture tunnel response: '+ident+' '+logfile.read_text().replace(secret,'<local>').replace(runtime_key,'<runtime>')[-5000:])
            no_auth=rpc('missing')
            assert no_auth['resp_code']==(200 if mode=='tunnel' else 401),no_auth['resp_code']
            wrong=rpc('wrong',auth='Bearer incorrect')
            assert wrong['resp_code']==401,wrong['resp_code']
            good=rpc('good',auth='Bearer '+secret)
            assert good['resp_code']==200 and len(good['resp_json']['result']['tools'])==12
            called=rpc('call',method='tools/call',auth=None if mode=='tunnel' else 'Bearer '+secret)
            assert called['resp_code']==200 and called['resp_json']['result']['structuredContent']['ok']
            # Startup discovery is separate from the explicitly queued calls below.
            assert any(method=='server/discover' and auth=='Bearer '+secret for method,auth in local), 'missing authenticated startup discovery'
            assert ('server/discover',200) in sent, 'startup discovery did not complete'
            # Direct localhost is still independently protected, including Host and Origin checks.
            def direct(auth,extra=None):
                c=http.client.HTTPConnection('127.0.0.1',server.server_port,timeout=5)
                headers={'Content-Type':'application/json',**(extra or {})}
                if auth is not None: headers['Authorization']=auth
                c.request('POST','/mcp',b'{}',headers); r=c.getresponse(); r.read(); c.close(); return r.status
            assert direct(None)==401 and direct('Bearer incorrect')==401
            assert direct('Bearer '+secret,{'Host':'evil.invalid'})==403
            assert direct('Bearer '+secret,{'Origin':'https://evil.invalid'})==403
            assert controller.authenticate(secret)=='owner'
            # Only control-plane credentials reach the mock upstream; local auth is never reflected.
            assert secret not in json.dumps(upstream)
            assert all(runtime_key not in str(auth) for _,auth in local)
            return {'mode':mode,'tools':12,'call':True,'startupProbeAuthenticated':True,
                    'missingHostBearerStatus':no_auth['resp_code'],'wrongHostBearerStatus':wrong['resp_code'],
                    'localhostAuthAndOriginChecks':True,'upstreamLocalSecretAbsent':True}
        finally:
            if proc is not None:
                proc.terminate()
                try: proc.wait(timeout=8)
                except subprocess.TimeoutExpired: proc.kill(); proc.wait()
            for s in (server,cp): s.shutdown(); s.server_close()
            for t in threads: t.join(timeout=3)
            controller.close()
            if logfile.exists():
                log=logfile.read_bytes()
                assert secret.encode() not in log and runtime_key.encode() not in log, 'credential leaked into ordinary tunnel log'


def main():
    p=argparse.ArgumentParser(description=__doc__); p.add_argument('--binary',required=True)
    binary=Path(p.parse_args().binary).resolve()
    version=admin._tunnel_version(binary)
    print(json.dumps({'version':version,'cases':[exercise(binary,m) for m in ('tunnel','bearer')],
                      'boundary':'Real pinned client, local mock control plane; not live ChatGPT acceptance'},indent=2))


if __name__=='__main__': main()
