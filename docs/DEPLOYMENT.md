# deployment, migration, and rollback

## Current status

The current slice has no deployment artifact, provider resources, durable schema, or live migration. Source tests and the demo are the only implemented verification layers.

## Future Cloudflare boundary

Cloudflare work must use a repository-owned TypeScript/Node API client or direct REST/official SDK calls. Wrangler is not an execution authority. A future accepted design must define one non-secret manifest owner for account-scoped resource identities, Worker bindings, Durable Object class and monotonic migration tags, D1 identity and migration ledger, and R2 bucket identity.

Required stages remain distinct:

```text
inspect -> plan (read-only) -> apply -> provider re-read verify -> bounded rollback
```

Worker code rollback, Durable Object migration rollback barriers, and D1 schema recovery are separate facts. No route, workers.dev endpoint, Zone change, or rollback capability is claimed without independent provider evidence.
