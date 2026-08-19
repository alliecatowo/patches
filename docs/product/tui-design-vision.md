# The Patches TUI — design vision

**Status:** design direction · **Date:** 2026-08-18 · **Owner:** product/design
**Companion:** `docs/architecture/tui-interaction-model.md` (mechanics: frame, virtualization,
layer stack, keymap, primitives) and ADR 0018. This document is _what it should feel like_;
that one is _how it is wired_. Where they use the same word (tier, drawer, overlay, region), the
architecture doc's definition is the binding one.
**Spec:** §4.1–§4.2, §67–§81, §170–§175, §180–§187, §191, §192, §194, §195.

The bar: someone opens Patches in Ghostty, and the fact that it is a terminal app is the _flex_,
not the excuse. Calm, fast, beautiful in 16 colours, gorgeous in truecolor with a Kitty image on
the row you are reading, and never once garbled.

---

## 1. Design principles

1. **Calm chronology.** The feed is a river you scroll, newest at the top, no eddies. Nothing
   ever moves a post (§4.1, §180, §186, §194). The UI never draws attention to counts; numbers
   are muted, plain, and never the loudest thing on a row.
2. **Everything in ≤ 2 keys, everything in the palette.** Any screen or verb is reachable with a
   single key or a `g`-chord (§69, §191); the command palette (`:`) can find whatever a user
   forgot. Hints show the three keys that matter _here_, not twenty.
3. **Never a blank frame.** Chrome renders first, content streams into its region under a
   spinner; a screen that has ever had content never blanks on refresh (interaction model §6).
4. **Cosmetics are yours, never noise for others.** Nameplates, flair and wall themes render
   _inside the cells of your own post_ (§173, §184.1); the app's chrome belongs to the viewer's
   theme; quiet feed `~` and plain mode `P` are always one key away (§185).
5. **Text first; images are guests.** Bodies, handles and CWs are the content. Images get one
   beautiful cell on the row you are on, a tidy §75 box everywhere else, and never a required
   role for any control (§73, §75, §153, §191).
6. **The terminal is the brand.** No faux-GUI: no fake shadows, no mouse dependence, no emoji
   soup. Box-drawing, weight (bold/dim), one accent, and whitespace do the design work — the
   same tools `lazygit`, `k9s` and `htop` use, applied with more restraint.
7. **Honest by construction.** DMs say what they are (§183.1); tombstones, CWs and moderation
   notices are content and always render (§185); nothing is animated to make you stay (§4.2).

---

## 2. Layout system

### 2.1 Frame anatomy

The frame is the architecture doc's §2.2 contract: exactly one scrolling content region plus four
chrome rows (separator · notice · status · hints). One presentation request to the architect,
budget-neutral: in the `full` height tier (≥ 30 rows) draw the status row as a **header ribbon
at row 0** and keep separator/notice/hints at the bottom; in `compact` (20–29 rows) it stays at
the bottom. Same four rows, same `computeContentSize`, just where the eye lands first.

```text
 patches › home ─────────────────────────────────────────────────── ● patches.social  @allison  ✉ 3
 ▌row 0 of the content region — the only scrolling region (one screen, or split panes)
 …
 ↓ 214 below
────────────────────────────────────────────────────────────────────────────────────────────────────
 posted ✓
 j/k move  Enter thread  c post  r reply  l like  R repost  N notifs  : palette  ? help
```

Ribbon grammar: `patches › <screen> [› <region>]` on the left; on the right the connection dot
(`●` ok / `◐` connecting / `○` offline), node host, `@handle` (or `sign in` nudge), and the unread
pill `✉ 3` (only when > 0). In plain mode the dot is a word (`online`).

### 2.2 Width tiers (columns) — what each unlocks

| Tier       | Columns | Unlocks                                                                                                                            |
| ---------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `narrow`   | 60–79   | one column; overlays replace the content region; abbreviated hints; images as §75 box only, ≤ 24 cols wide                         |
| `standard` | 80–119  | one column; floating overlays (quick-post, pickers, palette, confirm strip); no drawer, no split                                   |
| `wide`     | 120–159 | **either** split panes (list 60 / detail 40, detail ≥ 48 cols) **or** one drawer (36 cols); opening the drawer collapses the split |
| `ultra`    | ≥ 160   | split panes **and** a drawer at once (needs `columns − 36 ≥ 120`)                                                                  |

Height: `compact` (20–29 rows) drops overlay borders, tightens fold thresholds, disables the
drawer, keeps status at the bottom; `full` (≥ 30) gets everything. `TerminalTooSmall` below 60×20
(§72).

### 2.3 Panes, focus ring, drawers, overlays

- **Split panes** are one nav stack rendered two ways (interaction model §3.2): `Enter` on a
  timeline row fills the right pane with the thread; `Esc` clears it. The focused pane has a
  `round` border in `borderFocus`; the other a `single` border in `border`; plain mode uses no
  border and a `›` prefix on the pane title. Focus is visible in the ribbon (`home › thread`).
- **Focus ring**: `Tab`/`Shift+Tab` cycle regions and panes uniformly (§4.5 there). Never colour
  alone: the focused list also owns the `▌` selection gutter (plain: `> `).
- **Drawers** are a right column of 36 cells for glanceable side-content that must not steal the
  screen: **notifications** (`N`), **messages** (`D` — proposal, see §5.8), and the **Now ring**
  (§5.13, proposal). One drawer at a time; `Esc` closes it; `Enter` in it navigates and closes.
  Below the tier threshold the key opens the full screen instead (`g n`, `g d`) — never nothing.
- **Overlays** float centred (`min(72, columns − 8)` wide) with a `round` border and a dimmed
  frozen background: quick-post, file picker, colour picker, theme picker, palette, image viewer.
  **Confirms** are the 3-row bottom strip, not a floating box — cheap and keeps context. In
  `narrow`/`compact` every overlay becomes a full content-region takeover; identical component,
  no border.

### 2.4 Degradation cheatsheet

| Element    | wide/full              | standard               | narrow / compact        | plain mode                      |
| ---------- | ---------------------- | ---------------------- | ----------------------- | ------------------------------- |
| thread     | right pane             | pushed screen          | pushed screen           | pushed screen, `> ` gutter      |
| quick-post | floating overlay       | floating overlay       | content-region takeover | takeover, `[Ctrl+S post]` words |
| notifs     | drawer                 | `g n` screen           | `g n` screen            | screen                          |
| confirm    | 3-row strip            | 3-row strip            | 3-row strip             | `Delete post? [y/n]` line       |
| image      | inline on selected row | inline on selected row | §75 box                 | §75 box                         |
| ribbon     | row 0                  | row 0                  | bottom status row       | same, words instead of glyphs   |

---

## 3. Visual language

### 3.1 Terminals own the background

Patches never paints a background over the whole frame. Every theme must read on dark, light,
and unknown backgrounds, which is why the default palette is the 16 ANSI names (the user's own
palette) and why emphasis is carried by **weight** (bold/dim) and **one accent**, not fills.
Only three things ever get a background cell: the selection bar in themes that opt in
(`selectionBg`), colour swatches, and a user's flair/wall accent inside their own cells.

### 3.2 Colour roles (theme tokens)

| Token         | Role                                                              | Default (`patches`) |
| ------------- | ----------------------------------------------------------------- | ------------------- |
| `accent`      | selection, ribbon title, primary action, links' underline partner | `magenta`           |
| `text`        | body copy                                                         | terminal default    |
| `muted`       | timestamps, counts, separators, hints                             | `gray`              |
| `focus`       | focused pane title / border                                       | `magenta` (bold)    |
| `border`      | unfocused pane/overlay border                                     | `gray`              |
| `ok`          | success toast, connected dot, checkmark flash                     | `green`             |
| `warn`        | CW line, DM notice, unread pill                                   | `yellow`            |
| `danger`      | destructive confirms, errors, offline dot                         | `red`               |
| `link`        | URLs                                                              | `cyan`              |
| `mention`     | `@handle` in bodies                                               | `blue`              |
| `tag`         | `#tag`, `+community`                                              | `green`             |
| `surfaceDim`  | dimmed background under overlays                                  | SGR dim             |
| `selectionBg` | optional background for the selected row                          | none                |

Content semantics are pinned to roles, not colours: a theme may recolour `warn`, but a CW is
always `warn`, a tombstone always `muted`, the DM notice always `warn` — a theme cannot unbind
them (§4.4 below).

### 3.3 Typography in cells

- **Bold** = the thing you are on (selected nameplate, focused pane title). **Dim** = metadata.
  Never both on the same run. Italic only for quoted-post bodies (falls back to dim).
- Dividers: a post row ends with one blank line (rhythm), never a rule. Sections inside a screen
  use a dim `─` rule with a left-aligned label (`── replies ──`). Panes and overlays use borders;
  lists never do (a border per row is what makes TUIs look like spreadsheets).
- Border styles: `round` = focused/overlay, `single` = unfocused pane, `none` = plain mode and
  `compact` overlays. `double`/`ascii` are reserved for user flair/wall themes (§184.1) so that a
  user's choice is visibly _theirs_, not the app's.
- Spacing rhythm: 1-cell left gutter for selection, 2-cell indent for post bodies under the
  nameplate, 4-cell indent per reply depth (max 3, then `↳` with a flat indent).

### 3.4 Capability degradation

| Feature             | truecolor          | 256                   | 16              | mono / plain          |
| ------------------- | ------------------ | --------------------- | --------------- | --------------------- |
| theme colours       | as authored (hex)  | nearest 256 via chalk | ANSI names      | bold/dim/inverse only |
| flair `post_accent` | hex                | nearest 256           | nearest ANSI    | none                  |
| nameplate gradient  | per-glyph colour   | per-glyph 256         | single colour   | none                  |
| swatches            | true swatch        | 256 swatch            | 16 swatch + hex | hex text              |
| images              | Kitty inline (row) | Kitty inline          | Kitty inline    | §75 box               |

### 3.5 Glyph policy

Three glyph sets, auto-selected, overridable (`PATCHES_GLYPHS=unicode|nerd|ascii`, preference):

| Meaning    | unicode (default)                 | nerd (opt-in) | ascii           |
| ---------- | --------------------------------- | ------------- | --------------- |
| selection  | `▌`                               | `▌`           | `>`             |
| like       | `♥` (or the actor's `like_glyph`) | ``            | `<3`            |
| reply      | `↳`                               | ``            | `->`            |
| repost     | `⟲`                               | ``            | `RT`            |
| CW         | `⚠`                               | ``            | `CW`            |
| unread     | `✉`                               | ``            | `*`             |
| online dot | `●` `◐` `○`                       | same          | `ok`/`..`/`off` |

Nerd Font is never required and never auto-detected; a control never depends on a glyph.

### 3.6 Whose colour is it?

Two owners, hard boundary. **The theme owns chrome**: ribbon, borders, hints, selection, focus,
toasts, role colours. **The actor owns their cells**: nameplate colour/glyph/badges (§173), flair
accent and border on their post block, like glyph on _their_ like (§184.2), wall theme on their
Page (§171). Their colour may not leak into a gutter, a border of the frame, or another actor's
row (§184.1 "no bleeds"). Quiet feed removes the second owner; plain mode removes both.

---

## 4. Themes

### 4.1 Model

`apps/tui/src/theme/` grows a `themes/` folder of built-ins, each a `Theme` object; user themes
are JSON with the same shape at `$XDG_CONFIG_HOME/patches/themes/<name>.json`, validated (zod)
and ignored with a toast if invalid — never a crash.

```ts
export interface Theme {
  name: string;
  kind: 'dark' | 'light' | 'any';
  colors: Record<ThemeToken, string | null>; // ANSI name or #rrggbb; null = terminal default
  border: { focus: 'round' | 'single'; blur: 'single' | 'none' };
  selectionBg?: string; // opt-in only
  glyphs?: 'unicode' | 'nerd' | 'ascii'; // hint, user pref wins
}
```

Built-ins: **`patches`** (default: 16-ANSI, magenta accent, "match my terminal" — the user's own
palette), **`paper`** (light: ink-blue accent, warm greys, `selectionBg` cream), **`mono`** (no
colour: bold/dim/inverse only — also the high-contrast baseline), **`hacker`** (green-on-anything,
`single` borders, ascii-friendly), **`pastel`** (truecolor lavender/mint/peach, `round` borders),
**`terminal`** (alias of `patches` with `accent: null` — the terminal's own bold colour).

### 4.2 Selection & persistence

Precedence: `--theme <name>` > `PATCHES_THEME` > per-profile preference (`,` → Theme) > `patches`.
Persisted alongside plain/quiet in the local profile store — never sent to the server (§185:
presentation is the client's).

### 4.3 The picker

`,` → Theme opens an overlay list; moving the cursor **live-applies** the theme behind the dimmed
overlay (the frozen background snapshot is re-rendered once per move — cheap, and the whole
point). Each row shows name, kind, and a 5-swatch strip; `Enter` keeps, `Esc` reverts. Under `mono`
the swatches become the words `accent muted ok warn danger`.

### 4.4 What a theme may never do

- Unbind a content role: CW → `warn`, tombstone → `muted`, DM notice → `warn`, offline → `danger`.
- Hide anything (`null` means terminal default, never "don't render").
- Recolour another actor's cosmetics or override the viewer's own flair (that's `~`/`P`'s job).
- Add glyphs, borders per row, or backgrounds beyond `selectionBg`.

---

## 5. Key flows

Frames below are 100×30 or 140×40 as labelled; `·` inside cells is literal, `…` marks elided rows.

### 5.1 First run — connect → local → login nudge (100×30)

```text
 patches › local ───────────────────────────────────────────────────── ● patches.social  sign in: L
 ▌@alice · 2m
   Finally finished the ridiculous synth rack. Photos when the sun comes back.
   ┌ image · 1600×1067 · jpeg ───────────────┐
   │              press o to open             │
   └──────────────────────────────────────────┘
   ♥ 12  ↳ 4

  @bob · 11m
   bring back personal websites #indieweb
   ↳ 3

  ⟲ reposted by @carol · 15m
  @dana · yesterday
   the guestbook on my page is back. sign it. https://patches.social/@dana
   ♥ 40  ↳ 9  ⟲ 6

  @erin · 1h
   ⚠ food — press v to reveal

  @frank · 2h
   long post about tmux passthrough and why your images vanish — you can read this whole
   thing in the thread, but the short version is that `allow-passthrough on` is not on by
   default and…
   — read more (Enter)

  ↓ 214 below
────────────────────────────────────────────────────────────────────────────────────────────────────
 Reading as a guest — press L to sign in and see your home feed
 j/k move  Enter thread  o open  v reveal  L sign in  / search  ? help
```

Micro-interactions: the ribbon shows `sign in: L` where `@handle` will live; the notice row
carries the nudge for 8 s then clears (it comes back after any auth-required key, e.g. `l`);
the first row is selected on load, so `Enter` works immediately; loading shows chrome + a
`⠋ loading local…` spinner in the content region for < 1 s, never a blank.

### 5.2 Timeline browsing

- **Selection** is the `▌` gutter + bold nameplate + the only inline image on screen (interaction
  model §2.6). Moving with `j` releases the previous image and places the next; the row height
  is identical either way, so the list never breathes.
- **Fold**: past ~10 measured rows the body ends with `— read more (Enter)` in `muted`; `Enter`
  opens the thread (full body). No inline expansion — that would change measured height mid-list.
- **Repost attribution** is a one-line `⟲ reposted by @carol · 15m` above the original's
  nameplate; up to three names, then `and 2 others` (§180.1). The original's flair renders; the
  reposter's does not.
- **Quote embed**: a left-rule block under the body — `│ @quoted · 3d` / `│ first two lines…` /
  `│ 1 image` — one level deep, deeper quotes as a plain link (§180.2). `Enter` on the row opens
  the _quoting_ post; the palette offers "Open quoted post".
- **Optimistic like**: `l` swaps `♥` to the actor's glyph in `accent` instantly and flashes a
  `✓` for 300 ms at the row's end (one repaint), reverting with a toast on failure (§79).
- **New posts**: `↑ 3 new` sticky pill at the top of the list, `g g` or `Ctrl+R` folds them in.
  Never auto-inserted while you read.

### 5.3 Thread — one list, split detail (140×40)

```text
 patches › home › thread ────────────────────────────────────────────────────────────────────────────────── ● patches.social  @allison  ✉ 3
┌─ home ───────────────────────────────────────────────────────────────────────────┐╭─ thread ─────────────────────────────────────────────╮
│ ▌@alice · 2m                                                                     ││  @alice ✦ · 2m · edited 1m (H history)               │
│   Finally finished the ridiculous synth rack. Photos when the sun                ││   Finally finished the ridiculous synth rack. Photos │
│   comes back.                                                                    ││   when the sun comes back. In the meantime, the      │
│   ┌ image · 1600×1067 · jpeg ───────────────┐                                    ││   patch notes:                                       │
│   │              press o to open             │                                   ││                                                      │
│   └──────────────────────────────────────────┘                                   ││   - the filter bank is now stereo                    │
│   ♥ 12  ↳ 4                                                                      ││   - the sequencer talks MIDI over the ribbon cable   │
│                                                                                  ││   - `patches visit @alice/rack` has the wiring       │
│  @bob · 11m                                                                      ││                                                      │
│   bring back personal websites #indieweb                                         ││   ┌ image · 1600×1067 · jpeg ───────────────┐        │
│   ↳ 3                                                                            ││   │           (inline image here)            │       │
│                                                                                  ││   └──────────────────────────────────────────┘       │
│  ⟲ reposted by @carol · 15m                                                      ││   ♥ 12  ↳ 4  ⟲ 2                                     │
│  @dana · yesterday                                                               ││ ── replies ───────────────────────────────────────── │
│   the guestbook on my page is back. sign it.                                     ││ ▌@bob · 1m                                           │
│   ♥ 40  ↳ 9  ⟲ 6                                                                 ││   that filter bank sounds unreal, is it the SEM      │
│                                                                                  ││   clone?                                             │
│  @erin · 1h                                                                      ││   ♥ 2                                                │
│   ⚠ food — press v to reveal                                                     ││                                                      │
│                                                                                  ││     ↳ @alice · 40s                                   │
│  @frank · 2h                                                                     ││       yes! two of them, panned hard                  │
│   long post about tmux passthrough and why your images vanish — you              ││                                                      │
│   can read this whole thing in the thread, but the short version is              ││  @gus · 30s                                          │
│   that `allow-passthrough on` is not on by default and…                          ││   wiring diagram is *chef's kiss*                    │
│   — read more (Enter)                                                            ││                                                      │
│                                                                                  ││                                                      │
│  @ivan · 4h                                                                      ││                                                      │
│   › quoting @dana                                                                ││                                                      │
│   │ @dana · yesterday                                                            ││                                                      │
│   │ the guestbook on my page is back. sign it.                                   ││                                                      │
│   ↳ 1                                                                            ││                                                      │
│                                                                                  ││                                                      │
│                                                                                  ││                                                      │
│  ↓ 209 below                                                                     ││                                                      │
└──────────────────────────────────────────────────────────────────────────────────┘╰──────────────────────────────────────────────────────╯
────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

 Tab focus home  j/k move  r reply  l like  R repost  Q quote  H history  Esc close pane  : palette
```

The right pane holds root + replies as one list (parent reachable with `k`, reply lands on the
right post — interaction model §10 Stage D). `Tab` moves focus; the focused pane's title is bold
and its border `round`; the inline image lives on the focused post only. At 100 columns the same
stack renders as a pushed screen with identical content.

### 5.4 Quick-post overlay and full compose

Quick-post (`c`, `r` pre-scoped) at 100×30, centred, background dimmed:

```text
              ╭─ new post ───────────────────────────────────────────────────────────╮
              │ @bo▌                                                                 │
              │ ├ @bob        Bob Ross            ✦                                  │
              │ ├ @bobbin     bobbin (she/her)                                       │
              │ └ @bo_ring    plain bo                                               │
              │                                                                      │
              │ ⚠ cw: none      attach: none                                 17/5000 │
              │ ^S post  ^A attach  ^T cw  ^F full compose  Esc keep draft           │
              ╰──────────────────────────────────────────────────────────────────────╯
```

- `Ctrl+T` toggles the CW field (a second single-line region); `Ctrl+A` opens the file picker.
- Autocomplete opens on `@`/`#` at a word boundary, ≤ 8 rows, `Tab`/`Enter` accepts; it takes
  rows _inside_ the overlay so nothing outside moves.
- Char count is `n/limit` (limit from `GetNodeInfo.max_post_chars`), turning `warn` at 90 % and
  `danger` past it; posting is disabled past the limit with the reason in the strip.
- `Ctrl+F` expands into full compose without losing a character (one shared draft).
- Full compose (`C`) is a `full` route: editor on top, a field strip below with **CW**, **quote
  target** (embed preview), **community** (`+name` picker), **attachments** (thumbnail cells or
  §75 boxes with alt-text status `alt ✓`/`alt !`), and a `ProgressBar` per upload
  (`▰▰▰▰▱▱▱▱ 52% synth.jpg`).
- **Drag & drop**: a dropped file arrives as a bracketed-paste path (`'/home/a/pic.jpg'` on
  most terminals, `file://` on some). Compose's `usePaste` handler recognises a single-line paste
  that resolves to an existing image file (after unquoting/`file://` decode/`~` expansion) and
  attaches it instead of inserting text; a toast says `attached synth.jpg — Ctrl+A to add alt`.
  Non-image → normal paste. Multiple lines of paths → attach each, ≤ node limit.
- **File picker** (`Ctrl+A`): overlay directory browser starting at `~`, type-to-filter, `Enter`
  descends/selects, `Backspace` on empty filter ascends, image extensions listed first, size and
  dimensions in `muted`, `Space` multi-select. Never a shell (§76).
- **Markdown-ish bodies**: `**bold**` `*italic*` `` `code` `` `> quote` lists and links render
  in the editor _as source_ (this is a terminal; source is honest) with a live preview toggle
  `Ctrl+O` that swaps the editor region for the rendered body (`Ctrl+E`/`Ctrl+W` stay
  line-end/delete-word, as the editor defines them).
- Sending: overlay collapses to a one-line `⠋ posting…` in the notice row; on success the new
  post appears at the top of your own timeline with a 300 ms `✓ posted`; draft is cleared only
  after the server acknowledges (§79, §80).

### 5.5 Profile and wall / Pages (100 columns, rows elided)

```text
 patches › @dana › wall ──────────────────────────────────────────────── ● patches.social  @allison
╔══════════════════════════════════════════════════════════════════════════════════════════════════╗
║  ▓▓▓  dana ✦ mod                                             @dana@patches.social · joined 2025  ║
║  ▓▓▓  building small web things. guestbook open.       212 posts · 88 following · 140 followers  ║
╚══════════════════════════════════════════════════════════════════════════════════════════════════╝
   f follow  m message  v page  [ ] sub-pages  Tab regions

 ── pinned ─────────────────────────────────────────────────────────────────────────────────────────
   @dana · Mar 3    the guestbook on my page is back. sign it.                    ♥ 40  ↳ 9
   @dana · Feb 12   my rack, annotated → patches visit @dana/rack                 ♥ 22  ↳ 3

 ── page: home ───────────────────────────────────────────────[ home · rack · links · guestbook ] ──
   hi, i'm dana                                                     ┌─ Top 8 ─────────────────┐
   techno + terminals + tiny websites                               │ @alice   @bob   @carol  │
                                                                    │ @erin    @gus   @hana   │
   ▸ now playing: Boards of Canada — Roygbiv                        │ @ivan    @kim           │
                                                                    └─────────────────────────┘
    ┌─ guestbook (20) ───────────────────────────────────────────────────────────────── s sign ┐
    │ @bob · 2h      love the new rack page                                                    │
    │ @erin · 1d     hello from the terminal!! ✦                                               │
    └──────────────────────────────────────────────────────────────────────────────────────────┘
```

Why this is the flex: the wall is where an actor's `wall_theme` (§184.1, §171) takes over their
_block_ — here `double` border and their accent on the hero — while the ribbon, hints and gutters
stay in the viewer's theme. Blocks lay out on a **cell grid**: at ≥ 100 columns two columns
(text-ish blocks left, `TopEight`/`Badges`/`Links` right); at < 100 a single column in document
order. `AsciiArt` is centred and never wrapped (clipped with a `…` row, control chars stripped).
`Gallery` shows §75 boxes in a 2–3 column grid with the selected cell inline. `[`/`]` switch
sub-pages; `Tab` moves between pinned → blocks → guestbook regions; `s` opens a one-line sign
box; `e` (owner) opens the structured block editor (`B-023`) — a list of blocks with `J`/`K` to
reorder, `Enter` to edit fields, `a` add, `x` remove, `Ctrl+S` save with the server's validation
error shown inline against the offending block. Plain mode: no borders, `Top 8` becomes a
`- @handle` list, still one `Tab` ring.

### 5.6 Notifications drawer (`N`, 140 columns → 104 content + 36 drawer)

```text
  @hana · 3h                                                                                            ╭─ notifications ──────────────────╮
   +synths is a real place now. come post your racks.                                                   │ ▌● @bob liked your post       1m │
                                                                                                        │    "Finally finished the…"       │
  @ivan · 4h                                                                                            │  ● @carol reposted            5m │
   › quoting @dana                                                                                      │    "the guestbook on my…"        │
   │ @dana · yesterday                                                                                  │  ● @erin +2 followed you      9m │
   │ the guestbook on my page is back. sign it.                                                         │    @gus replied              12m │
   ↳ 1                                                                                                  │    "that filter bank…"           │
                                                                                                        │    ✉ @kim  new message        1h │
  @jo · 5h                                                                                              │    +synths invited you        2h │
   shipped the ssh login flow, `patches login --ssh` if you want to try it                              │ ──────────────────────────────── │
                                                                                                        │ Enter open  m read all  Esc      │
```

Grouping: same type + same post within 10 min collapses (`@erin +2 followed you`); `MESSAGE`
already collapses per conversation (§187). Unread `●` in `warn`; read-on-view after 800 ms dwell
(interaction model §6); the ribbon's `✉ 3` decrements live. `Enter` navigates and closes the
drawer; the drawer remembers its scroll for the session.

### 5.7 Communities and tags

`g c` → community list (`+name`, member count muted, `J` join/leave, no sort control anywhere,
alphabetical) → timeline (identical `PostRow`, ribbon `patches › +synths`, `c` composes into it,
rules under `i`, members under `Tab`). `#tag` in a body is `tag`-coloured; `t` lists the selected
post's tags as a strip picker, `#` jumps to the first tag's feed; the tag feed ribbon offers
`M mute tag`. No trending, no counts on tags (§181, §194).

### 5.8 Direct messages (`g d`, 100 columns)

```text
 patches › messages › @kim ──────────────────────────────────────── ● patches.social  @allison  ✉ 2
 ⚠ Not end-to-end encrypted — this node's operators can read these messages.     retention: 90 days
 ── conversations ────────────────│ ── @kim ────────────────────────────────────────────────────────
 ▌@kim                      1h  ● │                                      did the ssh flow work?  1h
  @bob, @carol (3)          1d    │  yep! agent forwarding and everything                       58m
  requests (1)                    │                                         nice. write it up?  57m
                                  │
                                  │ ▌type a message…                    ^S send · Enter newline
```

The notice is a permanent first content row (never in the ribbon, never scrolls away, never a
tooltip — §183.1). Requests are a separate folder with accept/decline confirms; no attachments,
no previews, no typing indicator, no read receipts (§183.3, §194). `Ctrl+S` sends, like every
form (§77's "explicit submit key"); `Enter` inserts a newline unless the preference "Enter sends
in messages" is on. Optional `D` drawer (proposal: same primitive as notifications, opens the
newest conversation) — the notice renders at the top of the drawer too. Sending is optimistic with `⠋` → `✓`; a failed send keeps the text in the box.

### 5.9 Search (`/`)

Two regions: a mode strip `[ People · Posts ]` (`←`/`→`/`Space` while focused) and results.
Posts results are chronological with a `since:` / `from:@handle` / `#tag` filter row (`Tab` to
reach it) — filters, never sorts (§194). Empty query shows the last 5 queries. People results
render nameplates with `f` follow inline.

### 5.10 Preferences (`,`), theme picker, colour picker

Preferences is a form: **Display** (theme ▸ picker, glyphs, plain mode, quiet feed, relative vs
absolute time), **Compose** (default visibility, default quote policy), **Flair** (post accent ▸
colour picker, border style ▸ live preview of your own post row, like glyph ▸ allow-list strip),
**Pinned posts** (≤ 3, reorder), **Account** (`L` accounts). Every row previews live in a
sample `PostRow` under the form. Colour picker overlay: 6×6×6 swatch grid, `#rrggbb` field, a
"contrast vs dark / light" pair of sample cells, and the server's contrast floor enforced client-
side with the reason (`too dim on dark backgrounds`) before save (§173, §192).

### 5.11 Command palette (`:` / `Ctrl+P`)

Fuzzy list built from `KEYMAP` + routes + context actions ("Open quoted post", "Open @bob",
"Copy post link"); each row shows its key in `muted` so the palette teaches the keyboard. Runs
in ≤ 2 keys (`:` + `Enter` on the top hit).

### 5.12 Help (`?`)

Generated from `KEYMAP`, grouped by screen, with a "here" section first (the keys valid on the
screen you pressed `?` from), searchable with `/`. Never a hand-maintained table.

### 5.13 Now — a status line, not stories (**proposal**, needs Amendment C + owner sign-off)

The owner asked for "quick little things you can post, vanishing status or whatever" without
algorithmic junk food. §4.2 and §5 currently list _stories_ as a non-goal, so **nothing here is
buildable until a spec amendment says otherwise**; this section defines the only shape we would
propose.

**Now** is one short status per actor (≤ 140 chars, text only), replaced on set, expiring 24 h after set, hard-deleted server-side, visible to followers and on
the profile only. Not in any timeline, not in local, not searchable, not federated (v0), no
media, no view counts, no "seen by" (the server stores no view rows at all), no ranking; the ring
is ordered by `set_at`, newest first, and shows only followed actors — never suggestions.
Interactions: `Enter` reads, `l` likes (count visible to the author only), `r` replies as a DM
when §183.2 allows, otherwise no reply affordance. One per actor is what keeps it a status, not
a reel.

```text
 now ▸ @bob soldering the second filter bank · 12m   @carol shipped v0.4 · 1h   @erin at the… +2
```

Home renders the ring as one optional row under the ribbon (off in preferences → row absent);
`wide`+ can open it as a drawer listing each Now in full. Setting yours: `,` → Now, or `:now`.
Needs: Amendment C text (why "Now" is not §4.2's stories: no view counts, no autoplay, no media,
no ranking, one per actor), `now.proto` (`SetNow`, `ClearNow`, `ListFollowedNow` cursor-paginated,
no ordering parameter), `actor_now` table with an expiry job, notification `NOW_LIKE` (author
only), TUI ring + drawer + plain form (`now: @bob soldering… (12m)`).

---

## 6. Motion and feedback

- **Spinners** (`ink-spinner` dots) only in the region that is loading and only when it has
  never had content; refreshes show `⠋` in the ribbon's connection slot instead.
- **Progress bars** (`@inkjs/ui` `ProgressBar`) for uploads and page saves; determinate only —
  an unknown-length job gets a spinner, never a fake bar.
- **Scroll indicators**: `↑ N above` / `↓ N below` rows at list edges; panes over 200 items show
  a 1-cell `▐` thumb on the right border proportional to position (rich only).
- **Toasts** in the reserved notice row, one at a time, 2.5 s info / 5 s error, `ok`/`danger`
  role glyph + words; plain mode words only.
- **`↑ N new` pill**: sticky top row of the list, `accent`, cleared by `g g`/`Ctrl+R`.
- **Optimistic checkmark flash**: `✓` for 300 ms at the end of the affected row — one repaint.
- **Relative time ticks** every 30 s from one shell interval; only rows whose label changed
  repaint (`incrementalRendering`).
- **Focus transitions**: pane border swaps `single`↔`round` and title weight — no sweeps.
- **Restraint rules**: nothing animates beyond the cells it concerns; nothing loops forever
  (spinners stop with their request; a stuck request becomes the offline banner with a
  countdown); no marquee, no blinking, no confetti; sound never.

---

## 7. Accessibility and robustness

- **Plain mode** (`P`, `PATCHES_PLAIN=1`) is a first-class rendering, not a fallback: same
  characters, `> ` gutters, words for glyphs, no borders, source-marker markdown (§185).
- **Linear mode** (proposal, `PATCHES_LINEAR=1` / `--linear`): plain mode plus a single-column
  layout, no split/drawer/overlay, one item per screen-reader-friendly paragraph, and a
  `[1/214]` position prefix instead of a scroll thumb — for screen readers reading the tty.
- **High contrast**: `mono` theme + `bold` selection; `paper` for light terminals; every role
  colour has a bold/dim/inverse equivalent so colour is never the only signal (§173).
- **tmux / WSL / Windows Terminal**: no Kitty → §75 boxes; resize lag → one-row slack budget
  (architecture §2.2); ascii glyph set auto-picked when the locale isn't UTF-8.
- **Resize**: tiers re-evaluate on every render; a split collapses to screens and back without
  touching history; overlays re-centre; a resize below 60×20 shows `TerminalTooSmall` and returns
  to exactly where you were.
- **Non-TTY**: subcommands (`patches ping`, `patches dm`, `patches tag`, `patches visit`) keep
  working headlessly (§191).

---

## 8. What we deliberately don't do

- No votes, karma, scores, trending, "popular", "for you", or activity-derived suggestions
  anywhere in the UI, including the palette and search (§149, §194).
- No `sort` control on any timeline; filters yes, orders no (§194).
- No reaction picker; the like glyph is a skin on _your_ like (§184.2). No per-glyph counts.
- No view counts, read receipts, typing indicators, "seen by", online presence, streaks (§4.2, §183.3).
- No cosmetics that gate function; a capability may unlock a colour, never a verb (§184.3).
- No "encrypted/secure/private" wording near DMs; no DM text in any log or error (§183.1, §194).
- No mouse-first affordances, no auto-playing anything, no infinite auto-load (paging is `n`/`Space`
  and the sticky "new" pill; the list never grows under your cursor).
- No hover-only information, no icon-only controls, no colour-only state.
- No theme that changes layout; no flair that leaves its cells; no wall theme that recolours chrome.
- No `<Static>` in the shell, no per-row timers, no `console.log` in render (architecture §9).

---

## 9. Roadmap and design-driven tasks

Three waves, aligned to the architecture doc's stages (A frame → B nav/keys/modals → C rich input
→ D bodies/media/Amendment B screens). Wave 1 rides Stage A/B; Wave 2 rides C/D; Wave 3 is
polish + proposals. IDs are `P12-1nn` to merge with the architect's `P12-0nn`.

**Wave 1 — the frame becomes a face** (with Stages A–B)

| ID      | Title                                                                                                                                                                           | Owns                                                                                                | Acceptance                                                                                                                                                                                                                                                |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P12-101 | Theme engine: `Theme` type, token roles, built-ins (`patches`, `paper`, `mono`, `hacker`, `pastel`, `terminal`), `--theme`/`PATCHES_THEME`/profile precedence, JSON user themes | `apps/tui/src/theme/{index.ts,themes/**,load.ts,schema.ts}`, `apps/tui/src/cli/args.ts` (flag only) | every existing `theme.x` call resolves through the provider; roles pinned to content semantics by test (CW=`warn`, tombstone=`muted`, DM notice=`warn` under all built-ins); invalid user JSON → toast, default applied; `mono` renders zero colour codes |
| P12-102 | Header ribbon + connection dot + unread pill (status row at row 0 in `full`, bottom in `compact`)                                                                               | `apps/tui/src/components/StatusBar.tsx` (ribbon variant), `components/Ribbon.tsx`                   | budget unchanged (4 chrome rows); `● ◐ ○` states + plain words; unread pill only when > 0; region breadcrumb (`home › thread`) reflects focus                                                                                                             |
| P12-103 | Glyph sets (`unicode`/`nerd`/`ascii`) with auto-select and preference                                                                                                           | `apps/tui/src/theme/glyphs.ts` + call sites in `PostRow`, `Toast`, `Ribbon`                         | one `glyph('like')` accessor; ascii chosen when locale is not UTF-8; no control depends on a glyph (test greps hints for glyph-only labels)                                                                                                               |
| P12-104 | Selection & rhythm pass on `PostRow`: `▌` gutter, 2-cell body indent, muted counts line, repost attribution + quote embed styling per §5.2                                      | `apps/tui/src/components/PostRow.tsx`, `components/post-height.ts`                                  | measured height identical rich/plain/quiet; attribution ≤ 3 names; quote embed one level; snapshot tests at 60/80/100/140 cols                                                                                                                            |
| P12-105 | Confirm strip visual + destructive role, toast queue styling, `↑ N new` pill styling                                                                                            | `apps/tui/src/components/{ConfirmDialog,Toast,Banner}.tsx` (styles only, atop P12-008/010)          | `danger` role on destructive; plain `[y/n]`; pill uses `accent`, cleared by `g g`/`Ctrl+R`                                                                                                                                                                |

**Wave 2 — the flex** (with Stages C–D)

| ID      | Title                                                                                                                                                                  | Owns                                                                                                                              | Acceptance                                                                                                                                    |
| ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| P12-106 | Quick-post overlay (`c`/`r`) with counter, CW toggle, `Ctrl+F` expand, shared draft                                                                                    | `apps/tui/src/components/QuickPost.tsx`, `compose/draft-store.ts` (shared draft key)                                              | opens in ≤ 1 frame; `Esc` keeps draft; `Ctrl+F` preserves text/cursor; counter roles at 90 %/100 %; narrow/compact takeover form              |
| P12-107 | Notifications drawer (`N`) with grouping + read-on-view + live pill                                                                                                    | `apps/tui/src/components/layout/Drawer.tsx`, `components/NotificationsDrawer.tsx`                                                 | falls back to `g n` under threshold; grouping rule tested; opening the drawer never changes content-region height                             |
| P12-108 | Split-pane thread presentation polish: pane titles, focus border swap, `↓ N below`, breadcrumb                                                                         | `apps/tui/src/components/layout/SplitPane.tsx` (styles), `screens/ThreadScreen.tsx` (pane header)                                 | 140×40 golden frame matches §5.3 within glyph set; collapse to 100 cols keeps history (test)                                                  |
| P12-109 | Pages renderer upgrade: cell-grid layout (2-col ≥ 100), wall theme scoped to the wall block, pinned strip, `Top 8` box, guestbook box, `AsciiArt` clip, `Gallery` grid | `apps/tui/src/pages/render/{blocks.tsx,layout.ts,theme.ts}`, `screens/PageScreen.tsx`, `screens/ProfileScreen.tsx` (pinned strip) | wall theme never touches ribbon/hints/gutter (test); every block has a plain form; unknown block placeholder retained; snapshot at 80/100/140 |
| P12-110 | Structured page block editor (supersedes `B-023`): list, reorder, field edit, add/remove, inline server validation                                                     | `apps/tui/src/screens/PageBlocksEditorScreen.tsx`, `pages/editor.ts`                                                              | round-trips a document byte-identically when untouched; validation error pinned to the block; `$EDITOR` path kept as `E`                      |
| P12-111 | Drag & drop attach: bracketed-paste path detection in compose (+ `file://`, quotes, `~`, multi-line)                                                                   | `apps/tui/src/compose/paste-attach.ts`, `screens/ComposeScreen.tsx` (paste hook)                                                  | image path → attach + toast; non-image → text paste; never a shell; tests for quoted/URI/multi forms                                          |
| P12-112 | Theme picker + colour picker UX (live preview, swatch strip, contrast pair, floor reason) atop P12-015                                                                 | `apps/tui/src/components/input/ThemePicker.tsx`, `components/input/ColorPicker.tsx` (UX layer)                                    | moving the cursor live-applies and `Esc` reverts; below-floor pick shows a reason; `mono` shows words                                         |
| P12-113 | Preferences screen IA per §5.10 with live sample `PostRow`                                                                                                             | `apps/tui/src/screens/PreferencesScreen.tsx`                                                                                      | every setting previews live; theme/glyphs/plain/quiet persisted per profile; nothing sent to server                                           |
| P12-114 | Messages screen visual: permanent notice row, folders, optimistic send, retention line                                                                                 | `apps/tui/src/screens/MessagesScreen.tsx` (visual layer atop P11-010)                                                             | notice is the first content row on screen and in any DM drawer; grep test for forbidden words; failed send keeps text                         |
| P12-115 | Search mode strip + filter row (`since:`/`from:`/`#tag`)                                                                                                               | `apps/tui/src/screens/SearchScreen.tsx` (UI atop P12-016)                                                                         | filters only, no order control; last 5 queries on empty; `Tab` region ring                                                                    |
| P12-116 | Palette context actions ("Open quoted post", "Open @handle", "Copy link") + key teaching                                                                               | `apps/tui/src/components/CommandPalette.tsx` (actions source)                                                                     | actions derive from the selected row; each run toasts its key when one exists                                                                 |

**Wave 3 — polish and proposals**

| ID      | Title                                                                                                           | Owns                                                                                        | Acceptance                                                                                                                                                                                    |
| ------- | --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P12-117 | Motion & feedback restraint pass: scroll thumb, `✓` flash, ribbon refresh spinner, offline countdown, 30 s tick | `apps/tui/src/components/{ScrollThumb,Flash}.tsx`, `hooks/useClock.ts`                      | one interval app-wide; no animation repaints outside its cells (frame-diff test); nothing loops after its request ends                                                                        |
| P12-118 | Linear mode (`--linear`/`PATCHES_LINEAR`) for screen readers                                                    | `apps/tui/src/theme/linear-mode.tsx`, `app/App.tsx` (flag)                                  | single column, no overlays/drawers, `[i/N]` prefixes, plain implied; every screen reachable                                                                                                   |
| P12-119 | Now (status line) — spec amendment draft + ADR proposal, no code                                                | `docs/decisions/00NN-now-status-line.md` (draft), `docs/product/amendment-c-now.md` (draft) | states §4.2/§5 conflict and the exact non-story constraints (one per actor, 24 h hard delete, no view rows, no media, no ranking, followers only); marked "needs owner sign-off" (§195 style) |
| P12-120 | Now — server (`now.proto`, `actor_now`, expiry job, `NOW_LIKE`) — **blocked on P12-119 sign-off**               | `packages/proto/**`, `packages/database/**`, `apps/server/src/modules/now/**`               | no view/seen storage; cursor pagination, no order param; hard delete at expiry tested                                                                                                         |
| P12-121 | Now — TUI ring row + drawer + `:now` — **blocked on P12-120**                                                   | `apps/tui/src/components/NowRing.tsx`, `screens/NowScreen.tsx`                              | ring off → row absent; followed actors only; plain form; ≤ 1 row in home                                                                                                                      |
| P12-122 | DM drawer (`D`) reusing the drawer primitive, notice at top                                                     | `apps/tui/src/components/MessagesDrawer.tsx`                                                | notice first row; falls back to `g d`; no attachment affordance                                                                                                                               |
| P12-123 | Golden-frame docs: 100×30 and 140×40 captures for user guide + this doc kept in sync by a test                  | `docs/user-guide.md` (screens section), `apps/tui/test/golden-frames.test.tsx`              | tmux-captured frames match committed goldens per glyph set                                                                                                                                    |

Sign-off needed before code: P12-119 → P12-121 (Now), and the `j` → `J` community binding the
architecture doc flags. Everything else is inside the spec as amended.
