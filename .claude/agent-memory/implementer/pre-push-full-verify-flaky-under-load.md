---
name: pre-push-full-verify-flaky-under-load
description: git push runs a lefthook pre-push hook that does a full monorepo `verify` (all 31 turbo tasks); under concurrent-agent load it can fail/timeout even when your own package's tests are green standalone
metadata:
  type: feedback
---

`git push` on this repo triggers a lefthook pre-push hook that runs the entire monorepo `verify`
(turbo, all packages/apps), not just the package you touched. On a machine with many concurrent
agent worktrees sharing resources ([[concurrent-shared-checkout-hazard]]), this full run can
fail or time out (2 min default) even though your own package's test suite passes cleanly when
run in isolation (`pnpm --filter <pkg> test`).

**Why:** the hook is a real repo-wide gate (CLAUDE.md forbids skipping hooks), but it is
sensitive to system load from other agents' parallel turbo runs, not to correctness of your
change.

**How to apply:** if `git push` fails/times out on the pre-push hook, first re-verify your own
touched package(s) standalone (`pnpm --filter <pkg> test`) to confirm the failure isn't yours.
If it's clean standalone, just retry the push (with a longer Bash `timeout`, up to 600000ms) —
it typically succeeds within a few attempts once contention eases. Don't chase phantom failures
in unrelated packages you never touched.
