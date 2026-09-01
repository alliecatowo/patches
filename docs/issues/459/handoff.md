Status: local implementation and validation complete; delivery remains owned by Polyphony.

The implementation is committed on the worker branch as `afcb012` by the prior attempt;
this worker did not create another commit. It adds bounded worker packets, line/byte caps,
duplicate-output collapse, generated/lock artifact exclusion, self-contained CI retry metadata,
telemetry metrics, and no-progress/context-growth guards. The contract is documented in
`docs/agents/WORKER_CONTEXT_CONTRACT.md`.

Validation: pinned Node 24 `node --check scripts/worker-context.mjs`, pinned Node 24
`node --test scripts/worker-context.test.mjs` (8 tests pass), and `git diff --check` pass.

Remote blocker: the issue remains `Todo` because the GitHub GraphQL mutation hung and `gh`
could not connect to `api.github.com`; no remote polling was performed after that retry.
