# Issue #180 handoff

Status: blocked on `P12-119` owner sign-off.

Evidence:

- `tasks.md:247-248` says `P12-119` is blocked pending the exact proposal/ADR
  approval and prohibits code before approval.
- `docs/product/tui-design-vision.md:635-637` says server-side Now work is
  blocked on `P12-119` sign-off.
- Project 5 shows Task ID `P12-120`, Status `Todo`, and `Blocked by: P12-119`.
- No Now protocol/storage implementation was changed or added.

Validation: repository search completed; the three per-issue artifacts are
modified for this retry. Persisted PR #460 deploy evidence was
reviewed once: build, Fly launch, DNS, secret update, and deploy completed, but
the final `GET https://patches-pr-460.fly.dev:8443/healthz` probe failed after
20 attempts; this is preview infrastructure state unrelated to the docs-only
change. No Now implementation was added, and no commit, push, PR update, or
remote wait was performed.
