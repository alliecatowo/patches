Status: local implementation and validation complete; delivery remains owned by Polyphony.

The implementation is committed on the worker branch as `afcb012` by the prior attempt;
this worker did not create another commit. It adds bounded worker packets, line/byte caps,
duplicate-output collapse, generated/lock artifact exclusion, self-contained CI retry metadata,
telemetry metrics, and no-progress/context-growth guards. The contract is documented in
`docs/agents/WORKER_CONTEXT_CONTRACT.md`.

Validation: `node --check scripts/worker-context.mjs`, `node --test scripts/worker-context.test.mjs`
(pass; the runner reports one suite with eight passing assertions), and `git diff --check` pass.

Current run evidence: issue #459 is In Progress with workpad comment
`IC_kwDOT7-QUs8AAAABR7qDdg`. Available `origin/main` is `27b4088`; HEAD `acd7fdc` is a
descendant. A fresh fetch was attempted and failed because this managed checkout cannot write
`.git/FETCH_HEAD`.

Remote limitation: the issue is now `In Progress` and the workpad mutation succeeded. The only
current external limitation is the managed checkout refusing fetch writes to `.git/FETCH_HEAD`;
no CI, deployment, review, or merge polling was performed.
