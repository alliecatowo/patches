---
name: connect-es-nested-message-init-no-typename
description: a Connect-generated client method accepts plain object literals for nested message-typed request fields — no $typeName needed, unlike the decoded Message<T> type you'd import for annotations
metadata:
  type: project
---

Connect's generated client (`createClient(Service, transport)` from `@connectrpc/connect`,
used throughout `@patches/client`/`apps/web`) accepts `MessageInitShape<typeof Schema>` for
request bodies and nested message-typed fields, not the strict decoded `Message<T>` type.
A plain object literal — `{ kind: FilterTermKind.SUBSTRING, value: 'x' }` for a
`FilterTermInput`, or `{ nameColor, glyph, badges: [], ... }` for a `Nameplate` — works
directly; there is no need to add `$typeName: 'patches.v1.FilterTermInput'` or call
`create(FilterTermInputSchema, {...})` first.

**Why:** the `Message<T>` type protobuf-es exports (e.g. `import { type FilterTermInput }
from '@patches/proto/es'`) _does_ require `$typeName` — it's the decoded-instance type, not
the init shape. Annotating a request-building `.map()` callback's return type with that
imported `Message<T>` type therefore forces `$typeName` in every literal, which is
unnecessary ceremony and diverges from the pattern already used elsewhere in this repo
(`apps/web/src/routes/SettingsProfileRoute.tsx`'s `nameplate: {...}` literal, no
`$typeName`, no import of the `Nameplate` type at all).

**How to apply:** when building a nested message-typed field for a Connect client call,
either don't annotate the literal's type at all (let it structurally satisfy
`MessageInitShape`), or use `MessageInitShape<typeof XSchema>` if an explicit annotation is
wanted — never the plain `Message<T>` type import for this purpose.
