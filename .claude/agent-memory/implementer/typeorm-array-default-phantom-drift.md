---
name: typeorm-array-default-phantom-drift
description: TypeORM 1.x postgres driver can never match an ARRAY[...]::text[] column default against live DB state, causing pnpm db:generate to emit the same no-op ALTER forever
metadata:
  type: feedback
---

An entity `@Column({ array: true, default: () => "ARRAY['A', 'B']::text[]" })` produces
phantom drift on every `pnpm db:generate` — never converges, even after running the generated
migration.

**Why:** TypeORM 1.x's `PostgresDriver.defaultEqual` compares a function-valued column default
two ways that both trip on the `ARRAY[...]` call-expression form:

1. `PostgresQueryRunner` introspects the live default by stripping every `::cast` suffix via
   `.replaceAll(/::[\w\s.[\]\-"]+/g, "")` before storing it as `tableColumn.default` — so a
   literal ending in `::text[]` never matches what comes back once that cast is stripped.
2. `PostgresDriver.lowerDefaultValueIfNecessary` lowercases everything _outside_ single-quoted
   spans before comparing (meant to normalize bare function calls like `NOW()`), which silently
   turns `ARRAY[` into `array[` on the entity side — but Postgres always reports the keyword
   back as `ARRAY[`, so this mismatch can never be closed as long as `ARRAY` sits outside quotes.

No `ARRAY['A', 'B', ...]` literal (cast or uncast) can satisfy both transformations at once.

**How to apply:** for any `text[]`-typed column default, use a bare quoted array literal —
`` `'{${values.join(',')}}'` `` — instead of an `ARRAY[...]` call expression. It has no cast
(Postgres infers the column's array type) and no keyword outside its quotes, so it's stable
under both of the driver's comparisons. Verify with a fresh DB: migrate, then
`pnpm db:generate --name=DriftCheck` should print "No changes in database schema were found"
and produce **no file** — that's the only real proof, not a passing test suite. See
[[shared-checkout-local-db-schema-drift]] for how to tell this apart from a genuinely stale
local Postgres container.
