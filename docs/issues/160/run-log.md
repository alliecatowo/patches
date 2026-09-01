# Issue #160 run log

## 2026-08-30

- Reproduced the issue: `infra/fly/fly.toml` sets both `PUBLIC_ORIGIN` and `NODE_DOMAIN` to `patches-social.fly.dev`; `infra/preview/fly-preview.toml` uses ephemeral PR Fly hostnames.
- Confirmed the roadmap still leaves “production domain configured” and “stable canonical domain selected” unchecked, and calls `patches.social` planned.
- Confirmed no owner decision or subdomain split exists in the inspected deployment/federation docs.
- `dig` could not open a network socket (`Operation not permitted`); `curl` could not resolve `patches.social` or `patches-social.fly.dev`. TLS/certificate verification was therefore impossible.
- Updated the GitHub workpad comment and moved the project item from unset Status to `In Progress`.
- No source/configuration files changed; no commit or PR was created because the acceptance criteria require an external owner/DNS/certificate decision that is unavailable in this session.

## 2026-08-30 continuation

- Used accepted ADR 0013's designation of `patches.social` as the flagship/reference node as
  the existing owner decision; recorded the permanent canonical origin and no-subdomain-split
  policy in the canonical-origin ADR (now ADR 0040 after its later conflict-safe renumbering).
- Updated `infra/fly/fly.toml` to `PUBLIC_ORIGIN=https://patches.social` and
  `NODE_DOMAIN=patches.social`; documented preview `*.fly.dev` origins as intentionally
  ephemeral and federation-disabled.
- Updated deployment docs, roadmap evidence, and production policy hostname. §160's stable
  canonical-domain checkbox is now checked; §159's production-domain checkbox remains open
  until DNS/certificate proof exists.
- Pull skill fallback attempted: `git fetch origin main` could not write `.git/FETCH_HEAD`
  because the provided `.git` is read-only; `HEAD` remains `f500cfd` and was already aligned
  with `origin/main` at kickoff.
- Validation: `git diff --check` passed; TOML/config review passed. `flyctl certs list`, DNS,
  and HTTPS checks remain unavailable because flyctl cannot write its config and network
  sockets/DNS are denied in this runner.

## 2026-08-31 retry

- Harness evidence identified failed checks on PR #438: `quality (format, lint, typecheck)` and
  its `ci-ok` aggregate, with no pending checks.
- Reproduced the actionable local failure with the pinned Prettier CLI: the canonical-origin
  ADR index table row was not formatted. The repository-wide invocation also reports existing
  unsupported TOML inputs; the CI-relevant Markdown check was isolated successfully.
- Formatted `docs/decisions/README.md`; affected ADR, deployment, roadmap, and issue artifacts
  now pass Prettier. Direct repository-wide ESLint cannot reproduce CI's built workspace state
  in this restricted checkout and reports dependency-resolution errors across unrelated files.
- `git diff --check` and Python TOML parsing pass for both Fly templates. No remote checks,
  deployment, or delivery operations were performed.

## 2026-09-01 retry: merge conflict

- Inspected PR #438 once: it is open and `CONFLICTING`, with no review threads or reviewer
  feedback. The remote base is `d19443b` (PR #436), which independently added an E2EE-only
  Direct Messages ADR as `0039-e2ee-only-direct-messages-and-honest-copy.md`.
- Renumbered this issue's canonical-origin ADR from 0039 to 0040 and updated its index,
  deployment, preview, roadmap, and per-issue references. Existing source comments that
  refer to ADR 0039 retain their existing E2EE meaning and are intentionally untouched.
- This resolves the only overlapping ADR number while preserving both decisions. Delivery,
  rebase, commit, push, and CI remain harness-owned.

## 2026-08-31 continuation attempt 3

- The persisted harness evidence reports an interruption during delivery, not a new source or
  validation failure. Preserved the uncommitted ADR 0040 conflict correction for harness
  delivery.
- Corrected the deployment routing diagram so `social.patches.social` is explicitly reserved
  and cannot be mistaken for an alternative federation identifier origin.
- Revalidated TOML parsing, ADR-reference integrity, and whitespace; no deployment, DNS, TLS,
  or remote CI observation was performed.
- `pnpm exec prettier` cannot run in this checkout because the `mise.toml` trust state is
  read-only, and this workspace has no direct Prettier binary. The existing prior-formatting
  result is preserved; the harness must run the authoritative quality gate after delivery.

## 2026-09-01 continuation attempt 4

- Reconciled issue #160 as open / In Progress with the existing workpad and preserved implementation slice.
- No source changes were needed: the canonical-origin ADR 0040, Fly configuration, preview policy,
  deployment documentation, and roadmap evidence are already present at `HEAD` (`51b936e`).
- GitHub workpad edit was attempted through the configured connector but rejected because this
  unattended runner has no approval capability; no fallback workpad updater exists in the checkout.
- Revalidated the preserved slice locally: both Fly TOML files parse, canonical ADR references are
  intact, and `git diff --check` passes. No DNS, TLS, deployment, CI, or delivery polling was run.

## 2026-09-01 continuation attempt 5

- Refreshed the single GitHub `## Codex Workpad` successfully; issue remains OPEN / In Progress
  with PR #438 OPEN and CONFLICTING.
- No implementation edits were needed. Revalidated both Fly TOML files, ADR 0040 reference
  integrity, and `git diff --check`; all passed.
- DNS/Fly certificate issuance and live TLS verification remain external blockers. No deployment,
  delivery, CI, or remote polling was performed.

## 2026-08-31 continuation attempt 6

- Reconciled the preserved implementation at `HEAD` (`51b936e`); no source changes were needed.
- Focused checks passed: both Fly TOML files parse, production and preview origin/domain values
  match policy, ADR 0040 references resolve, roadmap evidence is present, and `git diff --check`
  is clean.
- DNS/Fly certificate issuance and live TLS verification remain external blockers. No deployment,
  delivery, or CI polling was performed.

## 2026-09-01 continuation attempt 7: merge-conflict retry

- The persisted `merge_conflict` was reconciled against the local delivery history: ADR 0039 is
  reserved for the independently merged E2EE DM decision, while this slice exclusively creates
  ADR 0040. `origin/main` is an ancestor of the delivery branch, so the ADR filename/index
  collision has already been corrected locally.
- Focused validation exposed a separate delivery blocker: `git diff --check origin/main...HEAD`
  reported trailing whitespace on ADR 0040's status/date lines. Removed the whitespace.
- Revalidated the resulting working tree with `git diff --check origin/main` and the focused
  Python TOML/ADR-reference/roadmap-evidence assertions; both passed. The workspace has no
  Prettier binary, so the harness quality gate remains the formatter authority.
- DNS/Fly certificate issuance and live TLS verification remain external blockers. No deployment,
  delivery, CI, or remote polling was performed.
