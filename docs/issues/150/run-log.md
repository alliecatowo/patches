# Issue #150 run log

- 2026-08-30: Issue confirmed OPEN / Project Status In Progress; existing workpad reused.
- 2026-08-30: Reproduction found the unconditional rule in `CLAUDE.md` and `AGENTS.md`, plus
  stale active README/mobile/operator copy.
- 2026-08-30: `git fetch origin main` attempted as pull fallback; failed because `.git/FETCH_HEAD`
  is read-only. No remote sync was possible; `HEAD` remains `06ee9b0`.
- 2026-08-30: Added ADR 0039, index entry, instruction updates, and active copy corrections.
- 2026-08-30: `git diff --check` passed; stale unconditional-rule search passed; ADR index-link assertion passed.
- 2026-08-30: Direct Prettier binary is unavailable; mise-wrapped formatter/checks are blocked by the
  untrusted workspace config and were not forced with `mise trust`.
- 2026-08-31: Persisted CI failure reproduced: Prettier flagged mobile registration and ADR index
  formatting. Both were formatted; direct pinned Prettier check now passes.
- 2026-08-31: Scoped pnpm Turbo lint/typecheck could not start because pnpm attempted a read-only
  store symlink; no source-level lint/typecheck result was produced.
