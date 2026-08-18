# Roadmap

Source of truth: `INITIAL_VISION.md` §§134–160, as amended by **§176 (Amendment A)**. This
document restates the execution roadmap and acceptance checklists in one place so status can
be tracked without re-reading the full spec. Update the status line at the top of each phase
as work lands — don't let this drift into fiction.

**As of 2026-08-18: Phases 0–8 are implemented on the integration branch (see `tasks.md`); Phase 7 deploy artifacts exist but no public node has been deployed yet.**

## Release sequence (§176)

Federation moves earlier than originally scheduled; **every security gate stays where it
was**, and "finish the centralized vertical slice first" (§0) is unchanged.

| Release | Contents                                      | Federation stage |
| ------- | --------------------------------------------- | ---------------- |
| v0.0    | Single-node social loop — Phases 0–7 + 4.5    | F0               |
| v0.1    | Two-node federation lab — Phase 8             | F1               |
| v0.2    | Self-hostable node release — Phase 9          | F1               |
| v0.3    | Mastodon/Pixelfed interoperability — Phase 10 | F2               |
| v0.4    | Identity portability / migration — Phase 11   | F2               |
| v1.0    | Public federation — Phase 12                  | F3               |

See ADR [0013](../decisions/0013-node-model-and-earlier-federation.md).

---

## Phase 0 — repository and risk spikes

**Status: complete (2026-08-17)**

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

**Status: implemented**

Implement: TypeORM configuration, initial migrations, `Actor`, `User`, **`credentials`**,
`ssh_login_challenges`, refresh tokens, invites, email verification, `AuthService`,
registration/login. TUI: `patches register`, `patches login`, `patches logout`,
`patches accounts`.

**Amended by Amendment A (§165–§169):**

- `users.password_hash` does **not** exist — credentials live in the `credentials` table, and
  the Argon2id hash is `credentials.secret_hash` (ADR 0011).
- Email is nullable recovery/verification data, not the account identifier. Required only for
  password-only accounts (and where node policy requires it).
- Auth methods in Phase 1: **password + SSH-key challenge/response**. GitHub device flow is
  Phase 6 (justification below).
- Sessions are stored **per node** in the TUI (`CredentialStore` keyed by node origin + user
  id); a token is never sent to an origin other than its issuer.
- `actors` carries the portability seam (`moved_to_uri`, `also_known_as`) and `nameplate`
  from the first migration — columns exist, unused until later phases.

Flows and the security checklist: [`../architecture/auth.md`](../architecture/auth.md).

**Success criteria:** a fresh user can register (with an SSH key or a password), log in,
restart their terminal, and remain authenticated; a second credential can be added and
revoked; revoking the last one fails.

## Phase 2 — posting

**Status: implemented**

Implement: posts, create post, get post, delete post, actor profile, actor post list. TUI:
own profile, compose, profile timeline.

**Success criteria:** two users can independently post and inspect each other's profiles.

## Phase 3 — social graph / feed

**Status: implemented**

Implement: follow, unfollow, home feed, local feed, keyset pagination. TUI: Home, Local,
actor search, follow controls.

**Success criteria:** Alice follows Bob. Bob posts. Alice's chronological feed shows Bob's
post.

## Phase 4 — replies / reactions

**Status: implemented**

Implement: threaded replies, likes, bookmarks, notifications. TUI: thread screen, reply
action, like, bookmark, notification screen.

**Success criteria:** the core social loop exists end to end.

## Phase 4.5 — Pages v1

**Status: implemented**

Implement: the `PatchesPage` document schema and validator (in `packages/domain`), `pages` /
`page_revisions` / `page_assets` / `guestbook_entries` tables, `PageService`
(`GetPage`/`UpdatePage`/`ListGuestbook`/`SignGuestbook`), the **Ink renderer**, basic theme,
and the blocks `Text`, `Markdown`, `Links`, `Posts`, `TopEight`, `Guestbook`. TUI:
`patches visit @handle[/slug]` and a page editor.

`Image` and `Gallery` are defined in the schema at 4.5 but render as a **placeholder** until
the Phase 5 media pipeline exists — the schema may lead the pipeline; the renderer may not
fake it (§176).

Non-negotiable: the document is inert data — no executable user code, in any client, ever;
the server never renders; guestbooks ship with block-awareness, rate limiting,
reportability, and owner/moderator removal. See
[`../architecture/pages.md`](../architecture/pages.md) and ADR
[0012](../decisions/0012-patches-pages-portable-declarative.md).

**Success criteria:** Alice edits her Page; Bob runs `patches visit @alice`, sees it rendered
in his terminal, and signs her guestbook.

## Phase 5 — production media

**Status: implemented**

Replace the Phase 0 image POC with the real pipeline: R2, upload initialization, direct
client upload, worker processing, Sharp derivatives, terminal media cache, Kitty rendering,
fallback for unsupported terminals.

**Success criteria:** Alice attaches a photo. Bob sees it inline in a supported terminal.

## Phase 6 — moderation / security

**Status: implemented**

Implement: block, mute, report, admin commands, audit log, rate limits, account suspension,
password reset, robust input validation, **GitHub OAuth device flow** as a credential type.

GitHub device flow lands here rather than in Phase 1 because: it is the first outbound HTTP
call to a third party, so it wants this phase's URL/timeout/SSRF validation baseline; linking
a provider credential to an existing account is an account-takeover surface best built
alongside suspension and audit logging; and no item in the v0 acceptance checklist (§158)
depends on it. Phase 1's browserless paths (password, SSH) remain the primary ones — §153's
"never require a browser for normal TUI usage" is unaffected.

**Success criteria:** the service can safely support invited outside users.

## Phase 7 — deploy public v0

**Status: implemented, not yet deployed**

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

## Post-v0.0 roadmap (§176)

Amendment A replaced the old 0.3–1.0 sequence. Identity personality (profile theme, Top 8,
guestbook) moved **earlier**, into Phase 4.5 — it's the personal-web pillar, not a post-MVP
experiment. Federation moved earlier too, with every security gate unchanged.

### Phase 8 — two-node federation lab (v0.1)

**Status: implemented (lab).** Federation Stage F1, **local and non-public**. Two Patches nodes on one
machine: WebFinger, actor documents, inbox/outbox, `Follow`, `Accept`, `Create` (Note),
`Delete`, basic `Like`, and durable delivery through the existing outbox/jobs machinery with
bounded retries and safe duplicate delivery.

No Mastodon-compatibility goal yet. The objective is proving Patches-to-Patches federation
end to end, four releases earlier than originally scheduled, while a wrong actor/URI/delivery
assumption is still cheap to fix.

**Success criteria:** Alice on node A follows Bob on node B; Bob posts; the post appears in
Alice's home feed; Bob deletes it; it tombstones on node A.

### Phase 9 — self-hostable node release (v0.2)

**Status: planned.** A published node image plus a Compose template, documented environment
variables, an upgrade/migration path, and a security contact. **Federation is disabled by
default** in a fresh node, and no proprietary dependency is required — any S3-compatible
object store, any SMTP endpoint.

**Success criteria:** an operator who has not read the source can stand up a working node
from the published image and documentation, and federate it with a second node only by
explicit choice.

### Phase 10 — Fediverse interoperability (v0.3)

**Status: planned.** Federation Stage F2. Interop with Mastodon and Pixelfed: discovery
robustness, HTTP signing compatible with ecosystem expectations, remote actor caching,
remote object ingestion, retry, deduplication, blocklists, domain moderation.

### Phase 11 — identity portability (v0.4)

**Status: planned.** Account migration between nodes using the seam built in Phase 1
(`actors.moved_to_uri`, `also_known_as`), with bidirectional verification required before a
move is honored, plus the full data export (profile, posts, media manifest, page document,
social graph). Export is never gated behind a capability or payment.

### Phase 12 — public federation (v1.0)

**Status: planned.** Federation Stage F3. Enabled only after the full §160 readiness
checklist passes. The single-node product still works without federation — federation is
additive, never a hard dependency.

### Feed customization (unscheduled)

Photo-only feed, custom actor lists, client filters, declarative local feed definitions (the
A2 stage of the feed-rule DSL — see [`principles.md`](./principles.md)). Sequenced against
the releases above when there is demand; feed definitions remain **data, not executable
code**.

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

### Stage F1 — two-node lab (v0.1, Phase 8)

Run two Patches nodes locally. Implement WebFinger, actor documents, inbox/outbox,
Follow, Accept, Create Note, Delete, and optionally basic Like. No Mastodon compatibility
goal yet — the target is proving Patches-to-Patches federation works.

### Stage F2 — interoperability (v0.3–v0.4, Phases 10–11)

Test against mainstream ActivityPub implementations. Implement discovery, HTTP signing
compatible with ecosystem expectations, remote actor caching, remote object ingestion,
retry, deduplication, a blocklist, and domain moderation.

### Stage F3 — public federation (v1.0, Phase 12)

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
- [x] a test image renders in Kitty. _(confirmed manually in Ghostty 1.3, 2026-08-17)_
- [x] the image can be cleared. _(confirmed manually in Ghostty 1.3, 2026-08-17)_
- [x] terminal state restores after exit.
- [x] CI executes build/typecheck/test skeleton. _(workflow written + actionlint-clean; first real run happens on the PR)_

### v0 acceptance checklist

v0 is complete only when two real users can:

- [x] register (with an SSH key or a password),
- [ ] verify email _(where the node requires it — §165)_ — **in progress — A-028**,
- [x] login by password,
- [x] login by SSH key,
- [x] add and revoke a second credential,
- [x] edit and visit a Page,
- [x] persist session securely,
- [ ] edit profile — **in progress — A-027**,
- [x] search local actors,
- [x] follow,
- [x] unfollow,
- [x] post text,
- [x] upload static image,
- [x] view inline image in Kitty,
- [x] use media fallback elsewhere,
- [x] see chronological home feed,
- [x] see chronological local feed,
- [x] open thread,
- [x] reply,
- [x] like,
- [x] unlike,
- [x] bookmark,
- [x] block,
- [x] mute,
- [x] report,
- [x] receive basic notifications,
- [x] logout.

And administrators can:

- [x] create invites,
- [x] inspect reports,
- [x] suspend a user,
- [x] remove content,
- [x] inspect an audit record.

### MVP deployment checklist

- [ ] production domain configured _(needs live environment)_,
- [ ] TLS works _(needs live environment)_,
- [ ] gRPC through Fly works _(needs live environment)_,
- [ ] Managed Postgres configured _(needs live environment)_,
- [ ] R2 configured _(needs live environment)_,
- [ ] worker configured _(needs live environment)_,
- [ ] email delivery configured _(needs live environment)_,
- [x] migrations deploy automatically but explicitly _(release-command mechanism + migration
      CLI verified locally; not yet exercised in a live Fly deploy)_,
- [x] secrets are not in the repository,
- [ ] production health checks work _(needs live environment)_,
- [x] structured logs work,
- [x] error monitoring works or a documented alternative exists _(structured-log-only
      alternative documented — `docs/operations/deployment.md#error-monitoring`; A-033)_,
- [x] backup strategy exists _(documented — `docs/operations/backups.md`; not yet exercised
      against a live Postgres instance)_,
- [x] restoration procedure is documented _(`docs/operations/backups.md`)_,
- [x] rate limiting exists,
- [x] integration suite passes,
- [ ] smoke tests pass after deploy _(needs live environment)_,
- [ ] README installation works from a clean environment _(needs live environment)_,
- [ ] npm package install works _(needs live environment — packages not yet published)_,
- [ ] TUI works against production _(needs live environment)_,
- [x] user documentation exists _(`docs/user-guide.md`; A-034)_,
- [ ] moderation guidelines exist _(`docs/operations/moderation.md` covers admin workflow;
      public-facing community rules are a v0.0 MVP-polish item, not yet written)_.

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
