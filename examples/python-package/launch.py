"""Invoke with pinned python -I -S -B; never fall back to host site-packages."""
import runpy
import sys
from pathlib import Path

if not sys.flags.isolated or not sys.flags.no_site:
    raise RuntimeError('Launch requires python -I -S')
sys.dont_write_bytecode = True
root = Path(__file__).resolve().parent
# Under -I -S the initial path contains only this interpreter's standard library.
# No site.addsitedir(): .pth files cannot import code or add unpinned host roots.
sys.path[:0] = [str(root / 'python'), str(root)]
runpy.run_path(str(root / 'app.py'), run_name='__main__')
