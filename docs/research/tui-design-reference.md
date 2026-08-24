# TUI design reference — density, action ownership, thread craft

**Status:** research · **Date:** 2026-08-22 (all URLs accessed 2026-08-22) · **Feeds:** tasks.md
B-090 (TUI half), B-088 (density & action-ownership audit), B-089 (thread view flagship polish).
**Scope:** external craft guidance for `apps/tui`; every claim cites its source. Companion docs:
`docs/product/tui-design-vision.md` (what it should feel like), `docs/architecture/tui-interaction-model.md`
(how it is wired). Where this note disagrees with those, they win unless an owner says otherwise.

**Bottom line:** the owner complaints (sparse-but-padded screens, icon/action overload,
overlapping functions with unclear ownership, weak placement) are the three failure modes every
good TUI already solved: (1) treat density as a feature with _rhythmic_ whitespace, not padding
(§1); (2) run a strict two-level progressive-disclosure split — 3–5 state-aware hints on the bar,
everything else behind `?`/palette, and _remove per-row instructional noise_ (§2–§4); (3) give
every verb exactly one owner and make commands act on the visible selection (§5–§6). The thread
view wins by adopting mail-client threading discipline inside our existing one-list split-pane
model (§7). Concrete file-level findings, including removals, are in §8.

Sources:

- aerc FOSDEM 2025 talk — <https://aerc-mail.org/fosdem-2025/>
- aerc(1) man page — <https://man.archlinux.org/man/aerc.1.en>
- lazygit VISION.md — <https://github.com/jesseduffield/lazygit/blob/master/VISION.md>
- lazygit `options_map.go` (bottom-bar renderer + style-guide comments) —
  <https://github.com/jesseduffield/lazygit/blob/1d0db51c/pkg/gui/options_map.go>
- lazygit options-menu origin PR #234 — <https://github.com/jesseduffield/lazygit/pull/234>
- k9s README (context shortcuts, header toggles) — <https://github.com/derailed/k9s>
- k9s issue #2556 "Don't let header be overwhelmed by context" —
  <https://github.com/derailed/k9s/issues/2556>
- k9s issue #643 (help discoverability) — <https://github.com/derailed/k9s/issues/643>
- NeoMutt threading howto — <https://docs.neomutt.org/howto/use-threads.html>
- NeoMutt "Understanding Threading" — <https://docs.neomutt.org/explanation/threading.html>
- Monospace Design TUI pattern library —
  <https://github.com/coreyt/monospace-design-tui/blob/main/monospace-tui-pattern-library.md>
- GitHub TUIKit foundations (whitespace, borders, accessibility) —
  <https://github.com/github/TUIKit/blob/main/docs/foundations.md>
- terraform-ui TUI UX guidelines (hint-bar rules) —
  <https://github.com/lmarqs/terraform-ui/blob/main/docs/reference/tui-ux.md>
- Charmbracelet crush styling recipe + `quickstyle.go` —
  <https://github.com/justindomingue/atelier-domingue/blob/main/crush-tui-styling.md> ·
  <https://github.com/charmbracelet/crush/blob/d341d84b/internal/ui/styles/quickstyle.go>
- btop README / man page (TTY degradation chain) — <https://github.com/aristocratos/btop> ·
  <https://manpages.debian.org/bookworm/btop/btop.1.en.html>
- NN/g Progressive Disclosure — <https://www.nngroup.com/articles/progressive-disclosure/>
- crouton-kit CLI/TUI UX checklist —
  <https://github.com/crouton-labs/crouton-kit/blob/main/plugins/web/skills/ux-design/references/cli-terminal-ux.md>

---

## Part 1 — principles

### §1 Density is a feature; whitespace is rhythm, not padding

Terminals beat GUIs on information density ("more content per screen than most GUIs" is listed as
a core property of the medium), and blank lines exist to separate _groups_, not to pad boxes.
GitHub's TUIKit foundations prescribe: group related items, separate groups with whitespace, and
keep panel padding at 1–2 characters with one character between border and content
(TUIKit foundations, Layout/Whitespace). Crush (Charm's own CLI) goes further: **no box borders at
all**, everything on one flat background, a fixed 2-character margin everywhere, and section
headers announced by a single blank line above (crush styling recipe). The audit rule for B-088:
a screen that is mostly blank rows should lose chrome rows or gain content, never gain margins;
padding beyond 1–2 cells must justify itself per screen.

### §2 Two-level progressive disclosure, with an obvious door

NN/g's criteria: show only the most important options initially, defer specialized ones to a
secondary surface, keep it to **two levels** (deeper hierarchies measurably lose users), get the
split right by frequency of use, and make the progression _obvious_ with strong information scent
(NN/g). For us the two levels are: level 1 = the hint row (3–5 keys valid _right now_ — design
vision principle 2 already says "the three keys that matter here, not twenty"); level 2 = `?`
help and the `:` palette. Anything that can't earn a level-1 slot must be findable in level 2 —
and level 1 must visibly advertise that level 2 exists (`? help` stays on the bar; k9s shipped
exactly this fix after users reported `?` was undiscoverable, k9s #643).

### §3 The hint bar is a context-filtered, state-aware contract

The cross-tool consensus on footer/hint bars (Monospace calls it the mandatory "Footer Command
Bar"): it is always visible, it **changes when focus or mode changes**, it shows **only actions
valid in the current context**, labels are verbs, and no task-critical command may be hidden if
the bar is the only discoverability surface (Monospace pattern library). terraform-ui codifies the
sharpest version of this: hints **must be state-aware** — loading shows only `q back`, error shows
`^r retry` + `q back` — and "**never show keys that don't work in the current state**"; movement
keys are not hinted at all because scroll indicators teach them implicitly; inline hints sit next
to the element they act on and never duplicate the bar (terraform-ui §13). aerc makes bindings
per-context (`[messages]`, `[view]`, `[compose::review]`…) and exposes the current context's keys
via `?` → `:help keys` (aerc FOSDEM 2025; aerc-config). k9s' shortcuts swap to match the focused
resource type — pods vs containers show different keys (k9s README via kodekloud walkthrough).

### §4 Disabled ≠ hidden; truncation ≠ silence; accent ≠ default

lazygit's VISION: don't require memorisation — when mid-rebase, prominently surface the one key
that matters now; and prefer **disabling menu items over hiding them** so muscle memory survives
(VISION.md Discoverability). Its bottom-bar code encodes a written style guide: only bindings with
`DisplayOnScreen && !IsDisabled()` render; most keys use the default muted colour, and **colour is
reserved for a key you likely want in the current mode** (cherry-pick paste shown cyan); overflow
ends in an explicit `…`, never silent clipping (options_map.go STYLE GUIDE comments +
formatBindingInfos). k9s hit the opposite failure: long cluster names crowded out the shortcut
header at 80 columns, so header sections became toggleable (`Ctrl+e`, `headless`) — a warning that
chrome rows are a budget shared with discoverability (k9s #2556).

### §5 One verb, one owner; commands act on the selection

Monospace's "Object-Local Actions": primary commands apply to the current selection without extra
targeting steps, confirmations name the affected object, and global actions are limited to truly
global scope (pattern library). Its "Focused Surface" pattern adds: exactly one interactive region
owns the keyboard, moving focus changes the hint scope, and selection vs pane-focus must be
distinguishable without colour (pattern library) — which is what our `Tab` focus ring + `▌`
gutter already implement. The corollary for the audit: if two handlers can fire from one
keypress, ownership is broken regardless of which behaviour you intended (see §8, `R`). lazygit's
key-set consistency rule: a key's meaning stays stable across sibling screens, and the UI must
make it obvious when the active key set changes (pattern library, Key Set Appendix).

### §6 Hierarchy comes from weight levels, not more colour

Crush ships a four-level foreground hierarchy (focused > normal > labels > hints) with keymaps
rendered dim, keys and descriptions separated by `·`, no bold, no borders (crush recipe;
quickstyle.go's `fgMoreSubtle`/`fgSubtle`/`fgMostSubtle` ladder). This validates our theme token
ladder (`text`/`muted` + bold-for-focus): counts, timestamps and hints should be _one_ dim level,
and nothing on a post row may be louder than the body. btop is the cautionary tale in reverse —
its richness works because gradients and colour carry data, not decoration, and it maintains a
full TTY theme + `force_tty`/`low-color` degradation chain so the same layout reads in 16 colours
(btop README/man). Decoration that cannot survive degradation doesn't belong.

### §7 Thread/conversation craft: steal from mail clients

NeoMutt's threaded index is the canonical terminal conversation model: tree-drawing characters
mark reply depth in the index itself; children do **not** repeat the parent's subject
(`$hide_thread_subject`); collapsing hides descendants behind a hidden-message count (`%M`);
uncollapsing jumps straight to the first unread message (`$uncollapse_jump`); and whole families
of verbs operate thread-scoped (delete-thread, jump-to-parent `P`, next/prev thread `^N/^P`,
collapse-toggle `Esc v`) (NeoMutt threading docs ×2). Translation to Patches: depth glyphs live in
the list (we have `rowIndent` but no glyph), the parent is reachable by movement (we fixed this —
one list), unread/new replies deserve a jump target, and "reply to X" must always name X. aerc's
message-viewer keeps actions like reply/delete available in both index and viewer contexts
(aerc tutorial) — i.e., the detail pane must not strip the object-local verbs.

### §8 Accessibility and plain mode are rendering modes, not afterthoughts

Screen readers read the terminal linearly, so decorative noise (box-drawing, ASCII art, ornamental
icons) should vanish and visual indicators need text alternatives ("✓" also means "(current)";
borders switch off) rather than descriptions bolted on (TUIKit Accessibility). Test with
`NO_COLOR=1` and `TERM=dumb`; mouse is additive, never required; `q`/`Esc`/`Ctrl+C` always work —
never trap the user (crouton-kit checklist). Our plain mode already follows "same characters of
content, decoration removed"; the discipline to keep: new decoration (quote boxes, label chips)
must ship its plain-mode twin in the same change, and measured heights stay identical between
modes (interaction model §3.6 restraint rule).

---

## Part 2 — findings mapped to our screens

### F1. `apps/tui/src/components/PostList.tsx` + all five list screens — `R` fires twice (ownership bug)

Every list screen keeps a legacy local handler `if (input === 'R') refresh()`
(`ThreadScreen.tsx:144`, `HomeScreen.tsx:59`, `LocalScreen.tsx:57`, `ProfileScreen.tsx:331`,
`BookmarksScreen.tsx:52`, `PostHistoryScreen.tsx:94`) while `PostList.handleKey` maps
`R → onToggleRepost` (`PostList.tsx:154`) and `App.tsx:1359` wires it. Ink's `useInput` has no
stop-propagation — keymap.ts itself documents this ("every mounted listener sees every keypress").
So on any timeline, pressing `R` both toggles repost **and** refreshes. Keymap v2 already decided:
`R` = repost, refresh = `Ctrl+R` (interaction model §5.3). **Fix:** delete every screen-local
`R`-refresh branch; keep `n`/space load-more local or move it into the list's action map so each
verb has one owner (§5). This alone is most of an action-ownership audit ticket.

### F2. Hint bar (`app/keymap.ts` `hintsFor` + `components/StatusBar.tsx` `HintLine`) — too many keys, silently clipped

`hintsFor()` appends _all_ non-helpOnly globals after the screen's own keys, then `fitHints`
truncates at width — at 80 columns the tail (including `? help`-adjacent essentials) is cut with
no ellipsis. That violates §3 (only-valid-keys, state-aware) and §4 (truncation must be explicit).
**Fix:** cap the bar at 3–5 entries with priority (selection verbs → `Enter thread` → `c compose`
→ `:` → `? help`), make entries conditional on the selected row's state (show `v reveal` only when
the selected row actually has a CW/fold; `E edit`/`d delete`/`H history` only on the viewer's own
posts — object-local, §5; loading/error states shrink to back/retry, terraform-ui §13), and end
overflow in an explicit `…` like lazygit's `formatBindingInfos`. Movement keys need no slot at all
(scroll indicators teach them, terraform-ui §13).

### F3. `components/PostRow.tsx` — the `v` key owns three different verbs on one screen

PostList routes `v` to CW-reveal _or_ fold-expand depending on post state (`PostList.tsx:138-145`),
while profile uses `v` = visit page and safetyNumber `v` = verify. Same-screen double duty is the
unclear-ownership case §5 forbids; the fold marker even advertises it ("… press v to expand",
`PostRow.tsx:143`) in words that differ from the vision's `— read more (Enter)` (vision §5.2).
Worse, inline expansion duplicates a function `Enter` already owns (opening the thread shows the
full body). **Remove, don't add:** drop fold-expansion from `v` entirely — folded bodies end
`— read more (Enter)`, `v` reveals CWs only, and the filter-collapse line reuses the same wording
so `v` keeps exactly one meaning per screen.

### F4. `PostRow.tsx` quote embed — spreadsheet borders plus per-row instruction text

`QuotedPost` renders `┌ quoted @handle / │ body / └ Enter opens the thread`
(`PostRow.tsx:176-183`). Three problems against §1 and the vision: box borders around embedded
content are the "border-per-row spreadsheet" look the vision bans for lists (§3.3 there);
"Enter opens the thread" is instructional noise repeated under every quoted post — affordance
teaching belongs in help/palette, not per-row (§2); and the top/bottom rules cost height without
carrying structure. **Replace** with the vision's left-rule block — `│ @quoted · 3h` then
`│ first lines…` — two measured rows, zero instructions.

### F5. `PostRow.tsx` counts line — six segments, zeros rendered, glyphs off-policy

The stats line always renders replies even when 0 (`♡ 0 · 0 replies`, `PostRow.tsx:157-158`) and
can stack `♥ n · n replies · ↻ n · ❝ n · reposted · ★ bookmarked`. Vision principle 1 says numbers
are muted and never the loudest thing on a row — the quiet corollary is **zeroes don't exist**
(neomutt's `%M` likewise renders only when a thread is collapsed). Also `↻`/`❝`/`★` aren't the
glyph policy's `⟲`/none/words (`theme/glyphs.ts` table, vision §3.5) — route all glyphs through
one accessor so ascii/plain degrade consistently (§8). Keep the line to ≤ 3 segments: `♥ n ↳ n`
plus at most the viewer-state word.

### F6. `screens/ThreadScreen.tsx` — redundant title, missing section rhythm, weak reply targeting

(a) The `<Text color={theme.accent}>Thread</Text>` title (`ThreadScreen.tsx:183`) duplicates the
ribbon breadcrumb (`patches › home › thread`, vision §2.1) — remove it and its `marginTop={1}`
(two reclaimed rows; §1: titles live in ribbon/border, screens don't re-title themselves —
terraform-ui forbids plugins adding their own titles for the same reason). (b) Replies begin
without the dim labelled rule the vision specifies (`── replies ──`, vision §3.3; TUIKit:
separate groups with whitespace) — add it as part of the list's own budget. (c) Depth: we indent
replies via `rowIndent` but print no tree glyph; neomutt marks depth in the index itself
(`↳` per vision §3.5) — one glyph column, max depth 3 then flat (already specced). (d) Reply
targeting (B-089 core): `r` acts on the selection (object-local, correct), so the quick-post
overlay opened by `r` must name its target ("replying to @bob · 1m") and `Enter` on a reply row
must land selection on that reply after posting — the neomutt `$uncollapse_jump` lesson: after a
state change, put the cursor where the new content appeared. (e) Loading keeps the frame but
replaces all content; per §3, loading state shrinks hints to back-only rather than showing
movement keys that can't move.

### F7. Shell chrome (`StatusBar` ribbon) — hold the line on budget

The ribbon already carries breadcrumb · connection · node · handle · unread pill. k9s #2556 is
the warning: static info crowds out useful signal at narrow widths. Rules to keep: unread pill
only when > 0 (already), refreshing spinner replaces the dot instead of adding an indicator
(already, `StatusBar.tsx:96-99`), and no new segments without removing one — the four-chrome-row
frame contract is what keeps the smear class dead (interaction model §2.2).

### F8. Split panes (`SplitPane.tsx`) — master-detail checklist for B-089

Our split is one nav stack rendered twice (correct per interaction model §3.2). The remaining
Master-Detail audit items from Monospace: selection in the left pane updates the right pane
_immediately_; the detail adds context rather than duplicating the list; compact-width collapse
behaviour is defined (it is — tier degradation); returning from full detail restores originating
selection. Concretely: opening the thread pane should preserve left-pane selection highlight
(dimmed, since focus moved) and `Esc` must return cursor-exactly where it was.

### What to REMOVE (summary for B-088)

1. Screen-local `R`-refresh branches (F1) — one verb, one owner.
2. `ThreadScreen`'s title row + margin (F6a).
3. Quote embed's border rows + "Enter opens the thread" line (F4).
4. Fold-expansion via `v` and its "press v to expand" wording (F3).
5. Zero-count segments on the stats line; off-policy glyphs (F5).
6. Unconditional hint-bar entries for keys invalid on the current selection/state; silent
   truncation (F2).

### What to ADD (only after removals)

Context-conditional hints (state-aware bar), `── replies ──` rhythm rule, `↳` depth glyph,
reply-target naming in compose, explicit `…` on truncated hints, and the `? help` anchor kept
visible so level 2 is always one obvious step from level 1 (§2).
