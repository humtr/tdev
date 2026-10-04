"""Isolated provider executable and real Git transport, without domain imports."""
import json
import os
from pathlib import Path
import shutil
import sys


class GithubFixture:
    def __init__(self, runtime):
        self.runtime = runtime
        runtime.stop()
        self.root = runtime.root / 'provider'
        self.root.mkdir(mode=0o700)
        self.state_file = self.root / 'provider.json'
        self.trace = self.root / 'calls.jsonl'
        self.marker = self.root / 'gap'
        self.release = self.root / 'release'
        self.done = self.root / 'done'
        self.state = {'owner_type': 'Organization', 'login': 'Example', 'auth': 0,
            'get_status': 200, 'post_status': 201, 'post_reply': 'normal',
            'repository': {'id': 1234, 'full_name': 'Example/Repo', 'default_branch': 'main',
                           'private': True, 'permissions': {'push': True, 'admin': False}}}
        self.save()
        script = self.root / 'gh'
        script.write_text('#!' + sys.executable + '\n' +
            'import json, os, sys, time\nfrom pathlib import Path\n' +
            f'root=Path({str(self.root)!r})\n' +
            'state=json.loads((root/"provider.json").read_text()); args=sys.argv[1:]\n' +
            'assert args[0] == "api", args\n' +
            'endpoint=next((a for a in args[1:] if a.startswith(("users/","repos/","orgs/","user/repos")) or a == "user"), None)\n' +
            'assert endpoint is not None, args\n' +
            'post="POST" in args; payload=json.load(sys.stdin) if post else None\n' +
            'with (root/"calls.jsonl").open("a") as f: f.write(json.dumps({"kind":"api","args":args,"endpoint":endpoint,"post":post,"payload":payload,"credential":bool(os.getenv("GH_TOKEN"))})+"\\n")\n' +
            'status=state["auth"] or (state["post_status"] if post else state["get_status"] if endpoint.startswith("repos/") else 200)\n' +
            'data=state["repository"] if endpoint.startswith("repos/") or post else {"login":state.get("user_login",state["login"]) if endpoint == "user" else state["login"],"type":state["owner_type"]}\n' +
            'gap=state.get("gap"); blocked=(gap == "post" and post) or (gap == "get" and endpoint.startswith("repos/"))\n' +
            'if blocked and not (root/"gap").exists():\n' +
            ' (root/"gap").write_text(str(os.getpid()))\n' +
            ' end=time.monotonic()+20\n' +
            ' while not (root/"release").exists() and time.monotonic()<end: time.sleep(.02)\n' +
            ' (root/"done").touch()\n' +
            'if post and state["post_reply"] == "lost":\n' +
            ' print("provider disconnected", file=sys.stderr); sys.exit(1)\n' +
            'if "--include" in args: print("HTTP/2.0 "+str(status)+" Fixture\\nContent-Type: application/json\\n")\n' +
            'if post and state["post_reply"] == "malformed": print("invalid json")\n' +
            'else: print(json.dumps(data))\n' +
            'if status >= 400: print("HTTP "+str(status), file=sys.stderr); sys.exit(1)\n')
        script.chmod(0o700)
        real_git = shutil.which('git')
        script = self.root / 'git'
        script.write_text('#!' + sys.executable + '\n' +
            'import json, os, subprocess, sys, time\nfrom pathlib import Path\n' +
            f'root=Path({str(self.root)!r}); real={real_git!r}; remote={str(runtime.remote)!r}\n' +
            'args=sys.argv[1:]; transport=any(a.startswith("https://github.com/") for a in args)\n' +
            'with (root/"calls.jsonl").open("a") as f: f.write(json.dumps({"kind":"git","args":args,"transport":transport,"credential":bool(os.getenv("GH_TOKEN"))})+"\\n")\n' +
            'if transport:\n' +
            ' assert "ls-remote" in args or "fetch" in args or ("push" in args and any(a.startswith("--force-with-lease=refs/heads/managed/") for a in args) and any(a.startswith(":refs/heads/managed/") for a in args)), args\n' +
            ' args=[remote if a.startswith("https://github.com/") else a for a in args]\n' +
            ' state=json.loads((root/"provider.json").read_text())\n' +
            ' if state.get("transport_failure"):\n' +
            '  print("helper rejected "+os.getenv("GH_TOKEN",""), file=sys.stderr); sys.exit(129)\n' +
            ' if "push" in args:\n' +
            '  if state.get("git_race"):\n' +
            '   branch=next(a[1:] for a in args if a.startswith(":refs/heads/"))\n' +
            '   subprocess.check_call([real,"--git-dir="+remote,"update-ref",branch,state["git_race"]])\n' +
            '  gap=state.get("git_gap"); code=None\n' +
            '  if gap == "after-delete": code=subprocess.call([real,*args])\n' +
            '  if gap in ("before-delete","after-delete") and not (root/"gap").exists():\n' +
            '   (root/"gap").write_text(str(os.getpid()))\n' +
            '   end=time.monotonic()+20\n' +
            '   while not (root/"release").exists() and time.monotonic()<end: time.sleep(.02)\n' +
            '   (root/"done").touch()\n' +
            '  if gap == "before-delete": sys.exit(129)\n' +
            '  if code is not None: sys.exit(code)\n' +
            'os.execv(real, [real, *args])\n')
        script.chmod(0o700)
        runtime.launch_environment.update(PATH=str(self.root) + os.pathsep + os.environ['PATH'],
            GH_TOKEN='fixture-controller-secret', GH_DEBUG='api', GIT_TRACE='1',
            GH_HOST='evil.invalid')
        runtime.config['projectPolicies'] = {'cloud': {'kind': 'github', 'owner': 'Example',
            'allowCreate': True, 'managedRefNamespace': 'refs/heads/managed/',
            'validation': 'test -f a.txt', 'validationTimeoutSeconds': 21}}
        runtime.config['principals']['alice']['projectPolicies'] = ['cloud']
        runtime.save_config()
        runtime.start()

    def save(self):
        staged = self.root / 'provider.next'
        staged.write_text(json.dumps(self.state))
        staged.replace(self.state_file)

    def calls(self):
        return [json.loads(line) for line in self.trace.read_text().splitlines()] if self.trace.exists() else []

    def posts(self):
        return [call for call in self.calls() if call.get('post')]
