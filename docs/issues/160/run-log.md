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
  policy in ADR 0039.
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
