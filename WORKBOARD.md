# tdev Workboard

## Current

- Product/source stage: M0 schema, pure-domain foundation, and repository governance are source-verified; no installation, Cloudflare, Agent, public MCP, client, or release layer is claimed.
- Current work: complete the first-release product specification and requirement traceability under Design 0002; no runtime milestone is being implemented.
- Next product gate: verify Design 0002, then accept a separate M1 CaseDO storage and public-control design; M1 implementation is not authorized by this workboard.
- Normative owner map: [AGENTS.md](AGENTS.md#2-normative-authority-map)
- Design registry: [docs/design/README.md](docs/design/README.md)

## Active design

- [Design 0002 — Complete First-Release Product Specification](docs/design/0002-complete-first-release-product-specification.md): `implementing`
  - Next gate: complete the requirement catalog and traceability, run deterministic verification, review the full diff, and publish the exact commit.

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
