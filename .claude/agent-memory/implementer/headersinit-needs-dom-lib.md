---
name: headersinit-needs-dom-lib
description: '@types/node has no global HeadersInit (only Headers/fetch/AbortSignal) — a Node-only tsconfig makes any code reading a HeadersInit-typed field (e.g. Connect's CallOptions.headers) silently become `any`, invisible to tsc but caught by typescript-eslint as unsafe'
metadata:
  type: feedback
---

`@types/node@24`'s `web-globals/*.d.ts` declares global `Headers`, `fetch`, `Request`,
`Response`, `AbortSignal`, `crypto` (with `randomUUID()`) — but **not** `HeadersInit`. That
type only exists as a named export inside `undici-types`, never merged into the global
scope by `@types/node` itself (only `lib.dom.d.ts` does that).

`@connectrpc/connect`'s own `.d.ts` (`CallOptions.headers?: HeadersInit`,
`ConnectError`'s `metadata?: HeadersInit`) assumes the global exists. In a package whose
tsconfig has no `"dom"` in `lib` (e.g. a Node-only package, or one that inherits a
`lib: ["ES2023"]` base with no override), reading a value out of a `HeadersInit`-typed
field resolves to TS's internal "error" type, which behaves like `any`.

**The trap**: plain `tsc --noEmit` does not flag this — an unresolvable global type
silently degrades to `any` with no diagnostic. `typescript-eslint`'s type-aware rules
(`no-unsafe-argument`, `no-redundant-type-constituents`) _do_ flag it, but only where the
value is actually read/passed somewhere, so `tsc` was green while `eslint` failed on the
exact same file. Writing `new Headers()` with no args, or assigning a concrete `Headers`
instance _into_ a `HeadersInit`-typed parameter, never triggers it — only _reading_ a
`HeadersInit`-typed value does, which is why an existing file elsewhere in the repo doing
the former stayed clean while new code doing the latter (e.g. `new Headers(callOptions?.headers)`
inside a Connect-SDK wrapper) lit up.

**Fix**: for any package whose code actually reads `Headers`/`HeadersInit` values (an
isomorphic web+Node SDK wrapping `@connectrpc/connect`, for instance), add
`"lib": ["ES2023", "DOM"]` to that package's own `tsconfig.json`. `@types/node`'s
web-globals are written with `typeof globalThis extends { onmessage: any } ? ... : ...`
conditionals specifically so adding `"DOM"` doesn't produce duplicate/conflicting
declarations — it's the documented escape hatch, not a hack.

**Why this matters**: don't reach for an `as HeadersInit` cast or an eslint-disable when
this shows up — it just relocates the "error" type into your own code (and trips
`no-redundant-type-constituents` on the cast itself, since `HeadersInit` doesn't resolve
there either). Fix the `lib`, not the call site.

**How to apply**: any future isomorphic package (web+RN+Node) built on `@connectrpc/connect`
or another fetch-shaped API — check `docs/research/connect-es.md` first, but this specific
gotcha isn't in that note (added the finding here instead since it's a TS/tsconfig issue,
not a connect-es API fact).
