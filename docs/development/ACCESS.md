# tdev self-development access model

> Supporting development contract under `docs/development/WORKFLOW.md`. This file separates the health/reachability of a development plane from the capabilities exposed to the current ChatGPT/Codex session. It does not define product runtime authority.

## 1. Why this distinction exists

A Termux checkout, tmcp route, ngrok/SSH transport, GitHub repository, or other development plane can be healthy while the current agent session lacks the tool/permission needed to use it.

Therefore do not infer plane failure from current-session tool absence.

Use separate observations:

```text
Plane health:                healthy / unhealthy / unknown
Route/service health:        healthy / unhealthy / unknown
Current-session capability:  available / unavailable / unknown
Observed Git identity:       <ref @ sha> / unobserved
```

Examples:

- Termux and tmcp may be healthy while the current ChatGPT session has no `tmcp` tool attached.
- GitHub may be healthy and readable while a local shell has no network route to it.
- A ChatGPT container may contain a valid Git mirror while lacking credentials to publish it.

These are different facts and must be reported separately.

## 2. Session-capability rule

The governing rule is:

> **Plane health is not the same fact as current-session access.**

If a plane is believed healthy but the current session cannot invoke it, record the plane as `UNOBSERVED` from that session unless an independent fresh observation proves its current state. Do not relabel the plane itself as broken solely because the required tool is not attached.

Recommended record:

```text
Termux plane health:         healthy / unhealthy / unknown
Termux route health:         healthy / unhealthy / unknown
Current agent local access:  available / unavailable / unknown
Reason:                      tmcp tool attached / not attached / auth denied / route failure / other
Termux Git head:             <ref @ sha> / last-observed <ref @ sha> / unobserved
GitHub access:               available / unavailable / unknown
GitHub published head:       <ref @ sha> / unobserved
Relationship:                equal / ancestor / descendant / diverged / unobserved
Reconciliation debt:         <exact follow-up or none>
```

A `last-observed` identity is historical evidence, not a claim about the current live head.

## 3. Work-continuation rule

Missing current-session access does not automatically block development.

1. Attempt synchronization/observation using the tools actually available to the current session.
2. If one plane cannot be invoked, state whether the cause is plane/route failure or merely current-session capability absence.
3. Continue on another plane when the requested gate is executable there without inventing local/provider evidence.
4. Preserve exact ancestry and reconciliation debt.
5. When a session with the missing capability becomes available, re-observe the plane before applying the debt.

This refines the `UNOBSERVED` and `BLOCKED` states in `WORKFLOW.md`:

- `UNOBSERVED` may mean the plane is healthy but inaccessible to this session.
- `BLOCKED` applies only when the requested gate truly requires a capability available on no usable plane.

## 4. Termux/tmcp example

For the tdev development environment, tmcp/ngrok/SSH is a transport path to the Termux execution plane. The route and the current ChatGPT session are separate layers:

```text
Termux filesystem/process/Git plane
        ^
        |
localhost SSH / tmcp / ngrok transport
        ^
        |
current ChatGPT/Codex session tool attachment
```

A healthy lower layer does not guarantee the upper session exposes a matching invocation tool. Conversely, lack of a session tool does not prove the lower route or Termux is unhealthy.

When tmcp is available to the current session, prefer direct observation and safe reconciliation (`fetch -> ancestry check -> ff-only` where applicable). When tmcp is not exposed, leave Termux as `UNOBSERVED` or `last-observed`, proceed on GitHub/agent-capable work if safe, and reconcile in a later capable session.

## 5. Evidence discipline

Never conflate:

- user report that a plane/route is healthy;
- fresh agent observation of that plane;
- last observed Git identity from an earlier session;
- current GitHub ref observation;
- current-session tool inventory.

Reports should label each source explicitly. User-reported health can justify not diagnosing a Termux failure, but it does not by itself update the local Git SHA. A current-session tool inventory can prove the agent lacks a capability, but it does not prove the external plane is unhealthy.
