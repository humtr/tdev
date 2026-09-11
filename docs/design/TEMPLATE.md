# Dxxxx - Short descriptive title

- Design: `Dxxxx`
- Title: `Short descriptive title`
- Status: `draft`
- Depends-On: `[]`
- Supersedes: `[]`
- Directive: `r1`
- Owns: `one-bounded-decision-label`

## Problem

State one bounded material decision and why existing accepted owners do not already own it.

## Required outcome

State the observable end state derived from the Directive.

## Facts / assumptions / unknowns

Separate observations, selected assumptions and unverified measurements/deployment values. Do not leave a required semantic choice unspecified.

## Decision

Select the smallest architecture/contract. Name owned truth, identities, transitions, dependencies, limits and linearization points when relevant. Explain why necessary abstractions cannot be removed without losing an invariant.

## Concurrency and isolation

Define independent progress and only the exact conflicting serialization boundaries; capacity policy is not identity.

## Failure and recovery

Define retries, cancellation, restart, response loss, uncertainty, deduplication and bounded cleanup where relevant.

## Security / external effects

Define authorization and external-effect boundaries, or explain why none exists.

## Alternatives

Compare serious alternatives against the requirement, not against predecessor convenience.

## Acceptance

Give cheap falsifiers and required verification layers/evidence. Accepted is not verified.

## Implementation consequences

State affected contracts and consequences. Put work assignments, order and status only in WORKBOARD.
