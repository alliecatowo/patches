# Patches documentation

This is the documentation tree for Patches, a terminal-native social network. The
authoritative source spec is `../INITIAL_VISION.md`; everything under `docs/` is derived
from it and should be kept consistent with it. If something here contradicts the vision
spec, the spec wins — treat the discrepancy as a bug in these docs.

## Tree

- [`user-guide.md`](./user-guide.md) — end-user documentation: installing and running the
  `patches` client, connecting to a node, and the in-app keybindings.
- **`architecture/`** — system design docs.
  - [`architecture/overview.md`](./architecture/overview.md)
  - [`architecture/data-model.md`](./architecture/data-model.md)
  - [`architecture/api.md`](./architecture/api.md)
  - [`architecture/social.md`](./architecture/social.md)
  - [`architecture/auth.md`](./architecture/auth.md)
  - [`architecture/pages.md`](./architecture/pages.md)
  - [`architecture/media.md`](./architecture/media.md)
  - [`architecture/jobs.md`](./architecture/jobs.md)
  - [`architecture/federation.md`](./architecture/federation.md)
  - [`architecture/e2ee.md`](./architecture/e2ee.md)
  - [`architecture/tui.md`](./architecture/tui.md)
- **`decisions/`** — Architecture Decision Records (ADRs). Numbered, immutable-once-accepted
  records of consequential technical decisions and why they were made. Start at
  [`decisions/README.md`](./decisions/README.md) for the index and template.
- **`operations/`** — how the service is run in practice: deployment, database/migrations,
  backups, incident response, and local development setup.
  - [`operations/deployment.md`](./operations/deployment.md)
  - [`operations/database.md`](./operations/database.md)
  - [`operations/backups.md`](./operations/backups.md)
  - [`operations/incidents.md`](./operations/incidents.md)
  - [`operations/local-development.md`](./operations/local-development.md)
  - [`operations/try-it.md`](./operations/try-it.md) — run it against the live node, test several users
  - [`operations/release.md`](./operations/release.md) — cutting a TUI release
  - [`operations/site.md`](./operations/site.md)
  - [`operations/web.md`](./operations/web.md)
  - [`operations/federation.md`](./operations/federation.md)
  - [`operations/moderation.md`](./operations/moderation.md) — the `patches-admin` CLI
- **`product/`** — what Patches is and why: product principles, roadmap, and (planned)
  moderation policy.
  - [`product/principles.md`](./product/principles.md)
  - [`product/roadmap.md`](./product/roadmap.md)
  - [`product/tui-design-vision.md`](./product/tui-design-vision.md) — the TUI's design vision (layout, themes, flows)
  - `product/moderation.md` _(planned)_
- **`research/`** — exploratory notes, technical spikes, and background research that
  informed decisions but isn't itself a decision record (verified against official docs,
  cited, dated) — e.g. [`research/fly-io.md`](./research/fly-io.md).
- **`agents/`** — guidance for AI implementation agents working in this repository, if/when
  that becomes its own documented surface distinct from `INITIAL_VISION.md` itself.
  _(Currently empty.)_

## Where to start

- New to the project? Read `../INITIAL_VISION.md` first, then
  [`product/principles.md`](./product/principles.md) for the condensed version.
- Picking up implementation work? Check [`product/roadmap.md`](./product/roadmap.md) for
  current phase status and the relevant acceptance checklist.
- Wondering why something was built a particular way? Check
  [`decisions/`](./decisions/README.md) before assuming it was arbitrary.
- Running or deploying the service? Start with
  [`operations/local-development.md`](./operations/local-development.md) locally, or
  [`operations/deployment.md`](./operations/deployment.md) for production.
