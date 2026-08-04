# tdev Workboard

## Current

- Product/source stage: M0 schema, pure-domain foundation, and repository governance are source-verified; no installation, Cloudflare, Agent, public MCP, client, or release layer is claimed.
- Current work: no active implementation; the next change must begin with an accepted M1 design.
- Next product gate: an accepted M1 CaseDO storage and public-control design; M1 implementation is not authorized by this workboard.
- Normative owner map: [AGENTS.md](AGENTS.md#2-normative-authority-map)
- Design registry: [docs/design/README.md](docs/design/README.md)

## Active design

- None. [Design 0001 — Repository Governance and M0 Hardening](docs/design/0001-repository-governance-and-m0-hardening.md) is `verified` and remains in the design registry.

## Blocking unknowns

- M1 ingress and domain decoding: raw duplicate JSON member names must be rejected before decoding, and generated Go `oneOf` wire values require an accepted validated-discriminator design before canonical storage use.

## Routing

- Product: [docs/SPEC.md](docs/SPEC.md)
- Architecture: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
- Protocol: [docs/PROTOCOL.md](docs/PROTOCOL.md)
- Operations: [docs/OPERATIONS.md](docs/OPERATIONS.md)
- Security: [docs/SECURITY.md](docs/SECURITY.md)
- Deployment: [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)
- Milestones and verification: [docs/MVP.md](docs/MVP.md)
