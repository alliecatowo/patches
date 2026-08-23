# Ultra-minimal web design: density, radial menus, thread views, and "crafted vs vibe-coded"

**Status:** Design research feeding B-087 (radial fan-out + compact/cozy toggle), B-088
(density/action-ownership audit), B-089 (thread view flagship). No code changed.
**Verified:** 2026-08-22 (all URLs accessed this date)
**Scope:** `apps/web` parity client only. Verdicts are for patches' context: a chronological,
terminal-first social product whose web app must read as deliberately made, not defaulted.

## 1. Principles

**P1 — Minimalism without cause is just absence.** Frank Chimero: "Be wary of minimalism as
an aesthetic decision without cause"; aim for clarity, not simplicity for its own sake.
https://frankchimero.com/blog/2010/advice/ , https://frankchimero.com/blog/2015/the-webs-grain/
(accessed 2026-08-22). Ultra-minimal is justified here by the terminal-first identity: every
removal should be defensible in one sentence ("the TUI doesn't have it").

**P2 — Craft = decisions visible in defaults.** Are.na chose Arial-as-default so the interface
"wouldn't get in the way of the content" — austerity as a chosen system:
https://www.nicksimson.com/notes/2025-08-24-areal/ (accessed 2026-08-22). Linear frames quality
as "seeking the feeling of rightness": https://linear.app/now/why-is-quality-so-rare
(accessed 2026-08-22). The mono stack (`--font-mono`, apps/web/src/index.css:2) is exactly such
a committed decision — lean into it for metadata/headings/counters instead of letting sans drift.

**P3 — Density is tiered visual weight, not cramming.** Linear's refresh: "not every element…
should carry equal visual weight"; navigation recedes once you've arrived; icon _usage_ was cut;
"structure should be felt not seen." https://linear.app/now/behind-the-latest-design-refresh
(accessed 2026-08-22). Analysis: ~13px body, "information density beats whitespace… reveal
detail on hover rather than hiding behind clicks." https://blakecrosley.com/guides/design/linear
(accessed 2026-08-22).

**P4 — Typography should disappear.** Craig Mod: "the best typography goes unnoticed…
aspires to a kind of statuesque transparency"; readers aren't typographers.
https://craigmod.com/journal/ebooks/ (accessed 2026-08-22).

**P5 — Measure is a number; set it once.** 45–75 characters per line, 66 ideal (Bringhurst):
https://webtypography.net/2.1.2 ; Butterick's bound is 45–90:
https://practicaltypography.com/line-length.html ; on-screen 40–60 with leading growing with
measure: https://fonts.google.com/knowledge/using_type/understanding_measure_line_length (all
accessed 2026-08-22). A ~66ch reading column fixes "too much padding" and "weak placement"
simultaneously.

**P6 — Interaction is branding, when tuned.** Path 2.0's delight came from tuned motion
(children "just enough smaller… to indicate that they are children", quarter-turn spin-out,
snappier return); press treated the interaction itself as brand.
https://thenextweb.com/news/look-out-tab-bar-get-ready-for-paths-sharing-ui-to-be-everywhere ,
https://www.atomicdust.com/interaction-is-branding/ (accessed 2026-08-22). Micro-interactions
are a craft budget: spend them only on signature moments (like-pop, fan-out).

**P7 — Chronology and hierarchy are orthogonal.** Menéame's switch from linear to threaded
views abruptly increased reciprocity while branches stayed chronologically ordered — structure
without reordering: https://ojs.aaai.org/index.php/ICWSM/article/download/14880/14730
(accessed 2026-08-22). Compatible with Amendment B: hierarchy adds shape, never position.

## 2. Prior art: radial / fan-out menus (B-087)

| Prior art                                                                                                                                                                                                                                                         | What it showed                                                                                                                                                                              | Verdict for patches                                                                                                                                                                                 |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Pie menus, Callahan et al., CHI '88 — https://www.cs.umd.edu/~ben/papers/Callahan1988empirical.pdf (accessed 2026-08-22)                                                                                                                                          | Radial placement lowers Fitts D/S → faster seek, fewer errors; benefits concentrate on directional/orthogonal sets; sequential/arbitrary sets can suffer; screen cost grows fast with items | Our 5 items are an arbitrary set — Fitts win is weaker. Mitigate: fixed positions (never reshuffle), text labels, ≤6 items.                                                                         |
| Marking menus, Kurtenbach & Buxton — https://www.microsoft.com/en-us/research/wp-content/uploads/2016/08/marking-menus-93.pdf , https://www.tandfonline.com/doi/abs/10.1207/s15327051hci0801_1 (accessed 2026-08-22)                                              | Up to ~5 slices show no exposed-menu penalty; performance degrades as count grows; even counts internalize better                                                                           | Hard cap 6; we have 5 — correct. Don't grow the radial into general navigation.                                                                                                                     |
| Directional Fitts study, Graphics Interface '91 — https://graphicsinterface.org/wp-content/uploads/gi1991-28.pdf (accessed 2026-08-22)                                                                                                                            | Selection time varies by angle/handedness; right-side fastest for right-handers, bottom slowest                                                                                             | Right-thumb FAB ⇒ arc opens upward/leftward; compose at the fastest angle; nothing destructive in the radial (true today — keep it).                                                                |
| Path 2.0 share button, 2011 — https://www.theverge.com/2011/11/30/2599934/path-2-0-hands-on-new-ui-sharing-options-150-friends , https://techcrunch.com/2011/11/29/paths-second-iteration-is-less-photosharing-and-more-everything-sharing/ (accessed 2026-08-22) | Six children fly out on a quarter turn; children smaller than parent; "+" rotates to "×"; reviewers reported fewer mis-touches than tab bars                                                | `ThumbNavFab.tsx` already has labels + badge + Escape + backdrop-close (more than Path had). Adopt the parent/child size cue and +→× rotation; keep stagger subtle; honor `prefers-reduced-motion`. |

**When radials fail** (synthesis of sources above, accessed 2026-08-22): >8 items; unlabeled
icon-only slices; positions that reshuffle; destructive actions; duplicating an existing
persistent nav.

## 3. Prior art: density modes (B-087 toggle)

| Product                                                                                                                                               | Mechanic                                                                                                                       | Verdict for patches                                                                                                                                                     |
| ----------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Slack Clean vs Compact — https://slack.com/help/articles/213893898-Change-how-messages-are-displayed (accessed 2026-08-22)                            | Binary theme; Compact = less whitespace + hides avatars; desktop-only, mobile follows OS font size                             | Two steps only (cozy/compact), no slider. Hiding avatars outright is wrong for a social feed where authors are content — shrink/inline instead.                         |
| Discord display settings — https://discord.com/blog/making-discord-on-desktop-look-just-right-display-settings-to-ease-the-eyes (accessed 2026-08-22) | Three UI densities; separate chat-text-size slider; compact chat starts the message on the display-name line, avatars optional | Key insight: **density ≠ type size**. Keep body size fixed (zoom/a11y territory); density changes spacing and chrome only. Name-inline-body is the right compact model. |
| MUI X Chat variant/density — https://mui.com/x/react-chat/basics/variants-and-density/ (accessed 2026-08-22)                                          | Variant independent of density; compact moves timestamps from below-message into group header                                  | In compact, move counts/time into PostCard's header row and drop them from the action row — reclaim vertical space without shrinking type.                              |

**Typography implication** (sources above, accessed 2026-08-22): implement as
`data-density="compact|cozy"` on the timeline root driving spacing/chrome only (row padding
1rem→0.5rem, avatar 44px→inline or 24px, gaps halved). Body stays ≥15–16px, line-height
~1.4–1.5. No third step.

## 4. Thread-view prior art (B-089)

- **HN-style flat-yet-hierarchical:** visible indentation carries structure inside one scroll.
  Coding Horror argues deep indentation "pushes discussion off your screen" (scrolling right is
  unnatural) and endorses hard depth caps — Stack Exchange allows effectively one level:
  https://blog.codinghorror.com/web-discussions-flat-by-design/ (accessed 2026-08-22).
  Our `maxDepth: 1` fetch + single CSS indent (ThreadRoute.module.css `.replies`) is a
  principled version of this cap — keep it.
- **Threading advocates' core argument:** precise attribution ("who replied to whom"); flat
  views force "@name: I meant X not Y" hacks, and "it's easy to create a flat view out of a
  threaded forum, but impossible to do the reverse":
  https://web.hypothes.is/blog/threading-when-and-why/ (accessed 2026-08-22). At depth 1 we
  preserve reply-target info via the sticky "Replying to @handle" header + per-reply anchors
  (both already present in ThreadRoute.tsx).
- **Mail clients:** nested-list threading devolved into disclosure-triangle management and
  mode-switching; Apple Mail's conversations model (flatten under subject, keep chronology)
  won — Chris Hynes' Mail threading retrospective:
  https://substack.techreflect.org/p/message-threading-in-mail-with-column-view
  (accessed 2026-08-22). Lesson: modeless, always-on structure beats a special thread mode.
- **Reddit collapse patterns** tax every reader with curation labor on huge trees (Coding
  Horror, above). With depth capped at 1, collapse controls would be affordances without a
  problem — do not add them at v0.
- **Accessibility guardrail:** expose hierarchy via semantics, never indentation alone;
  deep-linked replies should receive focus/highlight after load:
  https://uxpatternsguide.com/patterns/threaded-discussion/ (accessed 2026-08-22). Our
  `replyAnchor` divs give fragment targets but no focus/highlight treatment yet.

## 5. Anti-patterns: "vibe-coded" tells (B-088)

Sources: The Crit's design diagnostic — card soup, generic gradients, weak hierarchy, missing
states, "mismatched density" (https://thecrit.co/resources/does-your-ai-built-app-look-vibe-coded ,
https://thecrit.co/resources/vibe-coding-design-guide , accessed 2026-08-22); the Tailwind
indigo-500 genealogy — models average the training data, so defaults read as machine-made
(https://blog.authon.dev/why-every-ai-built-website-looks-the-same-blame-tailwinds-indigo-500 ,
accessed 2026-08-22); the AI-slop checklist — emoji-as-icons is "one of the fastest visual
tells", plus glow hovers and identical card grids in every section
(https://dev.to/ail_akram_dcc5063c428734b/how-to-tell-if-a-website-was-vibe-coded-a-developers-checklist-lel ,
accessed 2026-08-22); and the anti-slop rulebook — 60/30/10 palette discipline, spacing on a
4/8 scale, cards separated by space before borders, APCA contrast
(https://vibecodekit.dev/ai-slop-design , https://www.vibe0.com.au/blog/how-to-tell-if-a-website-is-vibe-coded ,
both accessed 2026-08-22).

Exposure audit of `apps/web` against that list:

| Tell                                                                       | Our exposure                                                                                                                                | Action                                                                                                                                                            |
| -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Uniform card grids / card soup                                             | None — timelines are borderless hairline-divided rows (PostCard.module.css `.card`)                                                         | Keep; resist boxed-card redesigns. Nested quote container is semantic — acceptable.                                                                               |
| Gradient soup, glassmorphism, glow hovers                                  | None; flat tokens only                                                                                                                      | Keep it flat.                                                                                                                                                     |
| Emoji-as-icons                                                             | None — real icon set (`components/icons/Icons.tsx`)                                                                                         | Keep; never use emoji as section/action icons.                                                                                                                    |
| Excessive rounding/shadows                                                 | Mild: pill submit button + `translateY(-1px)` hover lift                                                                                    | Restrict lift to primary CTAs; shadows already tokenized (`--shadow-sm                                                                                            | md  | lg`). |
| Colored left-border strip ("single most reliable AI tell" per vibecodekit) | Present but _semantic_: focused root post marker (ThreadRoute.module.css `.root` inset shadow); `.replies` thread line is a border-left too | Rule: left strips mark state only (focused root), never decoration. If B-089 wants a stronger focus cue, prefer a background tint over more strips.               |
| Default purple                                                             | `--accent: #6b46c1` sits near the notorious default hue band                                                                                | Don't panic-change hue; instead make the choice legible elsewhere (mono metadata, flat surfaces). A committed system defeats an averaged one (authon.dev, above). |
| Missing states                                                             | Good: invite-only panel, CW/filter states, upload failure states exist                                                                      | Audit remaining empty/error states during B-088 — designed states are craft proof (The Crit).                                                                     |
| Spacing off-scale                                                          | Ad-hoc inline paddings (ThreadRoute.tsx loading/error `<p style={{padding:'1rem'}}>`, RootLayout help-dialog Close button styles)           | Move onto the 4/8 scale via CSS modules; delete inline styles.                                                                                                    |

## 6. Findings mapped to files (B-088/B-089 specifics)

**F1. PostCard action row overload + duplicate ownership**
(`components/PostCard.tsx:437-498`). Six inline controls: reply, repost, like (all with
counts), bookmark (icon-only), quote (uses **EditIcon**, colliding with "Edit post" in the ⋯
menu), share. Share duplicates the ⋯ menu's "Copy post link" AND its own fallback is clipboard
copy — three affordances, two outcomes. Per P3 (unequal weight) and the MUI compact pattern:
keep reply/repost/like as the counted row; **remove the inline Share button and the standalone
Quote link** — move Quote into the ⋯ menu with a distinct glyph, keep copy/share solely under ⋯.
Give bookmark a visible on-state color or move it to ⋯ (icon-only among counted buttons breaks
the row's rhythm).

**F2. Three affordances to open a thread** (`PostCard.tsx:215-226` handleCardClick, time-link,
reply-count link all navigate to `/p/:id`). Ownership rule worth codifying: card click =
navigate (mobile ergonomics), timestamp = permalink, action row = act on the post, ⋯ = meta.
That's fine once F1 removes the duplicates inside the row; document it in PostCard's docstring.

**F3. Sidebar carries rare admin chrome permanently** (`routes/RootLayout.tsx:61-128`): nine
NavLinks including Appeals and Mod log — which are _also_ duplicated in the profile fallback
menu (RootLayout.tsx:191-197, 228-234). Compose appears twice (nav item :79 + big button :131).
Per Linear's receding-nav principle: remove Appeals + Mod log from the primary group (they live
in ProfileMenu), drop one of the two compose entries. Fix guest inconsistency: Register NavLink
has no icon while Sign in does (:163-169).

**F4. Two mobile menus own overlapping destinations**: ThumbNavFab radial has
messages+notifications+home; ProfileMenu sheet also has Messages (+ Mod log/Bookmarks/etc).
Radial should be creation + top destinations only; if a destination lives in the radial it must
not reappear in the sheet, or ownership blurs. Pick per destination and write it down.

**F5. ThreadRoute polish for B-089** (`routes/ThreadRoute.tsx`, module css): keep maxDepth:1 +
chronology + anchors; add focus/highlight styling when `#fragment` lands on a reply
(uxpatternsguide, §4); keep the sticky replying-header (it's the attribution substitute);
"N replies" heading and load-more-as-text are correctly minimal (HN convention). Composer char
counter can hide until near-limit ("reveal detail on demand", crosley guide) — counter always-on
is chrome without information most of the time.

**F6. Density toggle home** (`components/PostTimeline.tsx` renders PostCard rows): implement
`data-density` on PostTimeline's root, CSS-module variants per §3. Compact moves counts into
header row (MUI pattern), shrinks avatar, halves padding; cozy unchanged. No font-size changes;
persist per user; both routes (HomeRoute tabs, ThreadRoute replies) inherit automatically since
both render PostCard.

**F7. Element placement / reading column** (`RootLayout.module.css` `.main`, PostCard rows).
The owner's "weak element placement" maps directly to P5: nothing currently pins the measure,
so wide viewports stretch post bodies past any comfortable line length while padding accumulates.
Fix: cap the timeline/thread column at ~66ch (`max-width: 66ch; margin-inline: auto` on
`.main`'s inner container), left-align within it, and let the sidebar absorb remaining width.
Placement then follows from one number instead of per-route fiddling. Keep the mono metadata
column rhythm (name · handle · time) on a single baseline row — it already is in PostCard's
headerRow, so this is mostly a container fix, not a component rewrite.

**F8. HomeRoute tabs are correctly quiet — protect them** (`routes/HomeRoute.tsx:68-105`).
Two text tabs plus a one-line explainer is the right weight (P1); the invite-only panel is a
designed state, not an error dump (anti-slop "missing states" pass). Only change worth making:
the explainer can render once per session rather than persisting above every scroll, freeing
vertical space without removing information.

## 7. What to REMOVE (explicit list)

1. Inline Share action button on PostCard (duplicates ⋯ → Copy post link).
2. Standalone Quote link from the action row (collides with Edit glyph; move under ⋯).
3. Appeals + Mod log from the desktop sidebar primary nav (duplicated in ProfileMenu).
4. Either the sidebar Compose nav item or the "New Post" button (keep one).
5. Always-visible char counter (show within ~20% of limit).
6. Inline `style={{ padding: '1rem' }}` placeholders in ThreadRoute.tsx (tokenized classes).
7. Any future collapse/thread-mode UI until depth grows past 1.

## 8. Sources

All fetched and verified 2026-08-22; URLs appear inline next to each claim above.
Primary groups: Chimero essays; Craig Mod e-book typography essay; Are.na/Areal note;
Butterick / webtypography.net / Google Fonts knowledge on measure; Linear refresh +
quality essays + third-party analysis; Slack help + Discord blog + MUI X chat density docs;
Callahan CHI'88, Kurtenbach marking-menu papers, Graphics Interface '91; Path 2.0 coverage
(Verge, TechCrunch, TNW, Atomicdust); threading literature (Hypothesis blog, Coding Horror,
Menéame ICWSM paper, Mail-threading retrospective, UX Patterns Guide); vibe-coding tell
diagnostics (The Crit ×2, dev.to checklist, authon.dev, vibecodekit, VibeZero).
