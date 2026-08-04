# tdev Workboard

## Current

- Product/source stage: M0 schema, pure-domain foundation, repository governance, and the complete first-release product specification are source-verified; no installation, Cloudflare, Agent, public MCP, client, or release layer is claimed.
- Current work: no active implementation.
- Next product gate: accept a separate M1 CaseDO storage and public-control design; M1 implementation is not authorized by this workboard.
- Normative owner map: [AGENTS.md](AGENTS.md#2-normative-authority-map)
- Design registry: [docs/design/README.md](docs/design/README.md)

## Active design

- None. [Design 0002 — Complete First-Release Product Specification](docs/design/0002-complete-first-release-product-specification.md) is `verified` and remains in the design registry.

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
