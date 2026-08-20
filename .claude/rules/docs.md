---
paths:
  - 'docs/**'
  - 'README.md'
---

# Docs rules

- **Never document a command you haven't run** (spec §154, CLAUDE.md working agreement #5). If you can't run it in this environment (needs secrets, needs a deploy, needs infra not available here), mark it `Status: planned` rather than asserting it works.
- **Status markers**: use `Status: planned` / `Status: implemented` (or the phase-status convention already used in `docs/product/roadmap.md`) so a reader can tell aspiration from fact at a glance — don't write docs that read as done when they're not.
- **ADR format**: `docs/decisions/NNNN-title.md`, sequential zero-padded numbering, Context/Decision/Consequences/Alternatives template in `docs/decisions/README.md`. Only `architect` writes/renumbers ADRs; anyone may fix a typo.
- **Keep research docs cited**: `docs/research/*.md` entries must cite their sources (official docs/source URLs) and a verification date, and separate documented fact from inference — see the existing notes for the pattern. If you find one wrong or stale, fix it as part of the change that discovered the problem, not as a separate someday-task.
- **`docs/README.md`'s tree** must stay accurate when docs are added/removed/moved.
- **The spec wins on conflict** (`docs/README.md`'s own rule): if a doc under `docs/` contradicts `INITIAL_VISION.md`, that's a bug in the doc, not a reason to reinterpret the spec — fix the doc, or if the spec itself needs to change, that's an ADR + explicit human sign-off, not a doc edit.
