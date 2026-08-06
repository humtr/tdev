# executor operations

## Executor contract

The runner injects one executor function:

```text
execute({ caseId, planRevisionId, task, attempt, acceptedResults })
  -> Promise<ChangeSet>
```

The executor receives immutable values and returns an isolated result. It cannot receive or mutate the canonical tree owner.

## Admission and completion

The runner asks the engine for ready Tasks, admits stable Task IDs while capacity and claims permit, and starts one Attempt per admitted Task. Completion is accepted only for the exact running Attempt ID.

- same Attempt and same result digest: idempotent duplicate
- same Attempt and different digest: conflict
- cancelled, interrupted, failed, or unknown Attempt: stale result rejection
- executor rejection: Attempt and Task fail; dependent work is not admitted
- result validation failure: the still-running Attempt and Task fail with the contract error
- executor completion after a terminal Attempt decision: reject the late outcome and preserve the terminal decision

## Promotion operation

Promotion is an internal deterministic executor. It consumes accepted isolated results from its declared dependencies. It is not delegated to a general executor and is the sole canonical writer.

## External effects

The MVP executor contract is result-only. Git, process, network, filesystem, deployment, and other non-idempotent effects require a future accepted operation contract with explicit reconciliation and cannot be smuggled into this interface.
