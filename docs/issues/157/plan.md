# Issue #157 — MCP provenance and approval UI

## Scope

Add a shared approval gate and an authenticated-web review surface. The gate derives risk from
the requested operation, requires an explicit decision, and records only an argument digest plus
provenance metadata. The UI displays the full request context needed for a human decision.

## Acceptance

- Mutation context shows client, principal, scopes, arguments, and risk before execution.
- Tool annotations and host confirmations are informational, never authorization.
- Approval and denial records omit raw argument contents.
- Domain and UI tests cover the decision path and minimization.

The settings inbox is intentionally an empty, authenticated shell until the MCP transport supplies
trusted pending requests; it does not fabricate a request or execute a mutation.

## Verification

- `mise run check domain`
- `mise run check web`
- `pnpm --filter @patches/web storybook:build`
- `git diff --check`

## Retry correction

The prior delivery failed before lint/typecheck because Prettier reported four new files. Its
Storybook smoke suite also failed when the domain barrel bundled `node:crypto` into browser code.
The retry formats those files and keeps the Node-only approval implementation out of the shared
runtime barrel while preserving browser-safe request/risk types.
