# Run log

- 2026-08-30: Confirmed issue #157 is open/In Progress and reused the existing workpad comment.
- 2026-08-30: Reproduction: repository search found no MCP approval/provenance implementation.
- 2026-08-30: `git fetch origin main` was attempted but could not write `.git/FETCH_HEAD` because Git metadata is read-only; source baseline is `d19443b`.
- 2026-08-30: Added domain gate/digest/risk contract, web approval card, settings route, and tests.
- 2026-08-30: `git diff --check` passed. Canonical and direct package checks remained unavailable due read-only mise/pnpm state directories.
- 2026-08-31: Retry evidence from PR #441 identified four Prettier failures in the new MCP files and a Storybook failure caused by `node:crypto` being bundled through the domain barrel.
- 2026-08-31: Removed runtime MCP approval exports from the browser-shared domain barrel, retained type-only exports, and formatted the four reported files.
- 2026-08-31: `git diff --check` passed after the correction. Local `mise`/pnpm execution remains blocked by read-only mise state and unavailable registry access.
- 2026-08-31: Retry #2 confirmed the delivered correction at `9ac242c`: the browser-safe domain
  barrel has only type exports for MCP request/risk values, so it cannot pull `node:crypto` into a
  web bundle. `git diff-tree --check -r 9ac242c` and `git diff --check` pass.
- 2026-08-31: Direct pnpm 11.22.0 invocation bypassed the mise trust stop but pnpm could not
  register this workspace in its read-only shared store (`EROFS`); no dependencies or source files
  were changed. This prevents the targeted Prettier/package checks in this sandbox.
- 2026-08-31: Retry #4 confirmed issue #157 and PR #441 remain open, Project status is In
  Progress, and no reviewer feedback is outstanding. All CI checks except quality/its `ci-ok`
  aggregate passed at `17dcb9e`.
- 2026-08-31: Reproduced the quality failure with pinned Prettier 3.9.6: only
  `McpApprovalCard.tsx` and `approval.ts` required formatting. Applied those mechanical changes.
- 2026-08-31: Validation passed: full-repo Prettier, full-repo ESLint, domain and web TypeScript,
  domain approval tests (4/4), web approval-card test (1/1), and `git diff --check`.
- 2026-08-31: Local checks used temporary writable dependency links backed by the existing main
  checkout because pnpm's shared project registry is read-only. The temporary links and generated
  build output were removed after validation; tracked source was not affected by the workaround.
