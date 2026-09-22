# Retained pure-Python package example

This small project qualifies a package layout. Its finite command is a launch test, not an
HTTP service or a deployed application. Copy these files into an enrolled project, run
`python make_recipe.py` there, and include the generated `tdev-package.json` in source validation.
It records the current native Python/shell executable hashes, OS/architecture/ABI and selected
loaded system-library hashes. Generate it on the selected build/runtime host; never regenerate
requirements silently during start or rollback.

The recipe downloads one public wheel pinned by filename, final HTTPS URL and SHA-256.
`requirements.lock` pins the same version/hash. `build.py` installs it into a fresh `dist/python`
with pip's no-index, no-deps, hash-checking, binary-only and no-bytecode options. It keeps the
selected wheel in tdev's retained inputs. This example has no transitive dependencies; larger
projects must enumerate their complete selected wheel closure. Pip and its own Python modules
remain build-host tooling, not vendored runtime dependencies or fully attested build inputs.

The runtime command is `python -I -S -B launch.py` from `dist`. The launcher requires those
isolation flags, adds only its own `python` directory and app directory to the interpreter's
standard-library path, and does not process `.pth` files. Do not remove these flags or substitute
`PYTHONPATH` with host site-packages. Build scripts and recipes are normal editable project
source; arbitrary recipe commands are not automatically given this Python import discipline.

Generated console-script wrappers under `dist/python/bin` are deliberately removed. They can
embed interpreter/build paths and do not establish artifact-local import lookup. For a CLI,
call its module or load its distribution entrypoint from an artifact-relative launcher; the
fixture tests exercise package data and console-entrypoint metadata this way. Do not copy a
live venv. Packages requiring `.pth` hooks, editable installation, native extension compatibility
or special shebang behaviour need their own qualification.

`app.py` imports the retained dependency, reads a generated asset, and writes a result under
`TDEV_DATA_DIR`. HOME, TMP, data and logs belong outside sealed files; bytecode is disabled.
Python's standard library and the OS remain host requirements. Selected library hashes are
not a claim that every possible future `dlopen`, standard-library file or OS resource is pinned.

`tdev_artifact inspect` reports current `runtimeCompatibility` for service recipes separately
from byte integrity. A missing/changed host tool or pinned runtime file is an incompatibility;
inspection and scratch retirement still work. Restore the specifically required host runtime,
or prepare and validate a new package for the changed host. Application rollback cannot restore
an updated interpreter or OS, and no read/start path may reinstall dependencies to conceal it.

From the tdev checkout, `PYTHONPATH=src:.tdev-deps python scripts/rehearse_python_package.py`
runs an opt-in disposable test with the real public wheel. It builds twice, reports actual
content-hash equality, removes development/build roots, relocates the package, runs it using
retained inputs and checks unchanged bytes. It never registers a service or changes the resident
installation. Deterministic tests use a source-pinned fixture wheel and need no registry access.
For packaged-service qualification, `PYTHONPATH=src:.tdev-deps python
scripts/rehearse_artifact_deployments.py` uses this dependency layout with an HTTP app and an
exported policy check. It exercises actual artifact validation, update/rollback, controller
reconnect, supervisor crash recovery and failed-switch restoration in its own temporary runit
graph. Source/build/validation scratch is retired before release; removal preserves data.
This opt-in rehearsal needs public wheel access and local runit commands. It does not register
services in the shared Termux graph or update the resident tdev installation. The finite
`app.py` above remains a layout probe; service validation requires a foreground HTTP app.

References: [pip install options](https://pip.pypa.io/en/stable/cli/pip_install/) and
[Python isolated/no-site options](https://docs.python.org/3/using/cmdline.html).
