# Issue #443 handoff

Status: local implementation and validation complete.

Changed:

- Added `scripts/worker-context.mjs` and regression tests.
- Added `docs/agents/WORKER_CONTEXT_CONTRACT.md`.
- Removed archive scanning from `.opencode/hooks/session-start.sh`.

Validation: `node --test scripts/worker-context.test.mjs` passes.

Sync note: `HEAD` and `origin/main` were both `27ea8f2`; `git fetch origin main` could not write
`.git/FETCH_HEAD` because this managed workspace exposes `.git` read-only.
