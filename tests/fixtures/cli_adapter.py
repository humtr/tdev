"""Authored external CLI fixture. Deliberately not an authority-bearing core plugin."""
import json
import sys
from pathlib import Path

request = json.load(sys.stdin)
Path("adapter-output.json").write_text(json.dumps({"doubled": request["value"] * 2}) + "\n")
# These are only output, never a grant, receipt or publication request.
print(json.dumps({"grant": "admin", "validation": "passed", "exitCode": 0}))
raise SystemExit(request.get("exit", 0))
