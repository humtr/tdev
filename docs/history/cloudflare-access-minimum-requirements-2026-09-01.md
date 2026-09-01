# Cloudflare Access minimum-requirements prework snapshot

Status: non-normative prework, recorded 2026-09-01.

This document records only the minimum conditions for considering Cloudflare
Access in front of a future tdev ingress. It is not an implementation plan,
accepted Design, deployment ticket, provider mutation authorization, or change
to any current security or routing contract. Current authority continues to
come from `RULE.md`, `SDD.md`, the accepted Designs, and their owning documents.

## Scope

- The candidate boundary is one exact tdev Cloudflare Worker hostname or path.
- The boundary does not include tmcp Operations, tmcp Shared, their bearer
  tokens, or any other repository or service.
- No Zero Trust tenant, Access application, policy, identity provider, service
  token, Worker configuration, route, secret, or deployment is created by this
  record.
- Current D0039/D0041 qualification and physical-device work is unchanged.

## Admission requirements

Before implementation, an accepted Class-2 Design must identify the exact
security and deployment owners being changed. It must resolve every open item
below and update the canonical owner documents before provider mutation.

Cloudflare Zero Trust Free may be considered only while the intended deployment
fits its then-current published limits. As of this record, Cloudflare publishes
the Free plan as USD 0 with a 50-user limit. Pricing, user limits, log retention,
support, and required features must be checked again at activation time; this
snapshot is not durable product authority.

## Minimum boundary

1. Select the exact account, Worker, environment, hostname, and optional path
   from fresh provider readback. Do not use an account-wide or unrelated-host
   wildcard.
2. Inventory every caller of the selected ingress before policy creation.
   Browser users and non-browser clients are separate client classes.
3. Keep any qualification, verifier, provider-control, callback, or machine API
   route outside the Access application unless an accepted Design explicitly
   admits that route and defines its compatible credential flow.
4. Default-deny the selected boundary. Admit only an explicit authorized
   identity or tightly bounded identity group. Do not use an `Everyone`, broad
   email-domain, network-location, device hint, or bypass rule as identity.
5. Define the identity provider, subject identity, MFA expectation, session
   duration, reauthentication behavior, revocation procedure, and recovery
   principal. Shared browser or Cloudflare accounts are not individual identity.
6. A non-browser caller must have an explicitly designed machine flow. It must
   not depend on browser cookies. A Cloudflare Access service token is optional,
   not implied, and must be independently scoped, stored, rotated, and revoked
   if admitted.
7. Access is an outer ingress gate only. It must not replace tdev tenant, Case,
   command, Agent, provider, or effect authorization, and Access identity must
   not be treated as a Task capability or product fence.
8. Keep credentials and secret values out of Git, documentation, command-line
   arguments, logs, evidence payloads, and model-visible context. Use the
   admitted provider/operator secret boundary.

## Activation evidence

An authorized implementation must preserve an exact pre-change provider
snapshot and then independently verify all of the following on the selected
hostname/path:

- unauthenticated access is denied before the Worker application receives the
  protected request;
- the intended human identity is admitted;
- a different identity is denied;
- expiration, logout, or revocation removes access within the accepted policy;
- each required non-browser client either succeeds through its separately
  admitted flow or remains deliberately outside the Access boundary;
- unrelated hostnames, paths, Workers, routes, and current qualification
  identities are unchanged;
- provider readback matches the reviewed Access application and policy; and
- existing tdev authorization checks still execute and fail closed behind the
  outer gate.

The rollback contract must identify only the newly admitted Access application,
policies, and credentials. Rollback removes or disables those exact resources
and verifies the prior provider/route state; it does not recreate a Worker,
change a tdev deployment, or alter unrelated Cloudflare resources.

## Unresolved inputs

- exact Zero Trust account and authorized individual identity;
- identity provider and MFA/recovery policy;
- exact Worker hostname/path and route inventory;
- browser session and reauthentication duration;
- required non-browser clients and whether any service token is necessary;
- compatibility with the current deployed Worker and qualification routes; and
- activation, observation, and rollback principals.

No implementation may infer these values from this document.

## Provider references

- Cloudflare Zero Trust plans:
  <https://www.cloudflare.com/plans/zero-trust-services/>
- Protect a Worker with Cloudflare Access:
  <https://developers.cloudflare.com/workers/configuration/cloudflare-access/>
- Access application types and hostname/path scope:
  <https://developers.cloudflare.com/cloudflare-one/access-controls/applications/choose-application-type/>
