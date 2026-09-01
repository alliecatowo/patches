# Issue #435 plan

1. [x] Confirm the current `PUBLIC_ORIGIN`-derived RP ID and single-origin verification behavior.
2. [x] Add validated `PASSKEY_RP_ID` and `PASSKEY_ORIGINS` configuration with fallbacks preserving existing behavior.
3. [x] Wire both passkey ceremonies, production Fly configuration, ADR 0022, and deployment guidance.
4. [x] Add focused accessor coverage and run targeted checks; record environment blockers where the managed toolchain cannot run.
   - [x] Add focused accessor and schema coverage.
   - [ ] Run focused tests; blocked by unavailable workspace dependencies and mise trust restriction.
5. [x] Complete final diff/repository review and hand off without delivery operations.
6. [x] Retry #2: inspect the persisted delivery interruption and PR #450 feedback once; no local correction indicated.
