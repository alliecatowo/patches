---
name: postgres-truncate-cascade-unrelated-fk
description: TRUNCATE ... CASCADE empties every table with an FK pointing at the truncated table, not just tables you meant to also clear — ignores onDelete: SET NULL
metadata:
  type: feedback
---

`TRUNCATE <table> CASCADE` truncates every table that has _any_ FK referencing `<table>`,
full stop — it does not respect the FK's `onDelete` action (`SET NULL` vs `RESTRICT` vs
`CASCADE` are DELETE-only semantics). A nullable/optional FK column elsewhere in the schema
(e.g. `actors.avatar_media_id -> media.id`, `ManyToOne(() => Media, { onDelete: 'SET NULL' })`)
still makes `actors` a truncate-cascade target when you `TRUNCATE media CASCADE`, even though
no row logically depends on the media being cleared.

**Why:** Cost real debugging time in `apps/worker/test/media-processing.integration.test.ts`:
a `beforeEach`'s `TRUNCATE "media" RESTART IDENTITY CASCADE` was silently wiping a fixture
`actors` row created once in `beforeAll`, causing every subsequent `media` insert to fail its
FK check. `SELECT`s run immediately after creation (same `beforeAll`) found the row fine — the
row was actually being deleted later, by the next hook, not failing to insert in the first
place.

**How to apply:** Before writing `TRUNCATE ... CASCADE` in an integration test's cleanup hook,
grep every entity for `() => <TheEntityBeingTruncated>` (`grep -rn "() => Media"
packages/database/src/entities`) to see what else has an FK into it, and prefer a plain
`DELETE FROM "<table>"` (no CASCADE) when nothing needs cascading — it only fails if some
_other_ table's rows actually reference the rows being deleted, which is usually what you want
to know about anyway.

Related: [[postgres-cross-connection-self-deadlock]], [[concurrent-shared-checkout-hazard]]
