---
name: proto-nestjs-value-export-leak
description: ts-proto nestJs=true generated files always import @nestjs/microservices; a value export (not just export type) from index.ts pulls it into the ESM TUI bundle
metadata:
  type: feedback
---

`packages/proto`'s generated files (`src/generated/patches/v1/*.ts`, from ts-proto's
`nestJs=true` plugin option) unconditionally `import { GrpcMethod, GrpcStreamMethod } from
'@nestjs/microservices'` at the top of every file, even ones that only need to export a plain
enum. `export type { X } from './generated/...'` is erased at compile time (safe), but
`export { X } from './generated/...'` (needed for enum _values_, which TS enums are — even
`stringEnums=true` ones) emits a real runtime import statement, which pulls
`@nestjs/microservices` into `packages/proto`'s ESM `index.ts` entry point and breaks the
"importing the root never drags Nest in" guarantee the package is built around (Ink TUI must
never load Nest).

**Why:** Discovered while adding `PostType`/`PostVisibility`/`CredentialType`/
`GitHubLoginStatus` enums to `auth.proto`/`posts.proto` — verified by building the package
(`pnpm build`) and grepping `dist/index.js` for `@nestjs/microservices` after each change; it
appeared the moment I added a plain value re-export of an enum.

**How to apply:** When a `.proto` enum needs to be usable as a runtime value from
`@patches/proto`'s root export (not `/nest`), don't `export { EnumName } from
'./generated/...'`. Instead hand-mirror the enum's string values in a small non-generated file
(see `packages/proto/src/enums.ts`), typed via `import type` (erased, safe) casts to the real
generated enum type, with a vitest test (`enums.test.ts`) asserting the mirror's value set
exactly matches the generated enum via `Object.values(...)` (minus the `UNRECOGNIZED`
sentinel) so it can never silently drift. Always verify a proto/client-package change like
this by actually building and grepping `dist/` for the dependency you're trying to keep out —
don't just trust `export type` elision by inspection.

Related: [[proto-stringEnums-runtime-mismatch]]
