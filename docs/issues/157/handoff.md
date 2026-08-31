# Handoff

Repaired the local MCP approval/provenance slice in the provided workspace. Changes are
uncommitted for the delivery harness.

- Domain: `packages/domain/src/mcp/approval.ts` and tests.
- Web: `McpApprovalCard`, test, settings route, navigation, and router entry.
- Artifacts: `plan.md`, `run-log.md`.
- Retry correction: formatted all four files reported by CI and removed the Node-only approval
  runtime from the browser-shared `@patches/domain` barrel; MCP request/risk types remain exported.
- Blocker: required baseline pull could not update read-only Git metadata (`.git/FETCH_HEAD`).
- Validation: `git diff --check` passed; `mise run check domain`, `mise run check web`, and Storybook
  could not run locally because mise state is read-only and pnpm cannot bootstrap without registry access.
- Scope note: the card is ready for trusted transport wiring; the route intentionally shows no pending request until that integration exists.
