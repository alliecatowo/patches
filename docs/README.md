# Patches documentation

This is the documentation tree for Patches, a terminal-native social network. The
authoritative source spec is `../INITIAL_VISION.md`; everything under `docs/` is derived
from it and should be kept consistent with it. If something here contradicts the vision
spec, the spec wins — treat the discrepancy as a bug in these docs.

## Tree

- **`architecture/`** — system design docs: overview, data model, API surface, media
  pipeline, background jobs, federation seam. *(Status: not yet written — planned per
  `INITIAL_VISION.md` §130.)*
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
- **`product/`** — what Patches is and why: product principles, roadmap, and (planned)
  moderation policy.
  - [`product/principles.md`](./product/principles.md)
  - [`product/roadmap.md`](./product/roadmap.md)
  - `product/moderation.md` *(planned)*
- **`research/`** — exploratory notes, technical spikes, and background research that
  informed decisions but isn't itself a decision record. *(Currently empty.)*
- **`agents/`** — guidance for AI implementation agents working in this repository, if/when
  that becomes its own documented surface distinct from `INITIAL_VISION.md` itself.
  *(Currently empty.)*

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
