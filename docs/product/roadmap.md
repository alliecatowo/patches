# Roadmap

Source of truth: `INITIAL_VISION.md` §§134–160, as amended by **§176 (Amendment A)**,
**§178–§195 (Amendment B)**, and **§196–§210 (Amendment C)**. This document restates the execution roadmap and acceptance
checklists in one place so status can be tracked without re-reading the full spec. Update the
status line at the top of each phase as work lands — don't let this drift into fiction.

**As of 2026-08-29: Phases 0–8 are implemented (see `tasks.md`); Phase 7 is deployed and the flagship node `patches-social.fly.dev` is live with Neon Postgres, production R2 media storage, and Resend email delivery. Phase 17 scale/capacity budgets (S-001/S-002) and security/retention updates (B-058–B-061) are implemented. Since the previous snapshot, board Phases 11–16 and 18 have landed (social depth, web client + PWA, E2EE protocol, TUI interaction model, privacy/filters/decentralized moderation, passwordless auth, and federating social depth — statuses below), and board Phases 19–21 are in progress. The next gated deployment to production remains B-063 (Todo on the project board): shipping the pending web/security fixes and verifying the live build.**

**As of this revision:** board Phase 11 — social depth (Amendment B, spec §178–§195: reposts
and quotes, tags, communities, DMs with honest indefinite retention, flair/pins/walls, quiet feed, edit history, and followers/following screens in TUI and Web) — is **implemented**
end to end.
Board Phase 14 — privacy, filters, decentralized moderation (Amendment C, spec §196–§210) — is
also implemented, with a handful of documented follow-ups (see
[Board Phase 14](#board-phase-14--privacy-filters-decentralized-moderation-amendment-c) below).
Board Phase 10 (web client) resumed per owner direction 2026-08-18 and has landed
(`apps/web`) as a responsive graphical peer with full theme support, profile wall editing, followers/following tabs, thread inline replies, and PWA/mobile safe-area support; React Native (P10-002) is paused (active-bug containment only, B-062) and migrating the TUI onto `@patches/client` (P10-005)
remains open. Board Phase 15 — passwordless auth (passkeys, recovery codes, node
password-auth policy) — started 2026-08-19 and has landed its server/database/web pieces
(P15-002/003/004); GitHub device-flow-on-prod and TUI/web credential-manager parity remain
open. See [Owner-directed board phases](#owner-directed-board-phases) below, and note
that §176's release-phase numbers and `tasks.md`'s board-phase numbers are different sequences
(§179).

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

**Status: implemented and deployed (patches-social.fly.dev); next revision pending B-063**

Deployed: Fly server + worker (`patches-social`), Neon Postgres (the stopped original Fly
Postgres cluster is retained only as a fallback — see `docs/operations/deployment.md`),
secrets, TLS via Fly, structured logs, migrations on
release. Verified end to end with two real accounts (register, login, post, follow, like,
reply, thread, notifications, home feed) and a passing smoke `patches ping`; R2 media storage
and the verified Resend sender are also configured. Not yet live: a production domain
(`patches.social`, currently `patches-social.fly.dev` only) and the repository's newer
auth/profile/security revision. The deploy workflow is configured and production-gated, but
its first automated run is still pending.

**Success criteria:** a user on another computer can run `npm install -g patches`, `patches`,
and use the real network. **Partially met**: a user on another computer can build from a
source checkout and use the real, live network today (see README "Try the live node"); the
published `npm install -g` path is still planned (package depends on two unpublished
workspace packages).

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

## Owner-directed board phases

**Two phase sequences exist and must not be confused (spec §179).** §176's phase numbers are
_release_ phases (Phase 8 → v0.1, Phase 9 → v0.2, Phase 10 → v0.3, Phase 11 → v0.4, Phase 12
→ v1.0) and are referred to below by **release number**. `tasks.md`'s Phase 9/10/11/12/13/14
are _board_ phases — owner-requested work streams that continued the task-board sequence past 8. A board phase number is not a §176 release phase.

### Board Phase 9 — site, media, packaging

**Status: implemented.** The VitePress site is live
(`https://patches-site.pages.dev`), TUI screenshots/GIFs are recorded and embedded, and the
TUI is packaged and install-verified from a tarball as `patches-social`; P9-004's Resend sender
and R2 credentials are configured. Publishing the package to npm remains an owner operation,
tracked separately from the site/media phase.

### Board Phase 10 — web + React Native clients

**Status: web resumed (owner, 2026-08-18) and landed; React Native paused.** A responsive,
production web client (`apps/web`, Vite + React 19, Connect transport) exists and enforces the
same chronological/no-scores/honest-DM rules as the TUI. Features include light/dark/custom theme switcher (`/settings/appearance`), profile wall editing (`EditWallDialog`), followers/following tabs and actor lists, inline thread replies, post card thread navigation, PWA manifest with install prompt, and mobile safe-area insets — see `apps/web/README.md`. The Connect
edge (P10-004) and [ADR 0016](../decisions/0016-connect-transport-and-client-sdk.md) are as
landed. Open: React Native (P10-002, paused / active-bug containment only under B-062) and migrating the TUI itself onto the shared
`@patches/client` SDK (P10-005).

### Board Phase 11 — social depth (Amendment B)

**Status: implemented.** Spec **§178–§195**. TUI-first: a feature is not done until it is
usable from the terminal — every item below is reachable from the TUI and Web today. See
[`docs/architecture/social.md`](../architecture/social.md) for the implementation detail.

- **Reposts and quotes** (§180) — a repost is a pointer, a quote is a post with
  `quoted_post_id`, per-post quote policy, and neither ever changes a post's feed position.
- **Tags** (§181) — write-time extraction, normalized identity, chronological tag timelines,
  tag search, tag mutes. No trending, no tag counters.
- **Communities** (§182) — `+name`, join/leave, chronological community timelines,
  moderators, rules, invites. No votes, no karma, no sort selector.
- **Direct messages** (§183) — 1:1 and groups of ≤ 8, mutual-or-accepted gating, message
  requests, block-aware, reportable, rate-limited, text-only. **Server-visible, not
  end-to-end encrypted**, and every client says so on the screen where messages are read.
  Indefinite retention is honestly published as `0` days (B-061).
- **Flair, pinned posts, walls** (§184) — post accent, border style, like glyph, wall theme,
  ≤ 3 pinned posts, profile wall editing in Web (`EditWallDialog`) and TUI (`PageBlocksEditorScreen`), all under capabilities-not-tiers: cosmetics may be capability-gated, a
  _function_ may never be paywalled.
- **Followers and following** — dedicated list screens in TUI (`ActorListScreen`, `F`/`G`, `:followers`/`:following`) and tabs in Web (`Followers`/`Following` on profile with count pills and `ActorList`).
- **Plain mode and quiet feed** (§185) — the reader's opt-out, client-side.
- **Edits with visible history, deletion, read-more folds** (§186). Scheduled posts, polls,
  and post analytics are explicitly out.
- **New notification types** (§187) — `REPOST`, `QUOTE`, `MESSAGE`, `COMMUNITY_INVITE`.

Federation mapping for all of it (§193) is a **later** stage and moves no §109 gate.
Needs owner sign-off before anyone starts: E2E DMs, community scope beyond v0, any paid
cosmetics (§195).

**Success criteria:** from the TUI alone, an actor can repost and quote, follow a tag, join a
community and post into it, hold a DM conversation they were not spammed into, edit a post
and show its history, decorate their own posts — and a second actor can turn every bit of
that decoration off for themselves without losing any content.

### Board Phase 12 — TUI interaction model, rich input, and visual system

**Status: implemented** (see `tasks.md`'s Phase 12 for the individual task list — rich input,
image rendering policy, responsive layout, thumbnail previews, and the rest of the terminal
visual-system work that Amendment B's features render through).

### Board Phase 13 — production E2EE direct messages

**Status: implemented protocol behind an unclosed external-review gate; not a production
capability** (ADRs 0020, 0025, and 0027). The default injected approval policy remains
fail-closed because no franking profile has passed independent external review. An operator may
explicitly set `E2EE_UNREVIEWED_DEV_MODE=true` only on an owner-authorized disposable test node
with no real users; `NODE_ENV` is a runtime setting rather than a deployment trust
classification. That permits exactly `patches-franking-v1`, reports an isolated-test capability
rather than an enabled/reviewed state, and requires the persistent client warning **“Unreviewed
development E2EE — for testing only; do not use for sensitive conversations.”** `E2EE_V1` is
the only conversation security mode; ADR 0030/B-095 retired `LEGACY_SERVER_VISIBLE` (enum
value reserved, never reissued) along with the plaintext machinery it depended on — see
[`docs/architecture/e2ee.md`](../architecture/e2ee.md) and
[`docs/architecture/data-model.md`](../architecture/data-model.md)'s "Phase 13" section for the
full detail; owned by a separate work stream from this document's Amendment B/C sync.

### Board Phase 14 — privacy, filters, decentralized moderation (Amendment C)

**Status: implemented, with documented follow-ups.** Spec **§196–§210** (2026-08-18). Adds, on
top of the unweakened node moderation floor: bring-your-own filters (`FilterService`, §198),
subscribable filter lists (`FilterListService`, §199), labelers and subscriber-scoped labels
(`LabelService`, §200), appealable moderation notices (`AppealService`, §201.2–§201.3), a
public anonymized moderation log and domain-policy transparency
(`ModerationService.ListModerationLog`, `NodeService.GetNodePolicy`, §201.4–§201.6), and
privacy/consent surfaces — a pre-registration notice, discoverability prefs, account export,
and self-service deletion with a grace period (`PrivacyService`, §197). 20/28 `P14-*` tasks are
landed; open follow-ups (`tasks.md`): SQL pushdown for actor/tag filter rules and PSL-based
domain matching (P14-021), a real `scopes` field for filter-list subscriptions (P14-022), a
multi-file export archive including media bytes (P14-023), purge-scope expansion to
bookmarks/reposts/community memberships/tag mutes (P14-024), an explicit privacy-notice
acknowledgement field on `RegisterRequest` (P14-025), and marking a vocabulary value
`mandatory` for the node labeler from the admin CLI (P14-026). The discoverability preferences
(`discoverable`/`indexable`/`show_in_local_feed`) are stored but **not yet enforced** by
search/feed queries — see [`docs/product/privacy.md`](privacy.md) for the honest statement of
that gap. See [`docs/architecture/api.md`](../architecture/api.md) §3a for the full RPC-level
status of each service.

### Board Phase 15 — passwordless auth

**Status: in progress (owner request, 2026-08-19).** ADR [0011](../decisions/0011-credentials-separate-from-identity.md)'s
credential model, spec §165–§168, amended by ADR [0022](../decisions/0022-passkeys.md). Adds
more ways in without weakening the credential-is-not-identity split.

- **P15-002** (done) — node policy switch `PASSWORD_AUTH=off|optional|required`
  (`AuthService.GetAuthPolicy`); clients hide password UI when off.
- **P15-003** (done) — recovery-code credential type (`RECOVERY_CODE`, 10 one-time codes,
  `RecoveryLogin`), so an SSH/passkey-only account can recover without email or a password.
- **P15-004** (done) — passkeys/WebAuthn: a `PASSKEY` credential type, `BeginPasskeyRegistration`/
  `CompletePasskeyRegistration`/`BeginPasskeyLogin`/`CompletePasskeyLogin`, web-client-only
  (`apps/web`'s `/settings/credentials` and `LoginRoute`) — see
  [`docs/architecture/auth.md`](../architecture/auth.md) §6 and ADR 0022. `apps/tui` still has no
  WebAuthn support; 0011's original CTAP2 objection is unchanged for a terminal client.
- **P15-001, P15-005, P15-006, P15-007** (open) — enabling GitHub device-flow login on the
  production node, a web "approve this login from your terminal" device-link flow, a generic
  OIDC-device-flow provider, and TUI/web credential-manager parity. See `tasks.md` for the
  current task list.

### Board Phase 16 — live bugs from owner testing 2026-08-19

**Status: implemented.** The owner-facing live-bug wave from 2026-08-19: B-040 (central auth-
token attach for TUI reads), B-041 (web BigInt session-serialization), B-042/B-043 (TUI
navigation + command-palette overlay), B-044 (web closed-node/local-tab clarity), B-045 (web
theme support + appearance settings), B-046/B-048 (TUI pane focus and `Ctrl+W h`/`Ctrl+W l`),
B-047 (TUI theme + linear mode). Every task landed with its file citations; see `tasks.md`
Phase 16.

### Board Phase 17 — scale, concurrency and harness

**Status: in progress.** Capacity planning and abuse protection are done: S-001 (`docs/
operations/capacity.md`, measured load-test plan) and S-002 (request-cost budgets, outbox
circuit-break, load-shedding) are implemented, as are the harness-efficiency work H-010
(`docs/agents/CONTEXT_ECONOMY.md`) and H-012 (mise MCP support). Open: the harness-foundation
items H-011 (nested-delegation experiment), H-013 (testkit primitives), H-014 (`packages/
harness` CLI) and H-015 — see `tasks.md` Phase 17.

### Board Phase 18 — federating social depth (ADR 0028)

**Status: implemented (local lab).** Reposts → tags → quotes federate over ActivityPub
(`Announce`/`Undo`, `Hashtag` arrays, FEP-044f + legacy fallbacks) per ADR 0028 and
`docs/architecture/federation.md` §7.6; Communities stay local and DMs/E2EE never cross the
seam (§195.2/§194). Every P18-001…011 task is landed, including the deterministic-Announce-id
reposts, remote-object fetch, inbound quote authorization, the two-node lab round trips, and
the P18-011 fed-tag ordering fix (4/4 integration examples passing). Public federation remains
gated on the readiness checklist above.

### Board Phase 19 — observability, measurement & scale hardening

**Status: in progress.** The instrumentation foundation, measurement gate and structural
hardening are substantially landed (Phase 19 tasks, `tasks.md`). Still open and explicitly
measurement-gated: the benchmark baselines themselves (P19-007) plus the scale-path ports ADR
0029 defers to them (`JobQueue` P19-013, read-through `Cache` P19-014, hybrid feed
materialization P19-015), a DM-poll cost reduction (P19-019), and migration-hardening harnesses
(P19-024/025).

### Board Phase 20 — live bugs from owner testing 2026-08-26 (web PWA)

**Status: implemented for the reported bug wave; production delivery behind B-063.** The iOS
PWA live-bug wave (B-148…B-156: nav-style preference, report-issue undo/attach/send/route
regressions, SW-update diagnosis, Pages-preview teardown, `vite-plugin-pwa` swap) is landed, and
the follow-ups B-204 (Pages-preview teardown reliability) and B-205 (the `patches-site` CD gate
never being enabled — same defect as B-198, different site) are Done on the project board. The
web client is capable; shipping the pending web/security fixes to production and verifying the
live build is tracked by B-063 (Todo).

### Board Phase 21 — web DX / robustness backlog (owner triage 2026-08-26)

**Status: in progress.** The web-DX/robustness backlog is partially landed (e.g. B-155 sonner
toast swap); the remainder is the queue named in `tasks.md` Phase 21 (PWA plugin, RQ devtools,
cross-tab session, upload retry, diagnostics persistence, route error boundaries, web vitals,
bundle-analyzer CI) and the media-upload multipart work for >100 MB files (B-160, Blocked on
B-159's abort plumbing).

---

## Post-v0.0 roadmap (§176)

Amendment A replaced the old 0.3–1.0 sequence. Identity personality (profile theme, Top 8,
guestbook) moved **earlier**, into Phase 4.5 — it's the personal-web pillar, not a post-MVP
experiment. Federation moved earlier too, with every security gate unchanged.

These are **release** phases and are titled by release number here, because `tasks.md` uses
the same numbers for a different (board) sequence — see §179 and
[Owner-directed board phases](#owner-directed-board-phases) above.

### v0.1 — two-node federation lab (§176 Phase 8)

**Status: implemented (lab).** Federation Stage F1, **local and non-public**. Two Patches nodes on one
machine: WebFinger, actor documents, inbox/outbox, `Follow`, `Accept`, `Create` (Note),
`Delete`, basic `Like`, and durable delivery through the existing outbox/jobs machinery with
bounded retries and safe duplicate delivery.

No Mastodon-compatibility goal yet. The objective is proving Patches-to-Patches federation
end to end, four releases earlier than originally scheduled, while a wrong actor/URI/delivery
assumption is still cheap to fix.

**Success criteria:** Alice on node A follows Bob on node B; Bob posts; the post appears in
Alice's home feed; Bob deletes it; it tombstones on node A.

### v0.2 — self-hostable node release (§176 Phase 9)

**Status: planned.** A published node image plus a Compose template, documented environment
variables, an upgrade/migration path, and a security contact. **Federation is disabled by
default** in a fresh node, and no proprietary dependency is required — any S3-compatible
object store, any SMTP endpoint.

**Success criteria:** an operator who has not read the source can stand up a working node
from the published image and documentation, and federate it with a second node only by
explicit choice.

### v0.3 — Fediverse interoperability (§176 Phase 10)

**Status: planned.** Federation Stage F2. Interop with Mastodon and Pixelfed: discovery
robustness, HTTP signing compatible with ecosystem expectations, remote actor caching,
remote object ingestion, retry, deduplication, blocklists, domain moderation.

### v0.4 — identity portability (§176 Phase 11)

**Status: planned.** Account migration between nodes using the seam built in Phase 1
(`actors.moved_to_uri`, `also_known_as`), with bidirectional verification required before a
move is honored, plus the full data export (profile, posts, media manifest, page document,
social graph). Export is never gated behind a capability or payment.

### v1.0 — public federation (§176 Phase 12)

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

**Status: paused (owner, 2026-08-18).** Begin only after the server contract is stable enough
to support a second client **and** board Phase 11 (social depth, spec §178–§195) has shipped
— see [Board Phase 10](#board-phase-10--web--react-native-clients) above. The transport and
SDK decision (ADR 0016) is already made and stands.

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
- [x] verify email _(where the node requires it — §165, A-028)_,
- [x] login by password,
- [x] login by SSH key,
- [x] add and revoke a second credential,
- [x] edit and visit a Page,
- [x] persist session securely,
- [x] edit profile _(A-027, A-037)_,
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

- [ ] production domain configured _(canonical application origin is now configured as
      `https://patches.social`; DNS and Fly certificate proof remain pending —
      `docs/decisions/0039-canonical-federation-origin.md` and
      `docs/operations/deployment.md`)_,
- [x] TLS works _(Fly-terminated TLS on 443, confirmed by `patches ping` over TLS against the
      live node)_,
- [x] gRPC through Fly works _(confirmed live — `h2_backend`, verified end to end with real
      accounts, see `docs/operations/deployment.md#first-deploy-2026-08-18`)_,
- [x] Managed Postgres configured _(Neon Postgres in production, A-041; cold Fly Postgres fallback retained)_,
- [x] R2 configured _(production R2 bucket and S3 credentials configured and verified live, B-031)_,
- [x] worker configured _(`worker` process group live on `patches-social`)_,
- [x] email delivery configured _(Resend API key and verified updates.allisons.dev sender configured, B-031)_,
- [x] migrations deploy automatically but explicitly _(confirmed live — `release_command`
      (`node server/migrate.mjs`) ran migrations successfully before the 2026-08-18 deploy's
      Machines took traffic)_,
- [x] secrets are not in the repository,
- [x] production health checks work _(Fly TCP check against the gRPC port passing on the live
      node; a real HTTP health check remains a documented follow-up, see
      `docs/operations/deployment.md#health-checks`)_,
- [x] structured logs work,
- [x] error monitoring works or a documented alternative exists _(structured-log-only
      alternative documented — `docs/operations/deployment.md#error-monitoring`; A-033)_,
- [x] backup strategy exists _(documented — `docs/operations/backups.md`; not yet exercised
      against the live Postgres instance)_,
- [x] restoration procedure is documented _(`docs/operations/backups.md`)_,
- [x] rate limiting exists,
- [x] integration suite passes,
- [x] smoke tests pass after deploy _(`patches ping` against `patches-social.fly.dev:443`
      returns `{"ok":true,...}`)_,
- [ ] README installation works from a clean environment _(README's "Try the live node" steps
      have not been run from a genuinely clean checkout by a third party yet)_,
- [ ] npm package install works _(needs a real registry publish — packages not yet
      published)_,
- [x] TUI works against production _(verified end to end with two real accounts on
      `patches-social.fly.dev` — register, login, post, follow, like, reply, thread,
      notifications, home feed)_,
- [x] user documentation exists _(`docs/user-guide.md`; A-034)_,
- [ ] moderation guidelines exist _(`docs/operations/moderation.md` covers admin workflow;
      public-facing community rules are a v0.0 MVP-polish item, not yet written)_.

### Federation readiness checklist

Do not publicly enable federation until:

- [x] stable canonical domain selected, _(`https://patches.social`, with no federation
      subdomain split; ADR 0039)_
- [x] WebFinger works, _(local lab, P8-001 — `apps/server/src/modules/federation/http/webfinger.controller.ts` + `services/webfinger.service.ts`)_
- [x] actors serialize correctly, _(local lab, P8-001 — `activitystreams/documents.ts` + `services/actor-document.service.ts`; covered by `activitystreams/documents.test.ts`)_
- [ ] ActivityStreams objects validate, _(no formal AS2/JSON-LD schema validation — shape-checked only, e.g. `id`/`type`/`actor` presence; `services/inbox.service.ts` + `security/bounded-json.ts`)_
- [x] inbox works, _(local lab, P8-002 — `http/inbox.controller.ts` + `services/inbox.service.ts`)_
- [x] outbox works, _(local lab, P8-002; real keyset `OrderedCollectionPage` pagination as of B-027 — `services/outbox-collection.service.ts`)_
- [x] Follow works, _(local lab, P8-002; two-node round trip — `federation-two-node.integration.test.ts`)_
- [x] Accept works, _(local lab, P8-002; two-node round trip)_
- [x] Create works, _(local lab, P8-002; two-node round trip)_
- [x] Delete works, _(local lab, P8-002; two-node round trip)_
- [x] Update semantics decided, _(A-035 — `services/inbox.service.ts` `handleUpdate`: `Update(Note)` by the post's own author edits body/stamps `editedAt`, `Update(Person)` refreshes the actor; unit-covered in `inbox.service.test.ts`)_
- [x] deliveries are durable, _(P8-004 — `FEDERATION_DELIVER` outbox jobs written atomically via `DeliveryService.enqueue` into `outbox_jobs`)_
- [x] duplicate delivery is safe, _(P8-004/P8-006 — `inbox_activities` inbound dedup by activity id + delivery idempotency key)_
- [x] retries are bounded, _(P8-004 — 12 attempts, exponential backoff, then `DEAD`; `apps/worker/.../handlers/federation-deliver.handler.ts` through `JobRunner`)_
- [x] signatures verified, _(P8-005 — draft-cavage-http-signatures-12; `signatures/http-signature.ts`)_
- [x] SSRF defenses exist, _(P8-006 — `security/safe-fetch.ts` + `security/ip-guard.ts`; `apps/server/src/common/validation/url.ts`)_
- [x] remote response sizes bounded, _(P8-006 — `safeFetch` byte cap, `MAX_INBOUND_BODY_BYTES` = 1 MiB)_
- [x] remote request timeouts exist, _(P8-006 — `safeFetch` 10 s timeout, `SAFE_FETCH_TIMEOUT_MS`)_
- [x] domain blocking exists, _(B-027 — `services/domain-block.service.ts` enforced on inbound in `InboxService`; outbound filtered at enqueue in `DeliveryService` and re-checked at delivery time)_
- [x] remote delete/tombstones work, _(local lab, same as `Delete` above — `services/inbox.service.ts` ingests remote `Delete` to a tombstone)_
- [x] moderator can block a remote server, _(B-027 — `patches-admin domain block|unblock|list`; `apps/admin/src/commands/domain.ts`)_
- [x] federation telemetry exists, _(A-036 — `federation-metrics.service.ts`: `GET /federation/metrics` (loopback-only) + periodic structured log; mirrored on `apps/worker` per B-030)_
- [x] two Patches servers interoperate, _(P8-008 — `apps/server/test/federation-two-node.integration.test.ts`, two full HTTP-Signature-signed OS-process nodes; 4 examples passing against compose Postgres as of P18-011 — runs only when `TEST_DATABASE_URL` is set, else it skips with a clear message)_
- [ ] at least one mainstream Fediverse implementation interoperates, _(F2 scope — not started; scheduled for v0.3/Phase 10, `docs/product/roadmap.md` release table)_
