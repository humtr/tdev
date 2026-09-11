# P8 release handoff implementation

The activation owner now has durable phase and rollback-direction state, exact
active-pointer replacement, idempotent response-loss recovery, prior-release
rollback, a fixed systemd unit adapter and immutable terminal retention. D0006
was clarified before dependent code: expiry never substitutes for stopped proof,
rollback intent precedes restore effects, and a read-only observation does not
restart the broker. No second queue or recovery ledger was introduced.

The native tests use actual filesystem fsync/rename, inherited-descriptor flock,
mutual exclusion, helper SIGKILL and reopening. Service processes/readiness are
fixtures. Systemd command/ownership/cgroup parsing is tested against declared
responses and disposable files, not a deployed service. Missing cgroup evidence
remains uncertain; only confirmed inactive PID-zero plus empty/absent group can
report stopped. Failed startup/readiness restores only the exact original release.
An already-running exact candidate after a lost start response is adopted without
duplicate start or unnecessary rollback.

The installed Linux user service, immutable release artifact staging, private
readiness/control channel and MCP special-operation wiring still require the
canonical installation composition and real release-environment validation. Core
and native tests do not establish J3 installation or live self-development.
Bootstrap uses authorized tmcp project-local shell because dev-2 is not installed;
no service was deployed, credential changed, or predecessor runtime mutated.
