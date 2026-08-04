# tdev WORKBOARD Template

> Template only. Delete unused sections. Do not treat this file as current state or product authority.

```markdown
# tdev Workboard

## Current

- Product/source stage: `<M# and verified layer>`
- Current source gate: `<short result or not yet verified>`
- Next gate: `<design or acceptance gate>`
- Normative owner map: [AGENTS.md](AGENTS.md#2-normative-authority-map)
- Design registry: [docs/design/README.md](docs/design/README.md)

## Active design

- [`<ID>` — `<title>`](docs/design/<record>.md): `<draft|accepted|implementing|blocked>`
  - Next gate: `<one concise gate>`

## Blocking unknowns

- `<unknown>` — owner: `<design section or normative document>`

## Routing

- Product: [docs/SPEC.md](docs/SPEC.md)
- Architecture: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
- Protocol: [docs/PROTOCOL.md](docs/PROTOCOL.md)
- Operations: [docs/OPERATIONS.md](docs/OPERATIONS.md)
- Security: [docs/SECURITY.md](docs/SECURITY.md)
- Deployment: [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)
- Milestones and verification: [docs/MVP.md](docs/MVP.md)
```

Do not add completed-history lists, copied acceptance criteria, raw logs, job IDs, or speculative backlogs. Put durable decisions in owners/design records and provenance in Git.
