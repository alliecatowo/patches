# Issue #178 run log

- 2026-09-01: Confirmed issue remains open and labelled `bug`, `blocked`; existing Codex Workpad identifies the same unresolved owner dependency (#150/B-125 and #198).
- 2026-09-01: Reproduced current inconsistency with `rg`: web registration and privacy settings say DMs are end-to-end encrypted and node-unreadable; mobile says encryption is only available and the client does not offer DMs.
- 2026-09-01: Read ADR 0030 and ADR 0039. ADR 0039 requires capability-based copy and retires the old server-visible disclaimer; `INITIAL_VISION.md §183.1` still says v0 DMs are server-visible and forbids encrypted/private wording.
- 2026-09-01: Attempted required origin sync; `git fetch origin main` could not write `.git/FETCH_HEAD` because the provided `.git` is read-only. No source edits made.
- 2026-09-01: Live dependency check: #150 and #198 remain open; no owner-approved wording or coordinated §183.1 amendment is available. Preserved the safety warning and stopped without source edits.
- 2026-09-01: Workpad comment update attempted through the configured connector and direct GraphQL fallback; both were rejected by session authorization (connector approval unavailable; GraphQL mutation failed). Local artifacts were updated instead.
