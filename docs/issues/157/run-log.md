# Run log

- 2026-08-30: Confirmed issue #157 is open/In Progress and reused the existing workpad comment.
- 2026-08-30: Reproduction: repository search found no MCP approval/provenance implementation.
- 2026-08-30: `git fetch origin main` was attempted but could not write `.git/FETCH_HEAD` because Git metadata is read-only; source baseline is `d19443b`.
- 2026-08-30: Added domain gate/digest/risk contract, web approval card, settings route, and tests.
- 2026-08-30: `git diff --check` passed. Canonical and direct package checks remained unavailable due read-only mise/pnpm state directories.
- 2026-08-31: Retry evidence from PR #441 identified four Prettier failures in the new MCP files and a Storybook failure caused by `node:crypto` being bundled through the domain barrel.
- 2026-08-31: Removed runtime MCP approval exports from the browser-shared domain barrel, retained type-only exports, and formatted the four reported files.
- 2026-08-31: `git diff --check` passed after the correction. Local `mise`/pnpm execution remains blocked by read-only mise state and unavailable registry access.
