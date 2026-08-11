# implementation guardrails

1. Do not guess repository-specific facts. Confirm them in owners, code, configuration, CI, or runtime evidence; otherwise keep `unknown`.
2. One durable fact or contract has one authoritative owner. Derived forms require a deterministic transform or mismatch check.
3. Do not hide behavior across unrelated flags, maps, timers, or caches. Use one explicit state model and transitions.
4. Fix the responsible boundary instead of adding an undocumented wrapper, fallback, or parallel owner.
5. Do not convert missing, damaged, unsupported, failed, or uncertain states into success defaults.
6. Make lifecycle ownership explicit: creation, start, cancellation, completion, recovery, and cleanup.
7. Define concurrency in terms of admission, execution, isolated result acceptance, and canonical commit.
8. Tests use barriers, controlled promises, or public outcomes; timeout is only a deadlock guard.
9. A check proves only its observed layer. Skipped, unsupported, or unexecuted layers remain `unknown`.
10. Review the effective diff and mechanize recurring invariants with tests where practical.
11. Branch progression follows its self-development owner. For post-D0015 work, follow `docs/development/BRANCH_LINEAGE.md`: exactly one cumulative `group/*` branch is active, completed Group refs are retained checkpoints, each successor is created only from the exact final accepted predecessor head, and later Group work is not merged or fast-forwarded back into the retained `mvp-1a-7` baseline. Historical `mvp-*` branch rules remain evidence context only.
