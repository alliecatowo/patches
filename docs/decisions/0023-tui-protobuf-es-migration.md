# 0023. The TUI migrates to protobuf-es via a wire seam, not a permanent adapter

**Status:** Accepted
**Date:** 2026-08-20

## Context

ADR 0016 phase F (task **P10-005**) is: _"TUI uses `@patches/client` + the grpc transport;
`apps/tui/src/api/client.ts` shrinks to UI-facing wrappers; no behavior change."_ ADR 0016 §9
explicitly rejected typing the SDK with ts-proto shapes, so `@patches/client` is protobuf-es
(`@patches/proto/es`) and cannot be re-typed to meet the TUI where it stands.

The TUI stands somewhere else. Measured on `feat/tui-ux-and-web-client`, 2026-08-20:

| Fact                                                                  | Value                                                                                                             |
| --------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `apps/tui/src/**` files importing `@patches/proto` (ts-proto)         | **102** (42 screens, 23 cli, 9 components, 6 hooks, 6 auth, rest scattered)                                       |
| Files importing `apps/tui/src/api/client.ts`                          | **56**                                                                                                            |
| `apps/tui/src/api/client.ts`                                          | **1864 lines**, ~90 hand-written methods over 20 grpc-js channels                                                 |
| CLI commands that bypass `PatchesApi` and build their own grpc client | **9** (`appeal`, `community`, `dm`, `filter`, `labelers`, `lists`, `modlog`, `privacy`, `tag`)                    |
| Of the 102, files with **value** (not type-only) proto imports        | **81** — but the values are only enum mirrors, `timestampToDate`/`dateToTimestamp`, and the grpc client factories |

The two runtime families genuinely differ, and the difference is real, not cosmetic
(`packages/proto/buf.gen.yaml` documents why each side is what it is):

- **Enums.** ts-proto runs with `stringEnums=true` because `@grpc/proto-loader` is the actual
  deserializer and decodes to `'POST_TYPE_NOTE'`. protobuf-es decodes to `PostType.NOTE === 1`.
- **Timestamps.** ts-proto/proto-loader yields `{ seconds: string, nanos: number }`; protobuf-es
  yields `{ $typeName, seconds: bigint, nanos: number }`.
- **Message identity.** Every protobuf-es message carries a `$typeName` tag; ts-proto messages are
  plain objects, and with `useOptionals=none` every field is a _required_ property.

Three things measured during this decision changed what the migration actually costs, and they are
why the plan below looks the way it does:

1. **The enum member names already match.** `packages/proto/src/enums.ts` exports hand-written
   mirrors with the prefix stripped — `POST_TYPE.NOTE`, `NOTIFICATION_TYPE.FOLLOW_REQUEST`,
   `FILTER_ACTION.HIDE` — which is exactly protoc-gen-es's own convention (`PostType.NOTE`,
   `NotificationType.FOLLOW_REQUEST`, `FilterAction.HIDE`). Every TUI call site spells the member,
   never the wire string. So the enum flip is a **rename of the import, not of any call site**.
2. **Message _type names_ match too** (`Post`, `Actor`, `GetPostResponse`, …), because both
   families are generated from the same `.proto`. Only the shapes behind those names differ.
3. **`describeGrpcError` is already duck-typed.** It reads a numeric `.code` (gRPC `Status` and
   Connect `Code` are numerically identical for 1–16, `docs/research/connect-es.md` §7), a string
   `.details`/`.message`, and `metadata.get('x-patches-error-code')` — which a `ConnectError`'s
   `Headers`-typed `.metadata` satisfies. It can be made to serve both families in one small commit,
   leaving its 24 consumers untouched.

Together these mean the migration is dominated by **import specifiers**, not by logic. That is a
property worth engineering around, because the alternative reading — "100 files must change
meaningfully" — leads to either a 100-file big bang or a permanent adapter.

`packages/client/src/errors.ts` is a **port, not a duplicate**, of `apps/tui/src/api/errors.ts`: the
TUI returns `FriendlyError { title, hint, retryable, code }` and 19 call sites render `.title` and
`.hint` in separate cells; the SDK collapses them into one `message`. Adopting `describeError`
verbatim would change TUI copy, i.e. change behavior.

## Decision

**Migrate the TUI's type surface to protobuf-es (option (a)), but reach it through a temporary
_wire seam_ so the risky commit is small and every commit before it is a no-op.**

Concretely, `apps/tui/src/api/wire/` becomes the single place the TUI names wire types, enums and
timestamp conversion:

- `wire/types.ts` — a barrel of `export type { … }` re-exports. Every consumer imports message
  types from here instead of from `@patches/proto`.
- `wire/enums.ts` — re-exports the enum objects under the existing `SCREAMING_SNAKE` aliases, so
  `POST_TYPE.NOTE` at ~45 call sites is unaffected by the flip.
- `wire/time.ts` — `toDate`/`fromDate` accepting `string | number | bigint` seconds, so timestamp
  reads are valid in **both** families before, during and after the flip.
- `apps/tui/src/test/wire-fixtures.ts` — the shared message fixture builders the ~25 test files
  currently inline, so `$typeName` lands in one module rather than in every test.

Repointing consumers at the seam is mechanical, type-identical and runtime-identical: those commits
are green by construction and reviewable as "import path changed, nothing else". The actual family
switch is then a single commit that edits the seam modules, the new client and `errors.ts` — under
ten files — and that is the commit worth reading carefully.

Alongside it:

- `apps/tui/src/api/client.ts` is rewritten over `createPatchesApi` + `createGrpcTransport`
  (`@patches/client/grpc`), **keeping its existing flat method surface** (`api.listHomeFeed(req)`,
  `api.likePost(req, accessToken)`, …) as one-line delegations to `api.feeds.listHomeFeed(…)` etc.
  Preserving the surface is what makes "no behavior change" checkable and keeps the 56 importers out
  of the diff. The file shrinks from 1864 lines to roughly 250.
- Per-call auth keeps today's exact rule — explicit `accessToken` argument, else
  `getAmbientAccessToken()`, else no header — implemented as one `callOptions(accessToken?)` helper
  producing `{ headers: { authorization: 'Bearer …' } }`, mirroring today's `callMetadata`. Not a
  transport interceptor, because the per-call override is the common case here.
- The TUI **keeps its own `apps/tui/src/auth/session.ts`** and does not adopt
  `@patches/client`'s `SessionManager` in this task. The TUI's manager owns multi-account keyring
  storage and the ambient-token fallback; swapping it is a behavior risk with no bearing on the
  transport. `createPatchesApi` still constructs its internal `api.session`; the TUI ignores it,
  exactly as `apps/web/src/api/client.ts` already does and documents.
- `apps/tui/src/api/errors.ts` keeps `FriendlyError`'s `title`/`hint` contract. Unifying it with
  `@patches/client`'s `describeError` is filed as a separate, optional task (P10-016) that adds
  `title`/`hint` to `DescribedError` without changing its existing `message` output.
- Headers and deadlines are unchanged by construction: `@patches/client` sets `x-request-id`,
  `x-patches-client`, `x-patches-client-version` per call and defaults `timeoutMs` to 10 s (15 s for
  `AuthService`) — byte-identical to `METADATA_KEYS` and `DEADLINES_MS.unary`/`.auth`.

The seam is temporary by intent but not by deadline: after the flip it may be dissolved back into
direct `@patches/proto/es` imports in a purely mechanical commit, or kept and documented as "the TUI
names its wire types in one module". Either is acceptable; leaving it undocumented is not.

### Work plan

Ten slices, each independently green (`mise run check tui`, then `mise run verify` before commit),
each a single commit. Slices 1–6 leave the TUI running on grpc-js and ts-proto — every one of them
ships. Slice 7 is the flip.

| #   | Task    | Files owned                                                                                                                                                                                                                                           | Acceptance                                                                                                                                                                                                                                                                                                                                                                                 |
| --- | ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | P10-007 | `apps/tui/package.json`, `apps/tui/src/api/transport.ts` (+ `.test.ts`)                                                                                                                                                                               | `createGrpcTransport` built from `{ target, insecure }` → `http(s)://<target>`. Test starts a real `@grpc/grpc-js` server and completes `SystemService.Ping` through the transport over **h2c** (`http://`, the `--insecure` path) and over TLS. Nothing else in `src/` changes.                                                                                                           |
| 2   | P10-008 | `apps/tui/src/api/errors.ts`, `errors.test.ts`                                                                                                                                                                                                        | `describeGrpcError`/`isSignInRequired`/`isPrivacyAckRequired` handle a `ConnectError` as well as a `ServiceError` (prefer `rawMessage`; `Headers`-shaped metadata). Every existing test passes **unedited**; new cases cover UNAVAILABLE, DEADLINE_EXCEEDED, UNAUTHENTICATED + `SIGN_IN_REQUIRED`, FAILED_PRECONDITION + `PRIVACY_NOTICE_NOT_ACKNOWLEDGED`. `git show --stat` = 2 files.   |
| 3   | P10-009 | `apps/tui/src/api/wire/types.ts` (new) + the ~100 files importing proto **types**                                                                                                                                                                     | `grep -rn "from '@patches/proto'" apps/tui/src` matches only `src/api/wire/*` and files still importing enum/helper _values_. The diff changes import specifiers only — no other token on any line. Tests unedited.                                                                                                                                                                        |
| 4   | P10-010 | `apps/tui/src/api/wire/enums.ts` (new) + the ~45 files importing enum mirrors                                                                                                                                                                         | Every `POST_TYPE`/`FILTER_ACTION`/`NOTIFICATION_TYPE`/… import resolves through the seam; no member reference (`POST_TYPE.NOTE`) is edited anywhere. Tests unedited.                                                                                                                                                                                                                       |
| 5   | P10-011 | `apps/tui/src/api/wire/time.ts` (new) + the 15 sources and 11 tests using `timestampToDate`/`dateToTimestamp`                                                                                                                                         | `grep -rn "timestampToDate\|dateToTimestamp" apps/tui/src` → empty. `toDate` accepts `string \| number \| bigint` seconds (unit-tested for all three). No rendered output changes — existing render assertions unedited.                                                                                                                                                                   |
| 6   | P10-012 | `apps/tui/src/cli/{appeal,community,dm,filter,labelers,lists,modlog,privacy,tag}.ts` (+ their tests), `apps/tui/src/cli/auth-shared.ts`                                                                                                               | Those commands call `PatchesApi` methods instead of building their own grpc clients. `grep -rn "create[A-Za-z]*Client(\|DEADLINES_MS\|METADATA_KEYS" apps/tui/src/cli` → empty. Each command's output verified by running it against a local node.                                                                                                                                         |
| 7   | P10-013 | **The flip.** `apps/tui/src/api/client.ts`, `apps/tui/src/api/wire/{types,enums,time}.ts`, `apps/tui/src/test/wire-fixtures.ts`, `apps/tui/src/api/errors.ts`, the three `new PatchesApi(...)` sites (`cli.tsx`, `cli/auth-shared.ts`, `cli/ping.ts`) | Seam modules re-export from `@patches/proto/es`/`@bufbuild/protobuf/wkt`; `client.ts` is rewritten over `@patches/client` + the P10-007 transport, keeps every method name/arity, and is under ~300 lines. No screen, component, hook or cli source file appears in the diff except fixture fallout that could not be hoisted in slice 6b below. Zero `any`/`@ts-ignore`/`eslint-disable`. |
| 6b  | P10-014 | `apps/tui/src/test/wire-fixtures.ts` (new) + the ~25 test files that inline message fixtures — **run before slice 7**                                                                                                                                 | No test file constructs a bare proto message literal; all fixtures come from the shared builders. Every existing assertion unedited.                                                                                                                                                                                                                                                       |
| 8   | P10-015 | `apps/tui/package.json`, `apps/tui/tsup.config.ts`, `apps/tui/scripts/copy-proto.mjs` (delete), `apps/tui/README.md`, `docs/architecture/*`                                                                                                           | `@grpc/grpc-js` and `@grpc/proto-loader` are gone from the TUI's deps and tsup `external`; `grep -rn "@grpc/" apps/tui/src` → empty; `pnpm --filter @patches/tui build && pnpm pack` produces a tarball with **no `dist/proto/`**; `patches ping`, `login`, `home`, a compose, and a media view verified against a live node.                                                              |
| 9   | P10-016 | `packages/client/src/errors.ts` (+ test), `apps/tui/src/api/errors.ts` (+ test) — **optional, independent**                                                                                                                                           | `DescribedError` gains `title`/`hint`; `message` output is byte-identical to today for every existing case (asserted); the TUI's `errors.ts` shrinks to an adapter. `apps/web` untouched.                                                                                                                                                                                                  |

Ordering note: 6b (P10-014) is the last preparation slice and must land before the flip; it is
numbered after P10-013 only because task IDs are allocated sequentially.

Boundary rule for the implementer: if a slice's type graph drags in a file that is not listed,
**move that file into the slice** — never reach for a cast, an `any`, or a second conversion layer
to hold a boundary that the type graph says is not there.

## Consequences

- One runtime shape in the TUI, one in the web client, one on the server's gRPC side of the Connect
  proxy — no client-side translation layer to keep in sync with the schema forever.
- The dangerous commit (P10-013) is small enough to read line by line and to revert atomically. The
  large commits (P10-009, P10-010) are type-identical refactors whose correctness `tsc` proves.
- A `maxTurns` abort or a session death mid-migration leaves a fully working, shippable TUI on the
  old transport with the seams already in place. Nothing is stranded half-converted.
- The TUI stops shipping `.proto` files and `@grpc/proto-loader` in its npm tarball
  (`scripts/copy-proto.mjs` and `packages/proto/src/proto-path.ts`'s sibling-of-bundle lookup exist
  solely for that), so the published `patches-social` package gets smaller and loses a whole class
  of "where did the .proto go" packaging bug.
- Twenty grpc-js channels (one per service) collapse into one HTTP/2 session.
- The seam adds one indirection for wire types. That is a real, if small, readability cost, and it
  must be either dissolved or documented — see the Decision.
- `apps/tui/src/api/present.ts` becomes redundant after the flip (protobuf-es never yields `null`
  for an unset message field) but stays correct; removing it is not required and is not part of
  P10-005.
- Two error-mapping implementations survive until P10-016 lands. That is a deliberate deferral, not
  an oversight: unifying them earlier would change user-visible copy inside a
  "no behavior change" task.

## Alternatives considered

- **A permanent adapter inside `client.ts` (option (b))** — convert every protobuf-es response back
  to ts-proto shapes for ~90 RPCs. Rejected. It contradicts the task's own acceptance criterion
  (`client.ts` would grow past 1864 lines, not shrink), it entrenches two runtime shapes in one
  process forever, and it is not even cheap: there is no generic converter, because
  `toJson()` renders `google.protobuf.Timestamp` as an RFC 3339 string and `int64` as a string,
  neither of which is proto-loader's `{ seconds, nanos }` shape — so it would be a descriptor-driven
  walker or 90 hand-written mappers, each a place for a silent enum/timestamp bug.
- **Unprepared big-bang: change all ~100 files in one commit.** Rejected. Same end state, but the
  single commit mixes ~100 mechanical edits with the handful of semantic ones (enum representation,
  timestamp representation, message identity), so review cannot distinguish them, and there is no
  green intermediate state to fall back to.
- **Screen-by-screen migration behind a dual-client shim** (both an old and a new `PatchesApi` live
  at once, screens move one at a time). Rejected after mapping the graph: `App.tsx` (2404 lines) is
  a hub that both passes `Post`/`Actor` _down_ to every screen and receives them back _up_ through
  callbacks like `openProfile(actorId, knownActor)` and `toggleLike(post)`, and `PostRow`/`PostList`
  are a single shared prop type across ~11 screens. The migration atom is therefore ~45 files no
  matter how the screens are sliced, and holding the boundary would require union-typed callbacks in
  `App.tsx` plus a converter to narrow them — more temporary machinery than the seam, for a worse
  result. The seam achieves the same "no single change is 100 meaningful lines" goal by draining the
  content out of the big commits instead of by splitting them.
- **Adopting `@patches/client`'s `describeError` in this task.** Rejected: it collapses `title` and
  `hint` into one string, which changes what 19 TUI call sites render. Deferred to P10-016 as a
  superset change.
- **Adopting `@patches/client`'s `SessionManager` in this task.** Rejected as out of scope: the
  TUI's manager owns multi-account keyring credentials and the ambient-token fallback, none of which
  is transport-related, and swapping it would put behavior change inside a no-behavior-change task.

## Addendum, 2026-08-20 — the enum premise was half right, and it is user-visible

This ADR justified the enum seam (slice 4, P10-010) on the finding that `packages/proto/src/enums.ts`'s
mirrors are prefix-stripped and so share member _names_ with protoc-gen-es: `POST_TYPE.NOTE` and
`PostType.NOTE`. That is true, and it did hold — no member reference needed editing in P10-010.

What it missed is that the two families disagree on the **runtime value** behind that name. ts-proto
(as generated here) yields the string `'APPEAL_STATUS_OPEN'`; protoc-gen-es yields the number `1`.
Anywhere the TUI interpolates an enum rather than switching on it, the rendered output changes. The
flip surfaced this only at runtime — it typechecks clean, because both sides are the enum type.

Concretely, `apps/tui/src/cli/appeal.ts` builds a row as
`` `${appeal.id}\t${appeal.status}\t${appeal.moderationNoticeId}` ``, which printed
`appeal-1  APPEAL_STATUS_OPEN  notice-1` before the flip and `appeal-1  1  notice-1` after. The same
class of change hit `patches lists` (`FILTER_ACTION_COLLAPSE` → a number) and the notifications
screen, where a lookup keyed by the old string values silently fell through to a default glyph.

That is a behavior change in a task whose defining constraint was "no behavior change", so it is a
defect, not an accepted consequence. The fix belongs in the wire seam that already exists for exactly
this kind of family difference: a conversion from enum value to its proto wire name, applied at the
render and print sites. Tracked as **P10-020**.

The general lesson for the remaining slices: "the names match" is not the same claim as "the values
match", and only the second one keeps rendered output stable.

## Addendum, 2026-08-20 — slice 8 (P10-015) landed

`@grpc/grpc-js` and `@grpc/proto-loader` are out of the TUI's runtime `dependencies` (moved to
`devDependencies`, exercised only by `apps/tui/test/transport.test.ts`, which stands up a real
grpc-js server to verify the Connect gRPC transport's wire behavior) and out of `tsup.config.ts`'s
`external`. `scripts/copy-proto.mjs` is deleted along with the `dist/proto/` it produced — the
runtime no longer parses `.proto` files at startup (that ended at slice 7, P10-013; this slice
just removed the now-dead build step and dependency). The one remaining `@grpc/` mention under
`apps/tui/src/` is a comment in `src/api/wire/time.ts` describing the wire's `null`-for-unset
decode behavior — left alone here since that file belongs to slice 7's owner, not this slice.

## Notes for the index

This ADR's row is **not** yet added to `docs/decisions/README.md` (concurrent editors held that
file). Add:

`| [0023](./0023-tui-protobuf-es-migration.md) | The TUI migrates to protobuf-es via a wire seam, not a permanent adapter | Accepted |`
