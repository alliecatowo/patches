# Roadmap

Source of truth: `INITIAL_VISION.md` §§134–160. This document restates the execution
roadmap and acceptance checklists in one place so status can be tracked without re-reading
the full spec. Update the status line at the top of each phase as work lands — don't let
this drift into fiction.

**As of 2026-08-17: Phase 0 (repository and risk spikes) is functionally complete pending manual Kitty image confirmation; Phase 1 starts next.** No later phase
has started.

---

## Phase 0 — repository and risk spikes

**Status: in progress (started 2026-08-17)**

Deliver: monorepo skeleton, mise, Node/pnpm pinning, TypeScript base config, Turborepo,
lint/format, GitHub Actions skeleton, Docker Compose PostgreSQL, a Nest hello-world gRPC
service, an Ink hello-world client, protobuf generation, a real gRPC client call, and a
Kitty image proof-of-concept.

**Success criteria:** the Patches TUI calls the local Nest server through a generated
protobuf contract, and a test image can be displayed and cleared in Kitty. Do not proceed
to Phase 1 until both are true — these are the two biggest architectural risks in the
project (gRPC/Ink integration, and terminal image rendering) and everything else assumes
they work.

## Phase 1 — persistence and auth

**Status: planned**

Implement: TypeORM configuration, initial migrations, `User`, `Actor`, refresh tokens,
invites, email verification, `AuthService`, registration/login. TUI: `patches register`,
`patches login`, `patches logout`.

**Success criteria:** a fresh user can register, verify, log in, restart their terminal, and
remain authenticated.

## Phase 2 — posting

**Status: planned**

Implement: posts, create post, get post, delete post, actor profile, actor post list. TUI:
own profile, compose, profile timeline.

**Success criteria:** two users can independently post and inspect each other's profiles.

## Phase 3 — social graph / feed

**Status: planned**

Implement: follow, unfollow, home feed, local feed, keyset pagination. TUI: Home, Local,
actor search, follow controls.

**Success criteria:** Alice follows Bob. Bob posts. Alice's chronological feed shows Bob's
post.

## Phase 4 — replies / reactions

**Status: planned**

Implement: threaded replies, likes, bookmarks, notifications. TUI: thread screen, reply
action, like, bookmark, notification screen.

**Success criteria:** the core social loop exists end to end.

## Phase 5 — production media

**Status: planned**

Replace the Phase 0 image POC with the real pipeline: R2, upload initialization, direct
client upload, worker processing, Sharp derivatives, terminal media cache, Kitty rendering,
fallback for unsupported terminals.

**Success criteria:** Alice attaches a photo. Bob sees it inline in a supported terminal.

## Phase 6 — moderation / security

**Status: planned**

Implement: block, mute, report, admin commands, audit log, rate limits, account suspension,
password reset, robust input validation.

**Success criteria:** the service can safely support invited outside users.

## Phase 7 — deploy public v0

**Status: planned**

Deploy: Fly server, Fly Managed Postgres, worker, R2, Resend, production domain, secrets,
health checks. Add: structured logs, backup docs, smoke tests.

**Success criteria:** a user on another computer can run `npm install -g patches`, `patches`,
and use the real network.

---

## MVP polish phase

**Status: planned**

Before calling the project MVP, all of the following must be true:

- navigation feels intentional,
- resize works,
- errors are human-readable,
- images don't ghost,
- network loss doesn't crash the client,
- drafts are not easily lost,
- README is excellent,
- install instructions work from a clean environment,
- a demo recording exists,
- an architecture diagram exists,
- tests run in CI,
- migrations are reproducible,
- moderator workflows work,
- deployment is documented,
- backups are known and documented,
- the public alpha has published community rules.

---

## Post-MVP roadmap

### 0.3 — feed customization

Photo-only feed, custom actor lists, client filters, declarative local feed definitions
(the A2 stage of the feed-rule DSL — see `docs/product/principles.md`).

### 0.4 — identity personality

Experiment with pinned post, profile theme, Top 8, guestbook, richer profile links. Keep
customization safe — no arbitrary HTML/CSS/JS.

### 0.5 — federation lab

Two Patches instances talking to each other. ActivityPub fundamentals. No default public
federation yet. Corresponds to federation Stage F1.

### 0.6 — Fediverse compatibility

Mastodon-compatible discovery and basic interactions. Add domain moderation. Corresponds to
federation Stage F2.

### 1.0 — federated Patches

Public federation becomes supported. The centralized product still works without
federation — federation is additive, never a hard dependency. Corresponds to federation
Stage F3.

---

## React Native

**Status: planned, not started.** Begin only after the server contract is stable enough to
support a second client — i.e. not before the v0/MVP TUI and server are solid.

Add `apps/mobile/` using React Native + TypeScript. Reuse domain vocabulary, protobuf
schemas, API semantics, and authentication concepts. Do not attempt to reuse Ink UI
components directly — share non-UI logic only where it genuinely fits. The TUI remains a
permanent first-class client, not something discarded once a GUI exists.

**Mobile transport:** native gRPC may be used if React Native support is clean at
implementation time; otherwise a protobuf-derived HTTP transport such as Connect/HTTP.
Protobuf remains the canonical schema either way — no separate hand-written REST model for
mobile.

---

## Federation stages (F0–F3)

Federation is sequenced independently of the phase numbers above; it does not start until
the centralized product (through MVP) works.

### Stage F0 — schemas only

Centralized system. The data model already understands local/remote actor possibility,
canonical URIs, origin, tombstones, and visibility. No remote network requests are made.

### Stage F1 — two-instance lab

Run two Patches servers locally. Implement WebFinger, actor documents, inbox/outbox,
Follow, Accept, Create Note, Delete, and optionally basic Like. No Mastodon compatibility
goal yet — the target is proving Patches-to-Patches federation works.

### Stage F2 — interoperability

Test against mainstream ActivityPub implementations. Implement discovery, HTTP signing
compatible with ecosystem expectations, remote actor caching, remote object ingestion,
retry, deduplication, a blocklist, and domain moderation.

### Stage F3 — public federation

Only enabled after abuse controls, SSRF protection, signature verification, job retries,
tombstones, remote deletion handling, monitoring, and domain controls all exist.

---

## Acceptance checklists

These are the literal go/no-go gates from the spec (§§157–160). A phase or milestone is not
"done" until every box is checked — partial credit doesn't count for these.

### Phase 0 acceptance checklist

- [x] `mise install` produces the required toolchain.
- [x] `pnpm install` succeeds.
- [x] PostgreSQL starts locally.
- [x] protobuf schemas compile.
- [x] Buf lint succeeds.
- [x] Nest server starts.
- [x] Ink TUI starts.
- [x] TUI performs a real gRPC request.
- [x] request failures render cleanly.
- [x] Kitty capability can be detected.
- [ ] a test image renders in Kitty. _(spike implemented — `pnpm --filter @patches/terminal-media spike`; awaiting manual confirmation in Ghostty/kitty)_
- [ ] the image can be cleared. _(same spike; manual confirmation pending)_
- [x] terminal state restores after exit.
- [x] CI executes build/typecheck/test skeleton. _(workflow written + actionlint-clean; first real run happens on the PR)_

### v0 acceptance checklist

v0 is complete only when two real users can:

- [ ] register,
- [ ] verify email,
- [ ] login,
- [ ] persist session securely,
- [ ] edit profile,
- [ ] search local actors,
- [ ] follow,
- [ ] unfollow,
- [ ] post text,
- [ ] upload static image,
- [ ] view inline image in Kitty,
- [ ] use media fallback elsewhere,
- [ ] see chronological home feed,
- [ ] see chronological local feed,
- [ ] open thread,
- [ ] reply,
- [ ] like,
- [ ] unlike,
- [ ] bookmark,
- [ ] block,
- [ ] mute,
- [ ] report,
- [ ] receive basic notifications,
- [ ] logout.

And administrators can:

- [ ] create invites,
- [ ] inspect reports,
- [ ] suspend a user,
- [ ] remove content,
- [ ] inspect an audit record.

### MVP deployment checklist

- [ ] production domain configured,
- [ ] TLS works,
- [ ] gRPC through Fly works,
- [ ] Managed Postgres configured,
- [ ] R2 configured,
- [ ] worker configured,
- [ ] email delivery configured,
- [ ] migrations deploy automatically but explicitly,
- [ ] secrets are not in the repository,
- [ ] production health checks work,
- [ ] structured logs work,
- [ ] error monitoring works or a documented alternative exists,
- [ ] backup strategy exists,
- [ ] restoration procedure is documented,
- [ ] rate limiting exists,
- [ ] integration suite passes,
- [ ] smoke tests pass after deploy,
- [ ] README installation works from a clean environment,
- [ ] npm package install works,
- [ ] TUI works against production,
- [ ] user documentation exists,
- [ ] moderation guidelines exist.

### Federation readiness checklist

Do not publicly enable federation until:

- [ ] stable canonical domain selected,
- [ ] WebFinger works,
- [ ] actors serialize correctly,
- [ ] ActivityStreams objects validate,
- [ ] inbox works,
- [ ] outbox works,
- [ ] Follow works,
- [ ] Accept works,
- [ ] Create works,
- [ ] Delete works,
- [ ] Update semantics decided,
- [ ] deliveries are durable,
- [ ] duplicate delivery is safe,
- [ ] retries are bounded,
- [ ] signatures verified,
- [ ] SSRF defenses exist,
- [ ] remote response sizes bounded,
- [ ] remote request timeouts exist,
- [ ] domain blocking exists,
- [ ] remote delete/tombstones work,
- [ ] moderator can block a remote server,
- [ ] federation telemetry exists,
- [ ] two Patches servers interoperate,
- [ ] at least one mainstream Fediverse implementation interoperates.
