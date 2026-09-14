# Cost-efficient composition F3 hosted falsification evidence — 2026-09-14

Status: **F3 survives. F4 ready.**

This directory is research evidence, not a Design and not production H2 authority. Accepted D0001/D0003/D0004 semantics, public MCP schema, validation requirements and release state remain unchanged.

## 1. Final verdict

**F3 survives.**

A private one-shot Android/Termux harness exercised the installed durable Git sender against fixed disposable ref `refs/heads/research/f3-20260914-a2` with exact expected-old CAS semantics. The experiment held the physical Git sender immediately before provider send, killed its controller, reopened the durable research ledger twice, retried the same logical effect while the old sender remained not stopped, requested cancellation of one follower, released the original sender, reconciled authoritative GitHub readback, settled all frozen members, and performed exact leased cleanup.

No duplicate physical sender, split effect, partial terminal settlement, cancellation escape, canonical mutation or unrelated-work failure was observed.

F4 status: **ready**.

## 2. Evidence files

- `A2.md` — historical blocked state before native operator execution became available.
- `fixture-a2.json` — exact frozen validated member/composed fixture.
- `experiment-a3.json` — raw bounded device experiment record; operator reported 7950 bytes and SHA-256 `66a1e9bb0cdba2649bc5109b1ba8b119253aeaf30bfcb5c1b8faf7f9717ce19e`.
- `A3.md` — final hosted execution, isolation evidence and verdict.

## 3. Exact experiment identity

- canonical launch authority: `sha1:09d47cca3df131f038c5b73efdbef6a50d41121c`
- policy digest: `sha256:84bfab71384ae039ff34be77ac1b3e31c054a507062cf77d60560a4a0c749309`
- H: `sha1:478be4c0aa85ace7d4aea996245ca6736b5695e4`
- C: `sha1:40403f657d07d6588d407dfcdefd0c8bb03cd877`
- composed result: `7ed7279f2be55d3a81740b9c579cea73`
- composed validation: `sha256:9e43090dcdf5b4bad171f0f5b79a9447ad14fa2fa543443b905fb09f81dac22c`
- publication identity: `sha256:2e08cf55ff2fdb6fb550951688cead43a563ffff091d05a9c2b7dd5845e6cdc3`
- logical E: `d7994167ce3e2c9307009e18cbf49ea92b1ab4162c31981e516e87ee2fb44abd`
- physical invocation: `89dab3b495c84234e461c310ec78f19b`

## 4. Hosted falsifier results

The physical sender reached `held-before-provider-send`. After controller death, recovery owner epochs `2` and `3` both observed the same invocation, `stopped:false`, and retry `uncertain`. A replacement invocation was not created.

Follower action `5d61613ffc79f3c47dc2fea1b256fa34` was cancelled at phase `remote_possible`. After provider convergence it settled succeeded with `cancellationTooLate:true`, while all three members shared the same publication identity and work disposition `integrated`.

Authoritative research-ref readback observed exact C at `2026-09-14T12:25:06.769Z`. The terminal projection was 0 before settlement and 3/3 after settlement.

A separate ordinary public-path validation (`651f65a715de9606bc85c00c6b93891d` / `a6470733f6413fe03aecc0cf9ea68edd`) ran from `2026-09-14T12:24:20.653Z` through `2026-09-14T12:26:50.640Z`, covering the F3 held/uncertain/recovery interval, and completed both required profiles successfully. It was never integrated and was subsequently closed.

After F3 completion, independent provider readback found the disposable research ref absent. Fresh canonical readback remained exactly `sha1:09d47cca3df131f038c5b73efdbef6a50d41121c`.

## 5. Scope of the conclusion

This result falsified the selected F3 failure hypotheses for the constrained research fixture: duplicate sender under old-sender uncertainty, loss of convergence across controller restart, follower cancellation escaping a shared effect, partial terminal settlement, provider/readback ambiguity after release, cleanup leakage, and unrelated-work isolation failure.

It does **not** establish general production H2 safety, does not compare H2 superiority, and does not authorize a production batching/coordinator design. Those remain separate decisions requiring their own evidence and authority.

## 6. Next stage

F4 may proceed from this evidence as the next research stage. It must fresh-bind current repository/runtime/provider authority and use its own explicit falsifiers, safety boundaries and stop conditions rather than treating F3 survival as production acceptance.
