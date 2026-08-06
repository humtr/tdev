# security and trust boundaries

- Plan inputs, claims, and results are untrusted until validated.
- ChangeSet paths must be relative, normalized, and traversal-free.
- Ordinary Tasks cannot claim canonical or remote mutation resources.
- The executor does not receive a mutable canonical tree reference.
- Credentials and secrets are outside the MVP input, result, event, snapshot, and demo surfaces.
- No unrestricted shell, environment forwarding, filesystem access, or network fallback exists.
- Result digests bind duplicate acceptance; Attempt IDs fence stale executors.
- An interrupted result-only Attempt is never rewritten as success.

Future GitHub, Termux, and Cloudflare adapters require explicit identity, permission, credential broker, redaction, cancellation, deadline, and reconciliation contracts in this owner and the applicable design record.
