# Cloudflare Access-backed self-hosted MCP OAuth idea

Status: non-normative idea snapshot, recorded 2026-09-01.

Repository change classification: SDD Class 0 documentation only. This file is
history/provenance material. It is not a product contract, accepted Design,
implementation plan, deployment instruction, provider authorization, security
approval, or evidence that any described mechanism works.

This idea does not change `docs/MCP.md`, `docs/SECURITY.md`,
`docs/DEPLOYMENT.md`, D0023, D0024, D0027, or any maintained Design. It does not
amend the separate
`docs/history/cloudflare-access-minimum-requirements-2026-09-01.md` prework
snapshot. Before implementation, the responsible current owners must freshly
validate the external protocols, select an accepted design, and define exact
deployment and rollback authority.

## Question explored

Could a future tdev MCP endpoint avoid an Auth0-like hosted OAuth provider while
retaining a strong OAuth boundary by combining:

- Cloudflare Access for human authentication and MFA; and
- a narrowly scoped tdev Worker component for the MCP OAuth authorization-code
  and token protocol?

The candidate answer is **possibly**, if the Worker remains a fixed-purpose
protocol broker rather than becoming a general identity provider. Cloudflare
Access would authenticate the human. The broker would issue and consume only
the OAuth artifacts needed by one admitted tdev MCP resource and one admitted
ChatGPT client profile.

This is a hypothesis for later Design work, not a selected product direction.

## Candidate boundary

```text
ChatGPT
  -> public OAuth/MCP metadata
  -> /authorize -> Cloudflare Access human authentication
  -> /token     -> one-time code + PKCE + client authentication
  -> /mcp       -> bounded access-token validation
```

The candidate path split is:

- `/.well-known/oauth-protected-resource` and authorization-server metadata are
  public discovery documents containing no credential;
- `/authorize` alone uses the browser-compatible Cloudflare Access identity
  gate;
- `/token` does not depend on an Access browser cookie and accepts only the
  exact admitted authorization-code exchange;
- `/mcp` does not depend on an Access browser cookie and requires the broker's
  resource-bound bearer token; and
- local-Agent WebSocket and D0027 management/data-plane authentication remain
  outside this candidate OAuth owner.

Cloudflare Access is therefore only the upstream human authenticator in this
idea. It does not become tdev tenant, Case, command, Task, Agent, provider,
effect, deployment, or semantic authority.

## Candidate minimization choices

The smallest security-oriented profile appears to be:

1. one exact HTTPS issuer and one exact MCP resource;
2. one fixed, freshly verified ChatGPT CIMD client identity rather than a
   dynamic client-registration endpoint;
3. exact redirect-URI allowlisting with no wildcard;
4. authorization-code flow with PKCE `S256` only;
5. exact propagation and validation of the OAuth `resource` value;
6. one fixed bounded scope set selected later by the responsible MCP/security
   owners;
7. short-lived, cryptographically random authorization codes whose hashes are
   stored and atomically consumed once;
8. opaque random access tokens whose hashes and authorization context are held
   by one bounded state owner;
9. no refresh token in the first candidate; and
10. no password database, login UI, MFA implementation, generic OAuth client
    registry, federation catalog, or reusable authorization-server product.

Opaque access tokens are only a candidate simplification. For one colocated
authorization/resource server they could avoid JWT signing-key and JWKS
lifecycle code, permit immediate revocation, and keep claims server-side. A
later accepted Design must compare this with signed self-contained tokens under
the selected Cloudflare topology, availability target, storage owner, and
revocation requirement.

## Candidate transaction binding

An authorization code would be unguessable, short-lived, stored only as a hash,
and atomically consumed. Its record would bind at least:

- the authenticated Access subject and exact Access application audience;
- client identity;
- redirect URI;
- PKCE challenge and method;
- exact MCP resource;
- granted scopes;
- issuance and expiry; and
- one-time consumption state.

The token exchange would reject missing, duplicate, changed, expired, already
consumed, or over-bound input before token creation. Response loss after code
consumption would not authorize replay; the client would restart authorization.

An opaque access-token record would bind the resolved subject, issuer, resource,
scopes, issuance, expiry and revocation state. Every MCP invocation would check
that record before command admission. Token possession would authenticate only
the admitted MCP caller context and would not imply Case access, Task
capability, Agent identity, management authority, or effect permission.

## Threats that later work must falsify

- arbitrary CIMD URL fetching, redirect following, DNS rebinding or SSRF;
- redirect-URI wildcard, prefix or normalization confusion;
- authorization response issuer mix-up;
- missing or changed `resource` between authorization, token and MCP requests;
- authorization-code interception, replay or concurrent double consumption;
- wrong PKCE verifier or a method other than `S256`;
- client-assertion replay, wrong audience, stale key or untrusted JWKS;
- forged, stale, wrong-audience or wrong-subject Access identity;
- login CSRF, unsolicited authorization, scope escalation and consent confusion;
- bearer-token disclosure through logs, URLs, errors, evidence or model-visible
  content;
- token replay after expiry or revocation;
- duplicate form/JSON members, oversized input and parser ambiguity;
- state-owner loss, partial write, response loss and ambiguous consumption;
- rate-limit bypass and unbounded token/code accumulation; and
- an OAuth success path that bypasses existing tdev tenant, Case, command or
  Task admission checks.

## Security tradeoff hypothesis

Using an established OAuth provider reduces protocol-implementation and
operational risk. A constrained Access-backed broker could instead reduce the
number of privileged control planes and avoid adding another hosted identity
tenant. That reduction is meaningful only if the broker stays substantially
smaller than a general OAuth server and receives adversarial protocol review.

Cloudflare account compromise is already a critical tdev Worker/deployment
failure domain; adding an external OAuth provider would not by itself protect a
Worker that an attacker can replace. Conversely, a custom broker introduces
implementation defects that a mature provider may already defend against. No
universal security ordering is claimed by this note.

## Evidence needed before selection

A later Class-2 Design would need, at minimum:

- fresh ChatGPT/MCP OAuth compatibility requirements and exact callback/client
  observations;
- fresh Cloudflare Access identity, path-policy and Worker integration facts;
- an exact state owner and atomic code/token lifecycle;
- parser, redirect, PKCE, issuer, resource, scope, replay, expiry and revocation
  negative tests;
- login, unlink, reauthorization and MCP reconnect behavior through a currently
  supported ChatGPT client;
- provider configuration, secret handling, key/material rotation and recovery;
- rate, payload, retention and audit bounds;
- tenant/Case denial proving zero semantic effect; and
- deployment migration and exact rollback barriers.

Until those owners and gates are accepted and executed, this remains only a
dated idea. It authorizes no source, runtime, provider, route, identity, secret,
MCP registration, or Cloudflare mutation.

## External references to revalidate

- OpenAI plugin MCP authentication:
  <https://developers.openai.com/plugins/build/auth>
- Cloudflare Access Worker protection:
  <https://developers.cloudflare.com/workers/configuration/cloudflare-access/>
- MCP authorization specification:
  <https://modelcontextprotocol.io/specification/latest/basic/authorization>
