# Issue #158 handoff

## Delivered

- Added `docs/issues/158/audit.md` with a web/TUI/mobile authentication inventory, security
  invariants, intentional N/A cells, scoped findings, and a disposable-node acceptance path.
- Added and synchronized `plan.md`, `run-log.md`, and this handoff under the required issue
  artifact directory.
- Updated the existing single GitHub workpad comment with the current plan, evidence, and blockers.
- Preserved unrelated workspace content and made no application-source changes.

## Evidence

- Base/source snapshot: `f500cfd`, equal to `origin/main` before the read-only pull attempt.
- Source evidence: `docs/architecture/auth.md`, `apps/web/src`, `apps/tui/src`, and
  `apps/mobile/src`.
- PR #424 was inspected once: OPEN, mergeable, `polyphony` label, no actionable review threads.
- Preview evidence: gRPC/HTTP/web/worker/Neon are advertised live; real email is off and no test
  credentials are supplied.
- Browser validation was attempted once and denied by browser permission policy before navigation.
- Retry #2 quality evidence: cached Prettier under Node 24 reproduced formatting failures in only
  `audit.md` and `run-log.md`; both are formatted in the current workspace.
- Retry #2 preview evidence: the delivered commit contains no preview workflow/configuration change;
  static actionlint and the per-PR config generator both pass locally.

## Validation

- Artifact whitespace scan (`rg -n "[[:blank:]]+$" docs/issues/158`) — passed.
- Required-file check for `audit.md`, `plan.md`, `run-log.md`, and `handoff.md` — passed.
- `mise run check mobile` — blocked during mise trust setup because the filesystem is read-only;
  direct pnpm test/typecheck fallbacks hit the same untrusted-config guard; no package check result
  is claimed.
- Cached Prettier check for `docs/issues/158` — passed after formatting the two files that caused
  CI quality to fail.
- `git diff --check` — passed.
- Static `actionlint .github/workflows/preview.yml .github/workflows/ci.yml` plus
  `make-preview-config.mjs --pr 428` — passed using cached tools.

## Blockers

- Credentialed disposable-node validation cannot run because the preview has no real email delivery,
  no test credentials were supplied, and browser access was denied before navigation.
- Repository pull synchronization cannot update `.git/FETCH_HEAD` in this managed read-only Git
  metadata setup; `HEAD` already matched `origin/main` at the start.
- Mobile parity findings (verification/reset/recovery-code/credential management/all-sessions and
  server-side logout UI) and `PASSWORD_AUTH=required` enforcement remain separately scoped product
  gaps; they were documented, not silently implemented in this audit slice.
- The remaining preview deploy failure cannot be diagnosed to an exact step locally: the supplied
  check summary has no step logs, this diff does not change preview code/configuration, and the
  workflow requires live Neon/Fly credentials and infrastructure unavailable in the workspace.
