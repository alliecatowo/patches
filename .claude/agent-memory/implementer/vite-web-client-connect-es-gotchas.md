---
name: vite-web-client-connect-es-gotchas
description: Gotchas building apps/web (Vite/React) against @patches/proto/es + Connect — react-hooks lint rules, jest-dom/vitest cleanup, message-union mutations, exactOptionalPropertyTypes
metadata:
  type: feedback
---

Building the Vite/React web client (P10-001) against `@patches/proto/es`
(protobuf-es v2) + `@connectrpc/connect-web` surfaced several non-obvious
issues worth knowing before touching this stack again:

- **`eslint-plugin-react-hooks` v7's new rules are strict about ref/state
  timing.** `ref.current = x` as a bare statement in a hook body (not inside
  an effect) trips `react-hooks/refs` ("Cannot update ref during render")
  even for the common "always store latest callback in a ref" pattern —
  wrap it in a no-deps `useEffect(() => { ref.current = x; })` instead.
  Similarly, `setState(...)` calls directly in a `useEffect` body trip
  `react-hooks/set-state-in-effect` ("cascading renders") — for the "seed
  local form state once async data arrives" pattern, do a _guarded_
  `if (state === null && data) setState(...)` directly in the render body
  (React's documented "adjust state during render" pattern), not in an
  effect.
- **`createClient(Service, transport).method` return types are branded per
  message (`$typeName`).** A `useMutation`'s `mutationFn` that conditionally
  calls two different RPCs (e.g. `follow ? followActor(...) :
unfollowActor(...)`) won't unify even when both responses have the same
  shape — TS sees `Promise<FollowActorResponse> | Promise<UnfollowActorResponse>`
  as incompatible. Fix: give `mutationFn` an explicit return type annotating
  only the field(s) you actually use, e.g.
  `async (x): Promise<{ relationship?: Relationship | undefined }> => ...`.
  Note the `?:` — with `exactOptionalPropertyTypes: true` (repo's
  `tsconfig.base.json`), a proto message's optional field (`relationship?:
T`) is NOT assignable to a plain `{ relationship: T | undefined }` shape;
  the property must be declared optional (`?:`) on both sides.
- **`@testing-library/react`'s automatic per-test cleanup needs `globals:
true` in the Vitest config, or it silently never runs.** This repo's
  convention (`apps/tui/vitest.config.ts`) is `globals: false`. With that,
  RTL never registers its `afterEach(cleanup)` hook, so DOM from one test
  leaks into the next and `screen.getByRole(...)` starts throwing "found
  multiple elements". Fix in the test setup file: `import { cleanup } from
'@testing-library/react'; import { afterEach } from 'vitest'; afterEach(()
=> cleanup());`.
- **`GetPageResponse.document` (a Page "wall") is raw `bytes` (UTF-8 JSON),
  not a typed message.** `@patches/domain`'s `parsePageForRender` (used by
  the TUI and server) is the correct, already-hardened decoder — reuse it
  (`TextDecoder().decode(bytes)` → `JSON.parse` → `parsePageForRender`)
  rather than re-implementing Page block validation in the web client.
  `@patches/domain` has no gRPC/TypeORM/Ink imports, so depending on it from
  a browser bundle is architecturally fine.
- **`MediaAttachment` (on a `Post`) has no `url` field, only `media_id`** —
  you must call `MediaService.GetMediaDownload({ mediaId })` per attachment
  to get a real R2 URL. `Actor.avatar` (a `MediaRef`), by contrast, _does_
  carry `url` directly — don't conflate the two message shapes.
