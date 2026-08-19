---
name: database-entity-value-export-shadows-type-alias
description: "@patches/database exports both a TypeORM entity class and a same-named string-union type for some enums (FilterScope) — `import { type FilterScope as X }` silently binds to the class's instance type, not the union, with no error until a distant, confusing type-mismatch
metadata:
  type: feedback
---

`@patches/database`'s `index.ts` exports `FilterScope` twice under different final names: the
`filter-scopes` join-table **entity class** as `FilterScope` (value export,
`./entities/filter-scope.entity.js`), and the `FILTER_SCOPES`-backed string-union **type** as
`FilterScope as FilterScopeValue` (type-only re-export, aliased specifically to avoid the name
collision). `filters/filter-enums.ts` already gets this right (`FilterScopeValue as
DbFilterScope`).

**Why:** a resumed-WIP file (`filter-list.dto.ts`, `filter-list.service.ts`, P14-022) imported
`type FilterScope as DbFilterScope` instead — TS accepted this with zero error at the import
site, because `type FilterScope` from `@patches/database` _does_ exist (it's just the entity
class's instance type, not the union). The mismatch only surfaced many lines away, at
`tsc --noEmit` time, as "Type 'string' is not assignable to type 'FilterScope'" inside
`filter-list.service.ts`'s `subscribeFilterList`/`toViews` — a confusing error pointing at
`FILTER_SCOPES` array literals and `.map()` callbacks, not at the bad import.

**How to apply:** whenever an entity name and its DB-column string-union type share a base
name in this codebase (check `packages/database/src/index.ts` for a `X as XValue` pattern
before aliasing an import), always import the `...Value` type export for a plain
string/enum-shaped field — never `type X as Y` on the bare entity name. If a `tsc` error names
a type that "should" be a string union but reads like a class/object shape, suspect this
collision first.
