# specification-driven development

This repository treats changes to public contracts, durable state, concurrency, security, ownership, migration, rollback, or deployment as major changes.

For a major change:

1. route through `AGENTS.md` and `WORKBOARD.md`;
2. define the problem, current contract, scope, non-goals, acceptance, verification, and hard-stop unknowns;
3. record ownership and transition decisions in an accepted design record and affected normative owners;
4. freeze that revision before implementation;
5. implement the smallest production-shaped vertical slice;
6. validate from the cheapest falsifier through the required full source gate;
7. review the complete effective diff and update only owners affected by verified results.

If new evidence invalidates a frozen design, reopen and amend the owner instead of hiding the mismatch in implementation.
