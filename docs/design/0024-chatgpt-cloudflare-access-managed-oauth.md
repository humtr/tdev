# Design 0024 - ChatGPT-compatible Cloudflare Access Managed OAuth

- Status: `accepted`
- Revision: 1
- Class: 2
- Decision date: 2026-09-03
- Acceptance base: `development@2b99f09280a06ab52a8ea04934afc3ae3d538f4e`
- Trigger: the P1 development-unit source slice now has a bounded owner path, so a public ChatGPT MCP client needs one explicit authentication, resource-binding and tenant-isolation contract before provider configuration or endpoint exposure
- Acceptance evidence: `docs/evidence/group-f-d0024-r1-chatgpt-access-managed-oauth-acceptance-2026-09-03.json`
- Scope: the external MCP caller identity and authorization boundary for the first supported public tdev MCP path, with Cloudflare Access Managed OAuth as the selected provider candidate
- Affected owners: `docs/MCP.md`, `docs/SECURITY.md`, `docs/QUALIFICATION.md`, `docs/development/PROGRAM.md`, the MCP Worker authentication adapter and its deployment manifest
- Preserved owners: D0019 remains Case/Task/Attempt/result/Promotion authority; D0020/D0027 remain local-Agent delivery and credential authorities; D0023 owns the versioned MCP surface; D0025 owns Git publication; provider configuration and live external identity remain qualification evidence, not product truth
- Explicit non-goals: no custom OAuth broker in this revision; no service-token replacement for an interactive ChatGPT client; no Agent credential forwarding; no authentication-derived Case readiness; no provider deployment, client support or final-MVP completion claim

## 1. One-line definition

Authenticate a supported web ChatGPT MCP client with OAuth 2.1 authorization-code + PKCE through Cloudflare Access Managed OAuth, bind the token to the exact MCP resource and issuer, map it to one verified tenant/principal, and fail closed before any tdev owner call when discovery, token, policy or tenant evidence is missing or ambiguous.

## 2. Why this is Class 2

The authentication mechanism, OAuth discovery/resource identity, client-registration mode, principal/tenant mapping, credential separation and revocation behavior define the public trust boundary. A bearer-header wrapper or provider-specific shortcut could grant cross-tenant Case access or leak the local Agent credential. `SDD.md` therefore requires an accepted Design before source or Cloudflare configuration changes.

## 3. Facts, external evidence, inference and unknowns

Repository facts at acceptance:

- D0023 defines a public HTTPS Streamable HTTP MCP resource at `/mcp` and requires authenticated principal/tenant context outside the semantic command.
- `docs/MCP.md` separates MCP authentication from Case capability admission and forbids MCP-owned readiness, delivery, claim and canonical-tree state.
- D0020/D0027 own the local Agent route and credential; the web caller must not receive or present that credential.
- The source P1 runner has only source/local composition evidence; no public MCP endpoint or OAuth verifier is currently deployed from this route.

External engineering evidence used for the decision is the current Cloudflare documentation for remote MCP authorization, Access Managed OAuth and MCP authorization/resource metadata, together with the current OpenAI MCP connection guidance. Those sources describe HTTPS Streamable HTTP, OAuth 2.1 discovery/resource binding and Access's managed token-to-assertion boundary; they do not prove this repository's deployment or ChatGPT compatibility.

Inference: using the provider-managed authorization-code flow is the smallest first experiment because it avoids storing a long-lived ChatGPT bearer secret in the Worker while retaining Access policy, refresh and revocation controls. The inference must be falsified by the deployed current-client qualification matrix below.

Unknowns that remain explicit: the exact ChatGPT client registration mode accepted at qualification time (pre-registration, dynamic registration or client metadata document), the final Access issuer/resource URLs, the JWT claim used for the tenant key, policy/API propagation delay, and whether the current client preserves refresh/reconnect state through the selected Access flow.

## 4. Selected authentication profile

The versioned profile is:

```
tdev.mcp.auth.cloudflare-access-managed-oauth.v1
```

The deployment manifest must contain one immutable instance of this profile with these fields:

```
mcpResource                  // exact HTTPS origin + /mcp, RFC 8707 resource
authorizationServerIssuer    // exact issuer URL, no trailing-slash aliasing
accessApplicationAudience    // exact Access application audience/tag
jwksUri                      // issuer-published key set, bound by issuer metadata
principalClaim               // explicit verified JWT claim mapped to principal
tenantClaim                  // explicit verified JWT claim or account-map key
clientRegistrationMode       // pre_registered | dynamic | client_metadata
allowedRedirectUris           // exact client-registered values, if applicable
requiredPkceMethod           // S256
tokenHeaderMode              // Access-managed opaque token -> edge JWT assertion
profileDigest                // release-bound digest of all values above
```

No field is selected from a request. The Worker refuses to start or serve protected tools if any field is absent, duplicated, malformed or inconsistent with the read-back discovery metadata. A provider default, account name, workers.dev hostname or remembered issuer never substitutes for an exact manifest value.

## 5. Discovery and resource binding

The public MCP origin exposes protected-resource metadata at the standards-defined well-known location. Its `resource` value is exactly `mcpResource`, and its authorization-server list contains exactly `authorizationServerIssuer`. The authorization-server metadata read by the client must advertise the same issuer, authorization-code endpoints, supported PKCE `S256`, token endpoint and the selected registration mode. If the current client requires a different well-known location or registration contract, that mismatch is a qualification falsifier; it is not repaired by accepting an unbound issuer or by routing through an undocumented proxy.

Every authorization request carries the exact resource value required by the selected client/provider contract. The token exchange and MCP request are accepted only when the resulting token is intended for `mcpResource` and the verified issuer/audience tuple equals the manifest. A token valid at another Access application, a token with a different resource indicator, an issuer alias or a caller-supplied audience is denied before owner access.

## 6. Token and principal verification

The Worker is deployed behind Cloudflare Access Managed OAuth. The external client presents its opaque access token to the protected MCP origin; the Access boundary resolves policy and supplies the provider assertion header to the origin. The Worker:

1. rejects a missing, duplicated or malformed authorization/assertion header;
2. validates the signed assertion using the issuer-bound JWKS and accepted algorithm/key set;
3. checks `iss`, exact Access audience, `exp`, `nbf`/`iat` bounds, token type and any required nonce/client binding exposed by the selected flow;
4. maps only the explicitly configured verified claims to a stable principal and tenant account;
5. authorizes that principal for the requested Case/context/Artifact before invoking D0023 owners.

The Worker never trusts a request-body principal/tenant, an unverified email, an arbitrary `Cf-Access-Jwt-Assertion` copied by the caller, a hostname, a Case ID or a D0020 fencing/claim token. Access-edge and Worker logs redact opaque tokens, assertions, authorization codes, refresh tokens and sensitive claim values. Signature/JWKS rotation is handled by issuer metadata and bounded key refresh; an unavailable or conflicting key set fails closed.

The local Agent credential, D0020 route identity, delivery fence and operation capability are separate. The MCP Worker sends only the owner-approved command envelope to the Agent route and never includes the web access token, Access assertion, refresh token or provider secret in that envelope.

## 7. Registration, refresh and policy lifecycle

Before provider mutation, one `clientRegistrationMode` must be selected from the manifest and proven with the current supported ChatGPT client:

- `pre_registered`: the provider/client redirect URI and client identity are configured out of band, and the Worker stores no client secret;
- `dynamic`: registration is enabled only when the provider and client both support the documented registration endpoint and the server bounds metadata/redirect values;
- `client_metadata`: the client identity document is fetched over HTTPS and its redirect set is exact and immutable for the qualification run.

An unproven or mixed registration mode is rejected. Authorization-code exchange requires PKCE `S256`; state and nonce are single-use and bound to the transaction. Refresh is accepted only through the issuer's documented token endpoint and is re-evaluated by Access policy. Revocation, user disablement, tenant removal, issuer/audience/key rotation and expired/early tokens must deny the next owner call with zero semantic mutation. The Worker does not cache an authorization decision beyond the bounded token validity required by the provider contract.

## 8. Tenant/Case authorization and failure behavior

Tenant membership is resolved from the verified identity to an authoritative account map or Case ACL owner. A caller cannot select a tenant by argument. Cross-tenant reads, mutations, context references, candidate metadata and promotion projections return the same bounded denial class and do not create a Case, drive record, Task, Attempt or event. A missing ACL or account-map entry fails closed.

Authentication failures, discovery mismatch, resource mismatch, issuer/audience mismatch, unsupported registration, invalid PKCE, revoked/expired token, JWKS unavailability and provider-policy uncertainty are security denials or `not_authenticated`; they are never a Case failure. An accepted owner call whose HTTP response is lost follows D0023 request-identity replay and `reconciling` semantics. A token refresh or reconnect cannot create a second request identity.

## 9. Deployment, migration and rollback barrier

The protected route is one public HTTPS MCP origin with Access in front and D0023's `/mcp` handler behind it. The Worker may read only release-bound non-secret profile metadata and the minimum provider verification material; it has no ambient shell, Git, local-Agent or arbitrary provider credentials. A production configuration records the exact Access application, route, resource, issuer, audience, client-registration mode, policy revision, JWKS observation and Worker version.

Changing resource, issuer, audience, claim mapping, registration mode, policy meaning or token-header interpretation is a new auth-generation manifest. Existing clients/Cases are not silently reinterpreted. Rollback is allowed only to a previously qualified generation with the same resource/issuer/audience semantics, known policy compatibility and a read-back proving no token or tenant mapping crosses generations. If that barrier is unavailable, keep the new generation fail-closed and recover forward.

## 10. Acceptance matrix and cheapest falsifiers

| Area | Required result | Proof layer |
| --- | --- | --- |
| discovery | protected-resource and authorization-server metadata agree on exact resource, issuer, endpoints and PKCE | source + provider + current client |
| client registration | one documented registration mode completes with the current supported ChatGPT client and exact redirect binding | provider + current client |
| positive auth | authorized client reaches `initialize`, `tools/list` and one bounded read through D0023 | provider + current client |
| resource/token | wrong issuer, audience, resource, signature, algorithm, key, time bound or duplicate header is rejected pre-owner | source + provider |
| tenant isolation | tenant A cannot read/mutate tenant B Case/context/Artifact; semantic write set is zero | source + provider + current client |
| lifecycle | refresh, logout/revocation, policy disablement, key rotation and reconnect are fail-closed and do not duplicate a request | provider + current client |
| separation | web token/assertion never reaches D0020 Agent credentials or operation input | source + runtime |
| response loss | the same request ID replays the owner receipt; timeout remains `reconciling` | source + current client |
| secrets/observability | no token/code/assertion/secret appears in Worker, Access or qualification logs | provider + runtime |
| rollback | exact previous auth generation can be read back or forward recovery remains fail-closed | provider |

Cheapest decisive falsifiers are: a caller-supplied header or claim authorizes a tool; a token for another Access application reaches an owner; tenant B data is projected to tenant A; refresh/revocation leaves an old authorization usable; ChatGPT requires a registration/resource contract the profile cannot satisfy; or any web credential is forwarded to the local Agent. Each falsifier reopens this Design's affected meaning and blocks dependent deployment rather than adding a compatibility bypass.

## 11. Rejected alternatives

### Static shared bearer token for ChatGPT

Rejected. It lacks user/tenant identity, refresh and revocation semantics and would turn a single leaked value into unrestricted MCP authority.

### Trust a caller-provided Access assertion or email header

Rejected. Only the protected edge and issuer-bound signature verification can establish the identity; request data is never an authority source.

### Use the local Agent credential as the MCP credential

Rejected. It collapses user authentication and machine delivery authority and would allow a web client to impersonate D0020/D0027.

### Build a custom OAuth broker immediately

Rejected for Revision 1. It adds a second token/identity owner before a concrete Cloudflare/client compatibility falsifier exists. A later Design may select one if the current path fails with evidence.

### Use a service token for the interactive ChatGPT path

Rejected as the primary path. Service tokens remain a separately authenticated headless/operator mechanism and cannot substitute for user-bound OAuth tenant authorization.

## 12. Follow-on gates

This Design authorizes implementation of a strict auth-profile parser, metadata/issuer/resource verifier, redacted denial/replay tests and an isolated Cloudflare adapter harness. It does not claim a deployed Access application, a public MCP URL, ChatGPT support, Termux execution, Git publication or D0045 comparison. D0023 source qualification must compose with this profile before provider mutation; D0026/D0027/D0039 provide deployment/local-Agent evidence, and D0045 remains a later additive comparison gate.
