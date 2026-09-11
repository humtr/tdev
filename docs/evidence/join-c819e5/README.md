# Early executable P1-P8 join and actual contention observation

Source work began at 2807644416d776e58be43bb45ae8a1187e933d28. The published
P1/P2/P3/P4 foundation is 0a7e20d128c932a3f2c4ea6b6a544e3f1d705c42. Selected
complementary P5/P6/P7/P8 modules from the peer clean-root candidate
 d41235d07dbfa4393ca8889b1c4d9565061af922 were joined without reverting hardened
P1/P2, copying predecessor systems, or replacing current authority with peer notes.

Actual native tests now exercise authenticated TCP HTTP discovery/read/change,
required full-source profiles, exact frozen Git commit and expected-ref integration,
authoritative terminal observation, malformed item isolation, validation failure,
request replay, stale conflict and auth revocation. Nine runtime/HTTP checks passed.
Six more native recovery checks passed: effect response loss without second send or
validation, stopped/sender uncertainty, real SQLite reopen with owner-epoch adoption,
original capability reauthorization, expired action reconciliation and prevention
of a concurrent resume while the old in-process action still executes.

Work.candidate remains a compact immutable reference. Hydration verifies its
manifest. Authorized resume operates on the original action, effect and attempt;
its control request is independently idempotent and does not invent a second
work identity. Terminal action observation uses actual incrementing revision state.
These transitions are now reflected in D0001/D0002/D0003 instead of hidden adapters.

The actual initial eight-work same-ref workload completed all eight exact changes
in 50,224 ms, with 36 full validation runs (72 actual profile child processes),
peak eight live profile processes, and 19 attempted conditional ref sends. This is
4.5 validations per successful work and motivates a bounded D0003 optimization.
It is a single internal contention observation, not median/p95 evidence against
current tdev/tmcp, not actual ChatGPT usage and not production container isolation.
The real full-tree validation and final bytes are never waived to improve timing.

Canonical core has passed 90 tests and type/document checks on pinned Node 24.21.0;
all-source canonical core/integration validation is rerun for the final joined tree.
Runtime handoff is implemented separately on tmcp/dev2-p8-handoff-c819e5 and is
joined next. Canonical host installation, rootless container release validation,
private readiness/control wiring and actual ChatGPT app connection remain distinct.
Bootstrap uses tmcp/Git because no usable canonical dev-2 deployment exists yet.
