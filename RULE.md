# implementation guardrails

1. Do not guess repository-specific facts. Confirm them in owners, code, configuration, CI or runtime evidence; otherwise keep `unknown`.
2. One durable fact or contract has one authoritative owner. Derived forms require a deterministic transform or mismatch check.
3. Do not hide behavior across unrelated flags, maps, timers or caches. Use one explicit state model and transitions.
4. Fix the responsible boundary instead of adding an undocumented wrapper, fallback or parallel owner.
5. Do not convert missing, damaged, unsupported, failed or uncertain states into success defaults.
6. Make lifecycle ownership explicit: creation, start, cancellation, completion, recovery and cleanup.
7. Define concurrency in terms of admission, execution, isolated result acceptance and canonical commit.
8. Tests use barriers, controlled promises or public outcomes; timeout is only a deadlock guard.
9. A check proves only its observed layer. Skipped, unsupported or unexecuted layers remain `unknown`.
10. Review the effective diff and mechanize recurring invariants with tests where practical.
11. Development checkpoint progression follows `LINEAGE.md`; the current routing instance comes only from `WORKBOARD.md`. Stable rules must not duplicate a current branch, Group, Design or remote head.
12. Handoffs, chat summaries, project prompts, generated indexes and historical reports are continuity or derived material, not current authority. Rebind them against the bootstrap owners before dependent mutation.
13. Preserve completed checkpoints and historical evidence. Correct inherited defects forward on the active cumulative lineage unless an explicit operational rollback is separately authorized, safe and required.
