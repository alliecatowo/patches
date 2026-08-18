# 0012. Patches Pages are a portable declarative document, rendered by clients

**Status:** Accepted
**Date:** 2026-08-17

## Context

"Personal identity matters" (§4.4) was the vaguest of the original principles: a list of
someday-features (profile theme, profile song, guestbook, Top 8) with the sensible guardrail
"do not implement arbitrary HTML/CSS". Personal-web revival is now a first-class product
pillar (§175), so the guardrail needs to become an architecture.

The forcing question: what _is_ a Patches Page, given that the primary client is a terminal?
Anything HTML-shaped is unrenderable in Ink without writing a browser. Anything
terminal-shaped is untranslatable to the web renderer that comes later. And the obvious
"just let people write components" answer means shipping a code execution engine to every
client — the exact thing §111 and §153 already forbid for feed plugins, and a far worse idea
when the code arrives from strangers whose page you are visiting.

There is also a persistent factual confusion worth killing here: Ink does not render HTML. It
renders a React component tree to a terminal through Yoga flexbox layout. There is no DOM to
reuse, so a markup-shaped format buys nothing.

## Decision

A Page is a **portable declarative document**: versioned, inert data, stored on the actor's
node, rendered by clients. See `INITIAL_VISION.md` §170–§172 and
`docs/architecture/pages.md`.

- Shape: `PatchesPage { version, theme, pages: [{ slug, title, blocks: [...] }] }`, with a
  fixed block vocabulary (`Text`, `Markdown`, `Image`, `Links`, `Posts`, `Gallery`,
  `Friends`, `TopEight`, `Guestbook`, `NowPlaying`, `Badges`, `AsciiArt`, `Spacer`, `Hero`).
- Storage: `pages`, `page_revisions` (immutable snapshots), `page_assets`,
  `guestbook_entries`.
- **The server never renders.** No server-side HTML, template engine, or theme engine. The
  server stores, validates, versions, and serves.
- **No user-authored executable code in the portable format, in any client, ever** — no
  React, MDX, JS, template language, or expression evaluator.
- Blocks are a flat list; no recursive nesting in v1.
- **Strict on write, lenient on render**: the server validates strictly against the declared
  schema version and rejects unknown blocks and fields; renderers ignore block types they
  don't support and show a placeholder instead of failing the page.
- Images must be Patches media (§27–§32); arbitrary remote URLs are never fetched or
  embedded. Links are validated per §104. Markdown renders from a safe subset with raw HTML
  passthrough disabled.
- A later **advanced web-only mode** may allow user-authored HTML/CSS/assets, but only on an
  isolated origin (`*.patches.page` / a dedicated usercontent domain), never same-origin with
  the app, under a strict CSP including `script-src 'none'`, with no access to any Patches
  session or cookie. The TUI is unaffected.
- Federation exposes the page manifest as a Patches extension property on the actor document;
  a plain Fediverse server gets an ordinary actor and loses nothing.

## Consequences

- One document serves every client. The Ink renderer and the future React DOM renderer are
  two views of the same data, not translations of each other — which is what makes "clients
  are powerful" (pillar 5) more than a slogan.
- Pages are portable by construction: exportable, migratable between nodes, and renderable by
  a third-party client without a rendering contract with us.
- The expressiveness ceiling is the block vocabulary. People _will_ want a block we didn't
  ship. That's the deliberate trade: adding a block is a schema version and a renderer case
  in each client, and the lenient-render rule means older clients degrade instead of
  breaking. This is slower than "just let them write code", and it is the point.
- Rendering someone else's page can never execute their code. Visiting a page stays as safe
  as reading a post.
- Terminal-specific hazards move into the renderer contract: control characters and escape
  sequences must be stripped from every user-supplied string, or a Page becomes a way to
  scribble on someone else's terminal.
- Guestbooks are a spam and abuse surface with decades of precedent. They ship with block
  awareness, rate limiting, reportability, and owner/moderator removal, or they don't ship.
- `page_revisions` costs storage in exchange for recoverable edits and a moderation audit
  trail — a good trade at the document sizes involved (≤ 64 KiB).
- The advanced HTML mode is a real future security project (isolated origin, CSP, storage
  accounting), not a flag flip. Writing its constraints down now prevents it from being
  retrofitted onto the app origin later by someone in a hurry.

## Alternatives considered

- **Server-rendered profile themes.** Rejected: puts presentation in the server, contradicts
  pillar 5, and produces output the TUI cannot consume.
- **HTML/CSS as the portable format.** Rejected: unrenderable in Ink without a browser
  engine, and it drags the entire HTML sanitization problem into the terminal client.
- **User-authored React/MDX components.** Rejected: ships a code execution engine to every
  client and directly contradicts §111/§153. Sandboxing untrusted UI code in a terminal
  client is not a v0-scale problem — it may not be a solvable one.
- **Markdown-only pages.** Rejected as insufficient: no theme, no Top 8, no guestbook, no
  structure a renderer can lay out intelligently. Markdown survives as one block type.
- **Store pages client-side only.** Rejected: they'd be invisible to visitors, unfederatable,
  and lost with the machine.
