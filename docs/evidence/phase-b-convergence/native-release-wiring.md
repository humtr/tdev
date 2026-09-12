# Native public release composition handoff

Local candidate continuation: [production enrollment/Builder/native-main handoff](local-production-release-handoff.md).
It implements the source joins described below on a separate local branch; these
historical live scope IDs do not establish its canonical integration or commissioning.

Current native release composition owner:4e93425c92bfe9779a84f379d2799d0a.
Fixed helper/runtime admission owner:d094b54dd6f208cd9ab34a126002218b.
Production enrollment/native builder owner:0a263131c50fa39c7402d7183fe736c2.
These are live scopes, not claims of integration, deployment or production PASS.

`src/runtime/release.mjs` composes the existing ReleaseBackend, artifact store and
fixed NativeReleaseControl. It receives a verified production Builder from the
installed managed producer; no caller flag, qualification record or source commit
selects this capability. The producer must expose the actual fixed build capability
only after validating the production qualification/enrollment. Keep the producer's
exact current contract; do not reintroduce cancelled candidate5abe65b7 wholesale.

The native main composition will own `NativeConfig.releaseControl` (the six fixed
control fields documented in helper-runtime-join.md) and `releaseArtifactDirectory`
(an absolute privately installed locator matching the helper artifact root). The
helper copies these installed locators from its sealed baseline native config;
source/work input cannot override them. Native startup creates control and obtains
fresh process-branded runtime admission before managed enrollment verification.
After DevelopmentEngine exists, native private status/drain RPC is served before
connecting and pumping admitted actions. `NativeReleaseRuntime` receives the actual
production builder, integrated-source authority, current authorization and exact
installation/producer identities. Policy operations retain their existing handler;
release operations and SpecialRecovery delegate to the existing ReleaseBackend.

The exact managed/native join needed by this composition is a production-only
Builder matching src/release/backend.mjs plus the verified enrollment sealDigest,
complete trustedRunnerDigest and workflowDigest. Nested inner controllerDigest is
not the executor.controllerDigest in the release manifest. The native producer's
runtime admission hook must consume the deeply immutable, freshly authenticated
NativeReleaseControl admission, not untrusted/plain/copied JSON. Existing historical
qualification/nativeJoin checks remain for baseline; actual released non-baseline
bytes must match that admission's complete runtime and executor identities.

Helper active/retained and staged/source identities remain separate. The public
runtime projection only shows active/sealed after fresh exact native+edge+pointer
readback. A disconnected or pending pair clears that projection, while source work
remains usable and the original activation continues in the fixed helper journal.
No public four-tool input/output schema or annotation changes are required.

Next: join managed producer capability, complete native main wiring, run required
managed validation and exact canonical integration/readback, then commission only
missing installation capability with explicit bootstrap evidence. Immediately use
ordinary public release.stage/activate afterwards. Real paired health/rollback and
runtime self-development are separate acceptance, not inferred from these fixtures.
