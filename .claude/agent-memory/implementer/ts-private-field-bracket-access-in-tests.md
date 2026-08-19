---
name: ts-private-field-bracket-access-in-tests
description: TypeScript does not restrict bracket-notation access to a class's private fields, unlike dot notation — useful for spying on private members in tests without a suppression comment
metadata:
  type: feedback
---

TypeScript's `private` modifier blocks `instance.field` access outside the class, but does
**not** block `instance['field']` — this is a long-standing quirk of the type checker (not a
runtime distinction; both compile to the same JS). `tsc --noEmit` with strict settings and
`exactOptionalPropertyTypes: true` still passes bracket-notation reads/writes to a private
field.

**Why this matters:** in a test that needs to spy on a private `Logger` instance (e.g.
`vi.spyOn(service['logger'], 'log')` to assert a periodic structured-log call without
exposing the logger as a public/protected member or adding a test-only constructor param),
bracket notation is the idiomatic escape hatch — no `as any`, no `@ts-ignore`, no widening the
class's public API just for a test. Confirmed working end-to-end (typecheck + vitest run) in
`apps/server/src/modules/federation/federation-metrics.service.test.ts` against
`FederationMetricsService`'s private `logger` field.

**How to apply:** when a test needs access to a private field/method that has no other test
seam, prefer `instance['privateName']` over loosening the field's visibility or casting the
whole instance to `any`. Keep it scoped to the one access, not sprinkled everywhere — it's
still reading an implementation detail, so if the same private state needs asserting from
multiple tests, that's a signal the class might want a small `@Injectable`-friendly accessor
instead.
