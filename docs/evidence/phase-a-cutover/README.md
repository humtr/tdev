# Phase A cutover evidence (in progress)

This directory is the durable Phase A/Phase B handoff, not a production release
claim. Current state: native/edge implementation and tests joined; provider cutover
has not yet been accepted. Do not ask the user to Refresh on this provisional state.

Fresh start: dev-2 commit ae522036feb03a82dd79df2789cf71df6f48ab32,
parent 2bf2b2310f2434676c1e85db2701461c386e5ed8, tree
72fdaaf140e73b43bcc8f03d8f1f1e219d7a83fd. Directive r3 selects D0001-D0007.
The user selected the four tool annotations and same-origin cutover priority.

Source work uses authorized tmcp project-local shell and GitHub/provider bootstrap
because no usable dev-2 runtime was initially active. Committed dev-2 preparation,
application and output projection primitives were selectively reviewed/adapted from
d41235d07dbfa4393ca8889b1c4d9565061af922; old compact-record incompatibilities were
corrected rather than merging its obsolete topology. No new reasoning model was
launched. Independently user-started peer coordination was not treated as authority.

Current implementation: frozen full four-tool input/output schemas and metadata;
native Git/context/objects/SQLite/admission/candidate/prepare/observe; real Worker,
routing-only DO, outbound native device transport and nonce/reconnect/chunk bounds;
Access human assertion verification at both edge and native control; explicit
principal-specific installation grants; immutable bundles and runit bootstrap.
Hosted execution and qualified activation are explicitly unavailable/unsealed.

A real native test fixture executes test-only validation processes and Git CAS.
That is not a production hosted receipt. Fixed installation-key readback is not
human OAuth proof. The first refreshed ChatGPT request must rebind live context,
read authority/WORKBOARD/this evidence and observe runtime/open work.

The final evidence will replace this provisional status with exact deployment,
installation/schema identities, current capabilities, dependencies, blockers,
measured test outcomes and the Phase B first-action sequence.
