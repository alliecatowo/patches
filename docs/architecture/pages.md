# Patches Pages

Every actor has a **Page**: a personal site expressed as a portable declarative document,
stored on the actor's node and rendered by clients. Source of truth: `INITIAL_VISION.md`
§170–§172 (Amendment A), ADR
[0012](../decisions/0012-patches-pages-portable-declarative.md).

**Status: implemented (Phase 4.5).** The document schema/validator (`packages/domain`),
storage (§3), `PageService` (§4, `apps/server/src/modules/pages/`), the Ink renderer
(`apps/tui/src/pages/render/`), `patches visit`, and nameplate rendering (P45-004..007) are
all implemented and tested. `B-023`'s structured block-by-block page editor (the TUI editor
was originally `$EDITOR`-on-raw-JSON only) and `B-024`'s `Friends` block data source (a bulk
"list mutual follows" RPC) have since landed too — see §6.

Pages are the personal-web pillar (§175, pillar 3). They are not a profile decoration — the
profile is what you see _next to a name_; a Page is what you _visit_. Inline identity
presentation is the nameplate, documented in §173 and summarized in §8 below.

## 1. The shape of the decision

Three constraints determined the format:

1. The primary client is a terminal. **Ink does not render HTML** — it renders a React
   component tree to a terminal via Yoga flexbox layout. Any markup-shaped format would be
   unrenderable without shipping a browser engine.
2. A web renderer comes later and must consume the _same_ data, not a translation of it.
3. Visiting someone's page must never execute their code.

Hence: a versioned declarative document that is **inert data**, validated by the server,
rendered by whichever client is asking.

**The server never renders.** No server-side HTML, no template engine, no theme engine. The
server stores, validates, versions, and serves.

## 2. Document schema

```jsonc
{
  "version": 1,
  "theme": {
    "accent": "#c678dd",
    "background": "default",
    "foreground": "default",
    "border": "round", // single | double | round | ascii | none
    "avatarStyle": "block",
  },
  "pages": [
    {
      "slug": "index",
      "title": "allison",
      "blocks": [
        { "type": "Hero", "title": "hi, i'm allison", "subtitle": "techno + terminals" },
        { "type": "Text", "body": "..." },
        { "type": "TopEight", "actors": ["@bob", "@carol@other.node"] },
        { "type": "Guestbook", "limit": 20 },
      ],
    },
  ],
}
```

### Blocks (v1 vocabulary)

| Block        | Renders                                    | Phase |
| ------------ | ------------------------------------------ | ----- |
| `Text`       | plain text paragraph                       | 4.5   |
| `Markdown`   | safe Markdown subset, no raw HTML          | 4.5   |
| `Links`      | labeled link list, URLs validated per §104 | 4.5   |
| `Posts`      | the actor's recent posts, chronological    | 4.5   |
| `TopEight`   | a chosen handful of actors                 | 4.5   |
| `Friends`    | mutuals / follow list excerpt              | 4.5   |
| `Guestbook`  | recent guestbook entries + sign action     | 4.5   |
| `Badges`     | server-attested badges only (§173)         | 4.5   |
| `AsciiArt`   | fixed-width art, control chars stripped    | 4.5   |
| `Spacer`     | vertical space                             | 4.5   |
| `Hero`       | title/subtitle banner                      | 4.5   |
| `Image`      | one Patches media item                     | **5** |
| `Gallery`    | several Patches media items                | **5** |
| `NowPlaying` | a text status line                         | later |

`Image` and `Gallery` are defined in the schema at Phase 4.5 but render as a **placeholder**
until the Phase 5 media pipeline exists (§176). The schema may lead the pipeline; the
renderer may not fake it.

### Rules

- Blocks are a **flat list**. No recursive nesting in v1 — recursion is renderer complexity
  and a denial-of-service surface with no v1 payoff.
- **Strict on write, lenient on render.** The server validates strictly against the declared
  `version` and rejects unknown block types and unknown fields. A renderer ignores block
  types it doesn't support and shows a visible placeholder rather than failing the page.
  This is what lets clients ship on different schedules without breaking each other.
- Validation lives in `packages/domain` so the server, the TUI editor, and any future web
  editor share one definition.

### Limits (enforced server-side, published via `GetNodeInfo`)

| Limit               | Value                                               |
| ------------------- | --------------------------------------------------- |
| Serialized document | ≤ 64 KiB                                            |
| Sub-pages per actor | ≤ 32                                                |
| Blocks per sub-page | ≤ 128                                               |
| Text per block      | ≤ 8 KiB                                             |
| Guestbook entry     | ≤ 500 characters                                    |
| Page asset storage  | `capabilities.maxSiteStorageBytes`, per node (§174) |

## 3. Storage

| Table               | Purpose                                                                                    |
| ------------------- | ------------------------------------------------------------------------------------------ |
| `pages`             | one row per actor; points at the current revision                                          |
| `page_revisions`    | immutable document snapshots — a bad edit is recoverable and moderation has an audit trail |
| `page_assets`       | media attached to a page, counted against the storage capability                           |
| `guestbook_entries` | visitor entries, moderatable                                                               |

Columns are in [`data-model.md`](./data-model.md).

## 4. PageService (server implementation)

**Status: implemented** (P45-003) — `apps/server/src/modules/pages/`. Full RPC contract in
[`api.md`](./api.md). Notable behavior beyond the wire contract:

- **Block-aware, uniformly** (spec §62). `GetPage`, `ListGuestbook`, and `SignGuestbook` each
  report the same `PAGE_NOT_FOUND` for a nonexistent actor, an actor with no page yet, _and_
  a blocked-either-direction caller — never a `PERMISSION_DENIED` that would leak which case
  applies to a blocked caller.
- **`GetPage`'s `document` bytes are the raw stored revision**, re-serialized as-is rather
  than round-tripped back through `packages/domain`'s types. A revision was already validated
  strictly at write time; re-parsing on read would risk silently dropping fields written by a
  _newer_ schema version this server doesn't recognize (spec §171's forward-compatibility
  requirement). Only the convenience `theme` extract on the response is derived through
  `packages/domain`'s lenient parser, and degrades to empty rather than failing the read.
- **`SignGuestbook` is rate-limited on two independent buckets** — the caller's network peer
  and their actor id (`GuestbookRateLimitService`) — because unlike `ModerationService`'s
  report rate limit, `SignGuestbook` always has an authenticated actor behind it, so both
  signals are meaningful.
- **One guestbook per page, not per sub-page.** `ListGuestbookRequest`/`SignGuestbookRequest`
  carry a `slug`, but `guestbook_entries` is keyed on `page_id` only (`page.entity.ts`) — there
  is no per-sub-page guestbook yet, even though a `Guestbook` block could in principle appear
  on more than one sub-page. `slug` is validated on every call so a future multi-guestbook
  schema change doesn't also need a wire change, but today it only affects
  `GetPageResponse.active_slug`.
- **`RemoveGuestbookEntry` is owner-only today** — moderator removal is a documented follow-up
  (`B` backlog), not yet implemented.
- **`ReportGuestbookEntry` reuses `reports.subject_type = 'GUESTBOOK_ENTRY'`** (P45-003) rather
  than a second reports table, and is not itself rate-limited (only `SignGuestbook` is) — the
  proto's own doc comment on `ReportGuestbookEntry` doesn't call for one, unlike
  `SignGuestbook`'s.

## 5. Addressing

```bash
patches visit @allison             # their page, index slug
patches visit @allison/links       # a sub-page
patches visit @carol@other.node    # a page on another node (federation)
```

Web, later: `allison.patches.page`.

## 6. Rendering

```text
                 PatchesPage document (data)
                            |
             +--------------+--------------+
             |                             |
        Ink renderer                 React DOM renderer
        (apps/tui, Phase 4.5)        (web, later)
```

Both renderers consume the same document; neither is privileged, and neither is a translation
of the other. A third-party client can render a Page without any rendering contract with us —
that is what makes the format portable rather than merely stored.

The Ink renderer degrades by terminal capability the same way the rest of the TUI does
(truecolor → 256 → 16 → none), and a page must remain readable at every level.

### TUI implementation (P45-004..007)

`apps/tui/src/screens/PageScreen.tsx` is the entry point: `v` on a `ProfileScreen` opens the
viewed actor's page, `g v` opens the caller's own, and `patches visit @handle[/slug]`
(`apps/tui/src/cli/args.ts`) launches the TUI straight onto a page, skipping `connect`. One
`GetPage` call fetches the whole document (every sub-page); `[`/`]` switches sub-pages
entirely client-side, no re-fetch.

`apps/tui/src/pages/render/blocks.tsx`'s `PageBlocksView` renders every §171 block type
(`Text`, `Markdown`, `Image`, `Links`, `Posts`, `Gallery`, `Friends`, `TopEight`, `Guestbook`,
`NowPlaying`, `Badges`, `AsciiArt`, `Spacer`, `Hero`), plus `packages/domain`'s lenient-parse
`Unknown` placeholder for a block type this client doesn't recognize — never a failed page. A
few notes on specific blocks:

- **`Image`/`Gallery`** render through the exact same `@patches/terminal-media` path a post
  attachment uses (`components/MediaAttachments.tsx`) — Kitty inline when the terminal and a
  media session support it, the spec §75 fallback box otherwise. P5-003 landed in the same
  change as the renderer, so this is the real thing rather than the static placeholder P45-005
  originally scoped.
- **`Posts`** fetches the page owner's recent posts via `ListActorPosts` and renders them with
  the same `PostRow` a timeline uses (no drill-into-thread yet from inside a page — a
  documented follow-up, not this task's scope).
- **`TopEight`** resolves each `@handle` via `GetActorByHandle` and renders with `Nameplate`;
  a `@handle@remote-node` reference (federation is a seam, not implemented) renders as plain
  sanitized text rather than attempting a lookup that would always fail.
- **`Friends`** renders mutual follows via `SocialGraphService.ListMutualFollows` (`B-024`) —
  a self-join on `follows`, keyset-paginated, called through `PatchesApi.listMutualFollows`
  (a public read, no session required) from `apps/tui/src/pages/render/blocks.tsx`.
- **`Guestbook`** fetches via `ListGuestbook`; `s` (only shown/available when a `Guestbook`
  block is present and the viewer has a session) opens an inline compose line, `Enter` calls
  `SignGuestbook`, and the block re-fetches.
- **`Links`** entries across every `Links` block on the current sub-page are flattened into
  one `j`/`k`-navigable list; `Enter` opens the selected one with the OS default handler
  (`apps/tui/src/pages/open-link.ts`, the same argument-array-only spawn convention as `o` on
  a media attachment — spec §76).

Editing (`e`, shown only to the page's owner) is the `$VISUAL`/`$EDITOR` raw-JSON round trip
from §172/P45-006's "or raw JSON in `$EDITOR`" option: `apps/tui/src/pages/editor.ts` writes
the current document to a temp file, hands the terminal to the editor via a blocking,
argument-array-only `spawnSync` (never through a shell), and re-reads the result. Ink keeps
holding the alternate screen throughout — this only looks right on return because editors that
matter here (vim, nano, emacs -nw) enter and restore their _own_ alternate screen; an `$EDITOR`
that doesn't would leave visual debris until the next full Ink re-render. The result is
validated with `packages/domain`'s `parsePageStrict`; a validation error (or invalid JSON)
keeps the previous document on screen, shows the error, and persists the unsaved edit to a
draft file (`apps/tui/src/pages/draft-store.ts`, same `XDG_DATA_HOME` pattern as a compose
draft) so pressing `e` again resumes from exactly what was typed rather than losing it. The
**structured** block-by-block editor P45-006 also scoped ("add/remove/reorder … OR as raw
JSON") is deferred — `B-023`.

Nameplates (P45-007): every place an actor's name renders in the Pages surface —
`TopEight`, `Guestbook` entries — goes through the shared `Nameplate` component, same as
`PostRow`/`SearchScreen`/`NotificationsScreen`/`ProfileScreen` elsewhere in the TUI.

## 7. Security

**No user-authored executable code in the portable format, in any client, ever.** No React,
MDX, JS, template language, or expression evaluator. This is §111's "feed definitions are
data, not code" and §153's prohibition on remote JS plugins, applied to the personal web.

- **Images must be Patches media** (§27–§32). Arbitrary remote image URLs are never fetched
  or embedded — that is an SSRF vector, a tracking vector, and a visitor IP leak.
- **Links** are validated per §104: `http`/`https` only; `javascript:`, `data:`, `file:`
  rejected.
- **Markdown** renders from a safe subset with raw HTML passthrough disabled.
- **Control characters and escape sequences are stripped from every user-supplied string.**
  Otherwise a Page becomes a way to scribble on a visitor's terminal — the terminal-native
  equivalent of XSS. Themes and nameplates must not be able to break layout or write outside
  the block being rendered.
- **Guestbooks are hostile input.** Entries are plain text, blocked actors cannot sign,
  creation is rate-limited (§102) and reportable (§64), and both the page owner and
  moderators can remove entries. Guestbooks have decades of spam precedent; they ship with
  these controls or they don't ship.

### Advanced web mode (later, web-only)

A future capability may allow user-authored HTML/CSS/assets. If built, it **must**:

- be served from an **isolated origin** (`*.patches.page` or a dedicated usercontent domain),
  never same-origin with the application,
- carry a strict `Content-Security-Policy` including `script-src 'none'`,
- have no access to any Patches session, token, or cookie,
- count against the actor's storage capability.

The TUI is unaffected — it renders the portable document only. Writing these constraints down
now is deliberate: it prevents the mode from being retrofitted onto the app origin later by
someone in a hurry.

## 8. Nameplates (adjacent, not the same thing)

A **nameplate** (§173) is how an actor appears everywhere their name appears — timeline,
thread, mention, follower list: name color/gradient, glyph, badges, avatar frame, status line,
profile border. Stored as a bounded (≤ 2 KiB) validated document on the actor.

- Degrades by terminal capability; a nameplate is never required to read a post.
- Readability wins: contrast floor, no zero-width or bidirectional trickery, no control
  characters, bounded width, and a plain mode that strips all decoration.
- **Badges are server-attested only** (node admin, moderator, supporter, verified domain). A
  user cannot set badge text — free-text badges are handle spoofing with extra steps.
- A nameplate must never impersonate another actor's handle or a system message.
- Validated at write time against the capabilities that node grants that user (§174). On
  import from another node, unsupported decoration is preserved but not rendered, so
  migration never silently destroys someone's identity.

## 9. Federation

The page manifest is advertised as a **Patches extension property** on the actor document. A
plain Fediverse server that doesn't understand it receives an ordinary actor and loses
nothing. Pages are part of the export archive (§164), so moving nodes moves your page.

## 10. Related documents

- [`data-model.md`](./data-model.md) — page tables
- [`api.md`](./api.md) — `PageService` RPCs
- [`tui.md`](./tui.md) — Ink client architecture
- [`media.md`](./media.md) — the pipeline `Image`/`Gallery` depend on
- ADR [0012](../decisions/0012-patches-pages-portable-declarative.md), ADR
  [0014](../decisions/0014-capabilities-not-tiers.md)
