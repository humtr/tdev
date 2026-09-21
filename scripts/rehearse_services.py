"""Real isolated runit graph: install/update/crash recovery/down/uninstall, no live graph effects."""
import json
import os
import shutil
import signal
import socket
import subprocess
import sys
import tempfile
import time
from pathlib import Path

from tdev.admin import stage, init_config
from tdev.common import Fault, atomic_write, canonical, digest, require
from tdev.installer import configure
from tdev.resident import Installation, Runit, command, process, retry


def main():
    with tempfile.TemporaryDirectory(prefix='tdev-service-rehearsal-') as tmp:
        parent = Path(tmp)
        prefix, root = parent / 'prefix', parent / 'install'
        svdir = prefix / 'var/service'; svdir.mkdir(parents=True)
        (prefix / 'bin').mkdir()
        daemon = prefix / 'bin/service-daemon'
        shutil.copyfile(shutil.which('service-daemon'), daemon); daemon.chmod(0o700)
        for name in ('runsvdir', 'runsv', 'sv', 'setsid'):
            (prefix / 'bin' / name).symlink_to(shutil.which(name))
        # Native Tunnel process fixture: real supervised process, no provider calls or credentials.
        (root / 'bin').mkdir(parents=True); root.chmod(0o700)
        binary = root / 'bin/tunnel-client'
        binary.write_text('#!' + sys.executable + '\nimport json,sys,time\n'
                          'if "--version" in sys.argv: print("0.0.14")\n'
                          'elif "health" in sys.argv: print(json.dumps({"result":"ok","control_plane_poll":{"ok":True}}))\n'
                          'else: time.sleep(600)\n'); binary.chmod(0o700)
        bundle = stage(root, Path(__file__).resolve().parents[1])['bundle']; init_config(root)
        key = parent / 'key'; atomic_write(key, b'fixture-key')
        with socket.socket() as sock:
            sock.bind(('127.0.0.1', 0)); port = sock.getsockname()[1]
        configure(root, port, tunnel_id='tunnel_fixture', key_file=key)
        env = {**os.environ, 'PREFIX': str(prefix), 'SVDIR': str(svdir), 'SERVICE_DAEMON_MONITOR_INTERVAL_SECONDS': '1'}
        def daemon_call(action):
            p = subprocess.run([str(daemon), action],env=env,capture_output=True,timeout=25)
            if p.returncode: raise RuntimeError(p.stdout.decode()+p.stderr.decode())
            return p.stdout.decode()
        class FixtureRunit(Runit):
            def preflight(self):
                daemon_call('status')
                return {'svdir':str(self.svdir),'recoveryMonitor':True}
            def tunnel_ready(self, root, settings):
                pid=self.pid(self.svdir / 'tdev-tunnel'); p=process(pid)
                require(p and str(binary) in p['argv'], 'TUNNEL_STARTING')
                return {'pid':pid,'mode':'fixture','controlPlanePoll':False}
        backend=FixtureRunit(svdir); i=Installation(root,backend)
        daemon_call('start')
        try:
            i.install(bundle); initial=i.check()
            for name in ('tdev','tdev-tunnel'):
                old=backend.pid(svdir / name); os.kill(old,signal.SIGKILL)
                def restarted():
                    assert backend.pid(svdir / name)!=old
                until=time.monotonic()+20
                while True:
                    try: restarted(); break
                    except Exception:
                        if time.monotonic()>until: raise
                        time.sleep(.1)
            retry(i.check)
            i.install(bundle); retry(i.check)
            backend.down(svdir / 'tdev-tunnel')
            old_root=int((prefix / 'var/run/service-daemon.pid').read_text())
            os.kill(old_root,signal.SIGKILL)
            until=time.monotonic()+25
            while True:
                try:
                    current=int((prefix / 'var/run/service-daemon.pid').read_text())
                    assert current!=old_root
                    daemon_call('status'); break
                except Exception:
                    if time.monotonic()>until: raise
                    time.sleep(.2)
            checked=retry(i.check)
            assert checked['services']['tdev-tunnel']['desired']=='down'
            i.uninstall()
            assert not (svdir / 'tdev').exists() and not (svdir / 'tdev-tunnel').exists()
            assert (root / 'config.json').exists() and (root / 'state/state.sqlite').exists()
            print(json.dumps({'isolatedRealRunit':True,'installUpdate':True,'controllerCrashRecovery':True,
                              'tunnelProcessCrashRecovery':True,'rootMonitorRecovery':True,'intentionalDownPreserved':True,
                              'uninstall':True,'liveServicesTouched':False,'tunnelProvider':'fixture'},indent=2))
        finally:
            daemon_call('stop')


if __name__=='__main__': main()
