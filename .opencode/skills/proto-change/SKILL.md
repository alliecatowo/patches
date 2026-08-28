---
name: proto-change
description: Procedure to change a .proto file safely — format, lint, generate, breaking-check, and update the API doc and both consumers. Use for /proto-change.
invocation: user
allowedTools: Read, Edit, Bash
---

# /proto-change $ARGUMENTS

Full procedure for touching anything under `packages/proto/**` (spec §40–42, §46, `.claude/rules/proto.md`).

1. **Edit** the `.proto` file(s). Rules: proto3, package `patches.v1`, message naming `XxxRequest`/`XxxResponse`, pagination via the shared `PageInfo` pattern (spec §46) — never offset pagination. **Never reuse a field number.** If you remove a field, `reserved <number>;` it (and its name) instead of deleting cleanly.
2. `pnpm proto:format` (wraps `buf format -w`) — the `format-file.sh` post-edit hook does this automatically on save, but run it explicitly if you edited multiple files at once.
3. `pnpm proto:lint` — fix every finding; don't suppress buf lint rules without a documented reason.
4. `pnpm proto:gen` — regenerates TS via ts-proto. **Commit the generated output** — it's checked in (per repo convention, generated code isn't gitignored for `packages/proto`).
5. `pnpm proto:breaking` — this is the real gate. A failure here almost always means a field number was reused/changed or a required field got added to an existing message. Fix the `.proto`, don't override the breaking-check.
6. Update `docs/architecture/api.md` to match the new surface.
7. Update the consumers: the server's controller (`apps/server`, transport-adapter layer only — spec §128) and the TUI client (`apps/tui`) that call the changed RPC.
8. New RPCs need tests: a unit test for the mapper/service and a gRPC integration test for the controller (spec §116).
9. Run `/verify` scoped to `packages/proto`, `apps/server`, `apps/tui`.

Commit proto + generated code + doc + consumer changes together — a proto change that doesn't update its consumers in the same commit leaves the repo in a broken intermediate state.
