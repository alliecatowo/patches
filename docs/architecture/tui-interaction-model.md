# TUI interaction model

**Status:** target design · **Date:** 2026-08-18 · **ADR:** [0018](../decisions/0018-tui-interaction-model.md)
**Scope:** `apps/tui`, `packages/terminal-media`. **Spec:** §67–§82, §112–§114, §153, §173, §185, §191, §194.

`docs/architecture/tui.md` records what is built. This records what it is becoming and why.
Markers: **[v]** = verified in the working tree or an installed package on 2026-08-18;
**[p]** = proposed here, not yet code.

---

## 1. What is actually wrong

| Symptom (live node)                                                                      | Cause                                                                                                                                                                                                                    | State                                                                     |
| ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------- |
| Frame corruption after heavy use — rows overlap, bodies cut, status bar wraps to 2 lines | Nothing bounded frame height or line width. `App` used `<Box height={rows} justifyContent="space-between">` with no `overflow`; `PostList.viewportSize()` _estimated_ "a row is roughly three lines".                    | **[v]** fix landing                                                       |
| Help/connect screen first instead of the timeline                                        | Rooted on a splash.                                                                                                                                                                                                      | **[v]** fixed — `rootEntry(false)` → `local`, `ConnectScreen.tsx` deleted |
| `Esc` unreliable                                                                         | One `priorScreen` plus separate `profileTarget`/`pageTarget`/`threadStack`/`reportTarget`; several screens had no `Esc` handler.                                                                                         | **[v]** fixed — `app/navigation.ts` typed stack, `Esc` = `pop()`          |
| Screens that hide the global keys and trap you                                           | `capturesInput(screen)` disables the **entire** global keymap; `screenCapturing` disables it again for page sub-modes. Neither has a fallback path.                                                                      | **[v]** open — §4.2                                                       |
| Inconsistent hints, thin help                                                            | Two hand-maintained lists.                                                                                                                                                                                               | **[v]** fixed — `hintsFor()`/`helpSections()` both derive from `KEYMAP`   |
| Search finds people not posts                                                            | `SearchScreen.runSearch()` early-returns for `mode==='posts'` — but `SearchPosts` **exists**: `posts.proto:44`, `PostService.searchPosts` (`post.service.ts:669`), `searchPostsInputSchema`. Only the client is unwired. | **[v]** open                                                              |
| Likes un-liked after re-login                                                            | Optimistic overrides survived the session change and masked fresh `viewer_state`.                                                                                                                                        | **[v]** fixed                                                             |
| Notifications don't auto-read                                                            | No on-view marking.                                                                                                                                                                                                      | **[v]** fixed — 800 ms dwell + `markReadThrough`                          |
| Can't reach the parent post in a thread                                                  | Parent rendered outside the `PostList`, so no movement key could land on it.                                                                                                                                             | **[v]** fixed — one list with `rowIndent`                                 |
| Arrow keys stop working after a while                                                    | Not reproduced. Most plausible: a `screenCapturing` flag never reset, or a stale `useInput` subscription after a rebuild under a running process.                                                                        | **[p]** the §4.2 layer stack removes the class                            |
| Images stop rendering                                                                    | One `InlineAttachment` mounts per attachment per visible row, unbounded, with no release on unmount. Kitty image ids and memory are **global to the terminal**, not to the process.                                      | **[v]** open — §2.6                                                       |
| No colour picker / file picker / autocomplete / markdown; hard to move around            | Never built. `ComposeScreen` is an append-only string with `slice(0,-1)` backspace — there is no cursor.                                                                                                                 | **[v]** open — §7                                                         |

Everything below is downstream of the first row: **a frame must never exceed the terminal.**

---

## 2. Rendering model

### 2.1 Why Ink smears

Ink renders a string and reconciles it against the previous one with cursor-up + erase-line
sequences sized by the number of lines it _thinks_ it wrote. Two things break that count:

1. **Frame taller than the window** — the terminal scrolls, Ink's cursor-up now points at the
   wrong line, and every later repaint overwrites live content. That is the overlap/cut corruption.
2. **A line wider than `columns`** — the terminal soft-wraps it into two rows; Ink counted one.
   That is the two-line status bar. `String.length` must never be used for width: emoji, CJK and
   combining marks make it lie. `string-width` is what Ink itself uses **[v]**
   (`ink/build/measure-text.js` → `widest-line` → `string-width`).

WSL and Windows Terminal only make it _more likely_ (their pty reports resizes later, so a frame
is more often rendered against a stale budget). The bug is ours either way.

### 2.2 The frame contract

The app is a fixed frame with **exactly one scrolling region**:

```
rows 0 .. H-1   content     the only scrolling region; owned by the current screen
row  H          separator   ─────────
row  H+1        notice      toast / offline banner / re-auth prompt — ALWAYS reserved
row  H+2        status      screen · connection · node · @handle · unread
row  H+3        hints       keys, wrap="truncate-end", never two lines
```

`FOOTER_ROWS = 4` **[v]** `app/layout.tsx`; `H = rows - FOOTER_ROWS`. There is deliberately
**no separate header row** — the status line is the header, and a row is expensive at 20 rows.

Rules:

- **The notice row is reserved even when empty [p].** `ToastLine` returns `null` today **[v]**;
  a frame whose height changes when a toast appears is a frame that will eventually be mis-diffed.
- Footer children get `flexShrink={0}` and `height={1}` + `overflow="hidden"` **[v, landing]**
  (`StatusBar` now does this); the content `Box` gets an explicit `height={H}` and
  `overflow="hidden"` so yoga clips rather than overflows even if a child mis-measures.
- **Evaluate a one-row slack budget (`H = rows - FOOTER_ROWS - 1`) [p]**: some terminals scroll
  when the last cell of the last row is written, and one wasted row is cheaper than a smear.
  Decide it with a WSL reproduction, not by argument.
- Below `MIN_TERMINAL_SIZE` (60×20 **[v]**) the frame is replaced by `TerminalTooSmall`, on every
  render, not just at mount.

**One size source.** `ContentSizeProvider` / `useContentSize()` **[v]** `app/layout.tsx` publish
the budget; `useWindowSize()` is called **once**, in the shell. This is not stylistic:
`ink-testing-library@4`'s fake stdout hard-codes `columns = 100` and **has no `rows` at all**
**[v]**, so `getWindowSize()` falls through to `terminal-size` **[v]** (`ink/build/utils.js`) and
frame height in tests is non-deterministic. **`App` therefore needs a test-only `size` prop [p]**
that seeds the provider, or the frame invariant cannot be tested at a chosen dimension.

### 2.3 The viewport is virtualized on _measured_ heights

**[v, landing]** `format/measure.ts` (`cellWidth`, `wrappedRowCount`, `truncateToWidth`,
`fitHints`), `components/list-viewport.ts` (`resolveTopIndex`, `computeViewport`),
`components/post-height.ts` (`measurePostRowHeight`); `PostList` consumes them via
`availableRows`/`availableColumns`.

Contract as this generalizes:

- `measureXHeight(item, width)` agrees with the component's JSX **line for line**, margins
  included. Under-count = smear; over-count = a wasted row. Every measured component gets a test
  using `renderToString(node, {columns})` **[v]** asserting `output.split('\n').length === measured`.
- Window start is **derived during render** from the previous position plus the selection — never
  written back from an effect **[v]** the pattern already used. Focus-following = move the window
  the minimum needed to keep the selection fully visible. Re-centring on every keypress is unreadable.
- Page keys step by the _actual_ item count of the current window, not a constant **[v, landing]**.
- `↑ N above` / `↓ N below` are part of the budget, not extra.
- **Generalize to `components/VirtualList.tsx` [p]** taking `items`/`measure`/`renderItem`;
  `PostList` becomes a wrapper. Notifications, search results, help, page blocks, conversations and
  community members all need the same arithmetic and must not each re-derive it.

### 2.4 Clipping rules

- Width is always `cellWidth()`/`string-width` **[v]**, never `.length`.
- **Single-line fields** (status, hints, counts, nameplate, notice) use `wrap="truncate-end"` inside
  a `Box` with explicit `width` **[v, landing]**.
- **Bodies** wrap and are measured before admission. A body over its row budget is _folded_ (§7),
  never clipped mid-sentence.
- **Never `wrap="truncate*"` on anything containing a Kitty placeholder** — `cli-truncate` appends
  U+2026 and corrupts the grid **[v]** (`docs/research/ink-kitty-graphics.md` §3).
- No hand-rolled `slice()` on display text: a wide glyph must not be split at the clip boundary.

### 2.5 Resize and clear

- SIGWINCH re-renders with a new budget **[v]** (Ink subscribes to `stdout.on('resize')`).
- A resize that changes the target image grid by more than a cell releases live placements and
  re-prepares with a new id **[v]** research §6.9.
- Alt-screen is Ink's (`alternateScreen: true` **[v]** in `cli.tsx`); never hand-roll `\x1b[?1049h`.
- Teardown writes inside React are **discarded** **[v]** (`render.d.ts`: "Ink intentionally treats
  alternate-screen teardown output as disposable"), so `d=I` deletes and the cursor restore go
  through `installMediaCleanup` / `installTerminalCleanup` on `exit`/`SIGTERM` **[v]**.

### 2.6 Image policy — decided **[p]**

Inline Kitty rendering is allowed in **exactly three places**: the **currently selected row** of a
list, the **focused post** of a thread, and the full-screen **`MediaViewerScreen`**. Everything else
renders the spec §75 fallback box — and **the box and the image occupy the identical measured
height**, so switching never changes layout and `measurePostRowHeight` stays protocol-independent.

Why not inline everywhere (the naive reading of §73): a virtualized list mounts and unmounts rows
constantly; each mount is a transmit + placement, each unmount owes a `d=I`. Unbounded churn is
exactly how §74's requirement 5 ("scrolling/selecting posts does not leave ghost images") fails, and
it is the most likely cause of "images stopped rendering" — terminal-side image memory is a shared,
finite, session-scoped resource and ids are global to the terminal **[v]** research §6.4. Row height
would also become protocol-dependent, doubling the surface that can smear.

Why not fallback-only: §73 calls inline images "a key differentiating feature". Rendering the image
the reader is actually looking at keeps the differentiator at roughly 1/20th the churn.

Constraints: a bounded **LRU of ≤ 4 live placements** in the renderer, evicting with `d=I`;
`MediaViewerScreen` is a route (`{screen:'media', postId, index}`) with one placement released on
pop; `o` (open externally, §76) is unchanged **[v]**; plain mode or no session → fallback box.

#### 2.6.1 Non-Kitty rendering: terminal art, not just the box — decided **[p]**

`packages/terminal-media`'s `createRenderer(caps, stdout, { mode })` **[v]** picks one of four
renderer _kinds_ — `kitty` | `halfblock` | `ascii` | `box` — from an `ImageRenderMode`
(`'auto' | 'kitty' | 'pixel' | 'ascii' | 'box' | 'off'`). `'auto'` (the default) still prefers real
Kitty graphics when the probe confirms it, same as §2.6 above, but a non-Kitty terminal is **not**
automatically the §75 box anymore: it gets half-block art (`▀`/`▄` two-pixels-per-cell, truecolor or
xterm 256-colour depending on `COLORTERM`) or, when no colour is available at all (`NO_COLOR`,
`TERM=dumb`/unset), colourless dithered ascii art. Only an explicit `box`/`off` mode (or plain mode,
or no session) still renders the plain description box. `HalfBlockRenderer`/`AsciiRenderer` write
plain `<Text>` rows through Ink's own tree — no raw stdout APC writes, no terminal-side placement
state — so unlike Kitty they carry none of §2.6's scroll-churn constraints; the three-inline-places
rule above exists only because Kitty placements are a scarce, terminal-global resource.

The TUI's `images` preference (`apps/tui/src/preferences/store.ts`'s `ImagePolicy`:
`'auto' | 'pixel' | 'ascii' | 'box' | 'off'`, cycled on the Preferences screen, or the
`PATCHES_IMAGES` env var read once in `cli.tsx` before Ink's `render()`) maps 1:1 onto
`ImageRenderMode` (minus `'kitty'` — forcing the real protocol against an unconfirmed terminal isn't
exposed as a user preference, only `'auto'`'s own successful probe reaches it). `MediaViewerScreen`
draws whatever art the active renderer produces at the viewer's full budget (not a timeline row's
3-row default) whenever `renderer.kind !== 'box'`; see `docs/research/terminal-image-art.md` for the
half-block/256-colour/dithering technique and citations.

### 2.7 Plain-mode parity

**[v]** `PlainModeProvider`/`usePlainMode` already gate `Nameplate`, `RichBody`, `ToastLine`,
`Loading`, `MediaAttachments`. The rule new components inherit: **the same characters of content
render in plain mode; only decoration is removed.**

| Element       | Rich             | Plain                            |
| ------------- | ---------------- | -------------------------------- |
| selection     | bold + accent    | `> ` gutter                      |
| toast         | glyph + colour   | words only **[v]**               |
| spinner       | `ink-spinner`    | `Loading…` **[v]**               |
| markdown      | SGR              | source markers kept (`**bold**`) |
| mention/tag   | accent/green     | plain text, still navigable      |
| autocomplete  | highlighted row  | `> ` gutter                      |
| colour swatch | background block | `#rrggbb` text                   |
| media         | inline image     | §75 box, identical height        |
| confirm       | bordered strip   | `[y/n]` line                     |

Quiet feed (`~`, §185) is a second, independent switch hiding **other** actors' cosmetics; plain
mode wins where they overlap **[v]** `.claude/rules/tui.md`.

### 2.8 Terminal caveats

- **tmux** needs `allow-passthrough on`; `wrapTmuxPassthrough` exists **[v]**. tmux's status line
  already consumes a row — the budget comes from the pane size Ink reports, so never assume `rows`
  is the physical terminal height.
- **Windows Terminal / WSL**: no Kitty graphics → fallback always; resize reporting lags, which is
  what the slack row in §2.2 is for. WSL is the harshest reproducer — verify frame fixes there.
- **Ghostty**: Kitty graphics confirmed **[v]** research §2.
- **Non-TTY**: `useInput` throws; interactive hooks stay gated on `isRawModeSupported` **[v]**.

---

## 3. Layout system

The frame in §2 is the substrate. On top of it sit three composition primitives —
**split panes**, **overlays**, and **drawers** — plus responsive tiers that decide which are
available. All **[p]**; new directory `apps/tui/src/components/layout/`.

### 3.1 Responsive tiers

`app/layout.tsx` grows `computeLayout(columns, rows)` returning
`{ contentRows, contentColumns, widthTier, heightTier, splitAvailable, drawerAvailable, overlay: {maxWidth, maxRows} }`.

| Width tier | Columns | Behaviour                                                                                                                                                         |
| ---------- | ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `narrow`   | < 80    | one column; no drawer; **overlays degrade to replacing the content region** (a centred box under 80 columns has no room); hints abbreviated by `fitHints` **[v]** |
| `standard` | 80–119  | one column; floating overlays, width `min(72, columns - 8)`; no drawer                                                                                            |
| `wide`     | ≥ 120   | split panes available; drawer available while `columns - 36 ≥ 84`                                                                                                 |

| Height tier | Rows  | Behaviour                                                                      |
| ----------- | ----- | ------------------------------------------------------------------------------ |
| too small   | < 20  | `TerminalTooSmall` **[v]**                                                     |
| `compact`   | 20–29 | no overlay borders (a border costs 2 rows), tighter fold thresholds, no drawer |
| `full`      | ≥ 30  | everything                                                                     |

A drawer takes its columns from the content region **before** split-pane math
(`contentColumns = columns - (drawerOpen ? DRAWER_COLUMNS : 0)`), so the frame invariant is
untouched by opening one.

### 3.2 Split panes — one stack, two presentations

The key decision: **there is no separate split-view state.** The single `NavStack` **[v]** is
rendered differently per tier. Each `Route` declares a `kind`:

| kind     | routes                                                                                                   |
| -------- | -------------------------------------------------------------------------------------------------------- |
| `list`   | home, local, profile, bookmarks, notifications, search, tagFeed, communities (timeline), messages (list) |
| `detail` | thread, page, postHistory, media                                                                         |
| `full`   | compose (full), login, accounts, editProfile, preferences, help, report, postEdit                        |

In `wide`:

```
top.kind === 'full'                                  → one pane, full width
top.kind === 'detail' && a list exists beneath it    → left = nearest list beneath, right = top
otherwise                                            → left = the list, right = a hint pane
```

Consequences that make this worth doing:

- `Enter` on a row **opens the thread in the right pane instead of replacing the screen** — the
  same `push()` call, a different presentation. That is the flex the owner is asking for, and it
  costs no new state.
- `Esc` still pops exactly one level; popping a detail just clears the right pane.
- Resizing from 130 to 100 columns collapses the same stack to full-screen screens **without
  changing history**. That property is directly testable and is the acceptance criterion.
- Left/right split defaults to 60/40 with a 48-column floor on the detail pane; below the floor the
  tier degrades to `standard`.

**Panes are regions** in the focus model (§4.5): `Tab` moves shell focus between the primary and
secondary pane **[v, shipped B-046]** — action keys dispatch only to the focused pane's screen
(`App.tsx`'s `renderEntry` gates each pane's own `useInput` on `focusedPane`). `Ctrl+W h` /
`Ctrl+W l` are a directional alias to the same focus state **[v, shipped B-048]** — `h` focuses
the primary (left) pane, `l` the secondary (right), a no-op when the screen isn't split. `Tab` is
the fast toggle for the common two-pane case; the `Ctrl+W` alias is the tmux/vim muscle-memory
path, and it stays correct if a third pane is ever added where "toggle" stops being well-defined.
Both prefixes are guarded off legacy text-entry screens (`ComposeScreen`'s `TextEditor` owns its
own `Ctrl+W` for kill-word-back — §5's text-editing bindings). The focused pane draws
`borderStyle="round"` with `theme.borderFocus`; unfocused uses `theme.border`. In plain mode
**neither pane has a border** — the focused pane's title takes a bold `> ` prefix instead (§3.5's
height rule below).

### 3.3 Overlays — verified compositing technique

Ink has no z-index **[v]**, so a floating overlay must be composited as a string. **This works, and
was verified by direct probe on 2026-08-18** against `ink@7.1.1` + `slice-ansi@9`:

1. When an overlay opens, snapshot the background once:
   `renderToString(<CurrentScreen/>, {columns: contentColumns})` **[v]**, split to lines, **pad every
   line to `contentColumns`**, cache. Invalidate on resize only.
2. Each frame, dim the background with `\x1b[2m … \x1b[22m`, splice the overlay's own
   `renderToString` output in at `(top, left)` using `slice-ansi` (ANSI-aware slicing), and emit one
   `<Text>` per composited row.
3. Assert `cellWidth(row) === contentColumns` for every row before emitting.

Probe results **[v]**: `renderToString` preserves SGR; `slice-ansi@9` slices without breaking
colour runs; Ink re-emits the composited string **verbatim** inside `<Text>` (the overlay's cyan
border and the background's dim both survived a round trip); line count preserved exactly.

The probe also found the trap: `renderToString` does **not** pad lines to `columns`, so an
un-padded background yields 44-wide normal rows next to 45-wide overlaid rows — a width mismatch,
which is precisely the §2.1 smear cause. **Padding to `contentColumns` before compositing is not
optional.**

Two more constraints from the same source:

- The background is a **frozen snapshot**: `renderToString` returns no-op values for terminal hooks
  and does not reflect effect-driven state **[v]** (`render-to-string.d.ts`). For a modal that is a
  feature — frozen and dimmed is the intent — and it means the background is _not_ re-rendered while
  the overlay is open, so overlays cost fewer repaints, not more.
- **Release Kitty placements when an overlay opens** and let the snapshot render the §75 box:
  slicing a placeholder row would corrupt the grid **[v]**. §2.6's identical-height rule makes this
  free — the frame does not reflow.

In `narrow` width or `compact` height, overlays degrade to **replacing the content region** with no
border and no compositing. Same components, cheaper path, still readable.

Overlay kinds: quick-post compose, confirm dialog, file picker, colour picker, command palette,
media viewer.

### 3.4 Quick post and full compose

- **`c` opens the quick-post overlay** — bordered, centred, `min(72, columns-8)` wide, 6–10 rows:
  one `TextEditor` (§7.1), a character counter, `Ctrl+S` post, `Esc` keep draft and close, `Ctrl+F`
  expand to full compose.
- **`C` opens the full compose screen** — attachments, content warning, quote target, community.
  `C` is unbound today **[v]**.
- Both share **one** draft object and **one** `TextEditor`, so they cannot diverge. `r` (reply) opens
  the quick-post overlay pre-scoped, which is the single biggest reply-latency win available.

### 3.5 Drawers

`components/layout/Drawer.tsx` — a right-side column, `DRAWER_COLUMNS = 36`, available only in the
`wide` tier.

- **`N` toggles the notifications drawer** (`N` is unbound today **[v]**; `g n` remains the full
  screen, unchanged, so §191 is untouched). Latest 10, unread marked, mark-read-on-view reusing the
  existing 800 ms dwell logic **[v]**, `Enter` pushes the related route and closes the drawer, `Esc`
  closes.
- Below the width threshold `N` falls back to `g n` rather than doing nothing.
- A DM drawer reuses the same primitive later — not in P12.

### 3.6 Polish idioms, and the one rule that keeps them safe

- `theme/index.ts` gains `border`, `borderFocus`, `surfaceDim` alongside the existing six **[v]**.
  Defaults stay 16-colour ANSI names so the user's own palette wins **[v]**; truecolor appears only
  where the user picked it (flair, page theme).
- `Box borderStyle="round"` for panes, overlays and the drawer. **A border costs 2 rows and 2
  columns — always subtracted from the budget before measuring, never after.**
- Upload progress uses `@inkjs/ui`'s `ProgressBar` **[v]** (`@inkjs/ui@2.0.0` is already a
  dependency), replacing today's `Uploading foo… 42%` string **[v]**.
- **Relative time ticks from one interval in the shell** (30 s), published via context — never a
  timer per row. A thousand row-timers is how a TUI starts dropping frames.
- **The restraint rule:** decoration may never change _measured height_ between rich and plain mode.
  A border in rich mode becomes a blank gutter line in plain mode, not a removed row — otherwise
  pressing `P` reflows the entire app and every measured height is wrong for one frame.

---

## 4. Navigation model

### 4.1 Typed route stack

**[v]** `app/navigation.ts` gives `NavEntry` (a discriminated union carrying each screen's whole
payload), `NavStack`, and pure `push`/`pop`/`jump`/`replace`/`reset`. Right shape; it needs to grow:

```ts
// apps/tui/src/app/routes.ts  [p] — extracted from navigation.ts + keymap.ts
export type Route =
  | {
      screen:
        | 'home'
        | 'local'
        | 'help'
        | 'search'
        | 'compose'
        | 'login'
        | 'accounts'
        | 'bookmarks'
        | 'notifications'
        | 'editProfile'
        | 'preferences';
    } // `,` §191
  | { screen: 'profile'; actorId: string; knownActor?: Actor }
  | { screen: 'thread'; postId: string }
  | { screen: 'page'; handle: string; slug: string }
  | { screen: 'report'; target: ReportTarget }
  | { screen: 'media'; postId: string; index: number } // §2.6
  | { screen: 'postEdit' | 'postHistory'; postId: string } // `E` / `H` §191
  | { screen: 'messages'; conversationId?: string } // `g d` §191
  | { screen: 'communities'; communityId?: string; pane?: 'timeline' | 'members' | 'about' }
  | { screen: 'tagFeed'; tag: string }; // `#` §191
```

Root is `home` signed in, `local` otherwise **[v]**. Drill-down pushes. `g x` chords `jump()`: a
root screen resets the stack, a screen already on the stack unwinds to it rather than duplicating
**[v]**. **[v, shipped B-042]** Plain `g <key>` always replaces the current screen — it never
auto-splits; `Ctrl+g <key>` is the explicit way to open the destination in the second pane
(`goTo(next, { split: true })` in `App.tsx`). `replace()` is for "content changed, history shouldn't deepen" — a posted reply replaces
`compose` with the thread it answers **[v]**.

### 4.2 `Esc` pops the innermost layer, always

```
modal     confirm dialog, picker, command palette   ← Esc closes this first
sub-mode  guestbook signing, block editor, attach prompt, autocomplete popover
screen    the nav stack                             ← Esc pops this last
```

Today this is two ad-hoc booleans, `capturesInput(screen)` and `screenCapturing` **[v]**, which is
precisely why some screens trap you. Replace with an explicit contract **[p]**:

```ts
// apps/tui/src/app/input.tsx
export interface KeyLayer {
  id: string;
  onKey(input: string, key: Key): boolean;
} // true = consumed
export function useKeyLayer(layer: KeyLayer, isActive: boolean): void;
```

One `useInput` at the shell dispatches top-down through the layer stack. Consequences:

- A screen never _disables_ the shell; it _consumes_ what it wants. `Esc`, `Ctrl+C` and the command
  palette are handled by the shell after the top layer declines, so no state can make them
  unreachable — that is the structural fix for "you're stuck".
- Text layers consume printable characters, so `c`/`g h`/`/` don't fire while typing — today's
  behaviour, without a global disable.
- `q` pops with depth, quits at root **[v]**; inside a text layer it types `q`.
- `Q`-as-quit **[v]** in `App.tsx` is removed: §191 assigns `Q` to quote, and `q`-at-root plus
  `Ctrl+C` already cover quitting.

### 4.3 Where back goes

| From                                       | `Esc` lands on                                            |
| ------------------------------------------ | --------------------------------------------------------- |
| help                                       | the screen `?` was pressed from                           |
| thread                                     | the list the post was opened from (each drill is a level) |
| profile                                    | whatever pushed it (row, search result, notification)     |
| media viewer                               | the post's row, selection preserved                       |
| compose (new / reply)                      | the screen `c`/`r` was pressed from — draft kept          |
| postEdit                                   | the thread; on save the thread re-reads                   |
| report / login / editProfile / preferences | the screen that opened them                               |
| page sub-mode                              | the page (sub-mode first, then the page)                  |
| root                                       | `q` quits; `Esc` does nothing                             |

### 4.4 Modal layer

The _technique_ is §3.3 (verified string compositing over a frozen, dimmed snapshot); this is where
modals sit in the interaction model. `apps/tui/src/app/modal.tsx` **[p]** owns a stack above the nav
stack; the status line shows the modal's title, the hint line its keys:

- **Confirm dialogs** are a 3-row strip at the bottom of the content region (title, body, `y/n`) —
  cheap to measure, keeps context visible, and needs no compositing. Used by `d` delete, `B` block, `M` mute, discard
  draft, leave community, decline request.
- **Palette, pickers, quick post and the media viewer** are floating overlays where the tier allows
  it (§3.1), and take the whole content region where it does not.
- Modals live in their own stack above the nav stack and are dropped on navigation.

### 4.5 Focus model

**One focus ring per screen**: an ordered list of focusable regions; the focused region owns the
movement keys.

- `Tab` / `Shift+Tab` move between regions — **uniformly, everywhere**, and a split pane is itself a region (§3.2). This is the fix for
  `SearchScreen`'s `Tab` meaning "people/posts" **[v]**: the mode selector becomes a _region_, and
  `←`/`→`/space switches it while focused. `Tab` keeps one meaning app-wide.
- **Lists** own `↑↓`/`j``k`, `PgUp`/`PgDn`, `Ctrl+U`/`Ctrl+D`, `g g`/`G`, and `Home`/`End` **[p]**
  (`list-movement.ts` **[v]** has the rest).
- **Forms** own `Tab`/`Shift+Tab` between fields, `Ctrl+S` submit, `Esc` cancel.
- Ink's `useFocus`/`useFocusManager` **[v]** are used for **form screens only** (edit profile,
  preferences, compose's field group). Screen-level region focus is explicit screen state, because
  Ink's manager owns `Tab` globally and would fight the layer stack.
- The focused region shows in the status line (`Search › results`) and in plain mode as a `> `
  gutter — never colour alone.

---

## 5. Key grammar

### 5.1 One source of truth

**[v]** `app/keymap.ts` exports a single `KEYMAP: Binding[]` feeding both `hintsFor()` (status) and
`helpSections()` (`?`). Keep it; extend `Binding` **[p]** with `region?: string` and
`destructive?: boolean`, and add a test that fails on a duplicate key within one screen+region scope.

### 5.2 Consistency rules

1. **Lowercase = a verb on the current selection** — `r` `l` `b` `f` `p` `o` `v` `d` `t` `m` `e` `s` `c`.
2. **`g` + letter = go to a screen.** Never a verb.
3. **Uppercase = rare, destructive, state-changing, or the "bigger" form of a lowercase verb** —
   `R` `Q` `E` `H` `B` `M` `L` `P` `G` `J`, plus `C` (full compose vs `c` quick post) and `N`
   (notifications drawer vs `g n` full screen). Both are unbound today **[v]**.
4. **`Ctrl` chords belong to editors and the shell's rare actions** — `Ctrl+S` `Ctrl+A` `Ctrl+X`
   `Ctrl+Z` `Ctrl+R` `Ctrl+P` `Ctrl+D`/`Ctrl+U`.
5. **Punctuation = a mode or a jump** — `/` `?` `!` `#` `,` `~` `:` `[` `]`.
6. A key may mean different things **on different screens**, never on the same screen.

### 5.3 The three real collisions with §191

§191 says it "MUST NOT rebind an existing binding" and was "chosen to avoid every binding already
documented in `docs/user-guide.md`". That table **[v]** (`docs/user-guide.md:143–167`) contains no
`R`, no `Q`, no `j`, no `E`.

| §191 key           | Collides with                                              | Resolution                                                                                                                                                                                                                                                                                                  |
| ------------------ | ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `R` repost         | `R` = refresh, global **[v]** `keymap.ts` (§69's baseline) | **`R` becomes repost** — §191 amends §69 explicitly. **Refresh moves to `Ctrl+R`**: a chord (rule 4), absent from the user guide, matching the universal reload convention. `R`-as-refresh is younger than the user guide; it is the binding that moves.                                                    |
| `Q` quote          | `Q` = quit **[v]** `App.tsx`                               | **`Q` becomes quote.** `Q`-as-quit is undocumented and redundant.                                                                                                                                                                                                                                           |
| `j` join community | `j` = next item, everywhere **[v]**                        | **`j` stays "next item"; join/leave becomes `J`.** Rebinding the most-used key in the app would break movement everywhere and would itself violate §191's own no-rebind sentence and §194. **This is the one place this design departs from §191's literal text — it needs a one-line owner confirmation.** |

Non-collisions, recorded so they aren't re-litigated: `E` (post edit, list screens) vs `E` (page
block editor, `page`) — different screens, rule 6. `m` (message a profile) vs `m` (mark all read,
`notifications`) — different screens. `d` is free (`Ctrl+D` is a distinct chord). `t`, `#`, `,`,
`~`, `H`, `g d`, `g c` are unbound today **[v]**.

Pre-existing inconsistency to fix here: `v` means "reveal CW" on list screens and "visit page" on
profiles **[v]**, but `docs/user-guide.md:160` documents only "visit page". Keep both (rule 6) and
correct the guide.

### 5.4 The table

**Global** (any screen, outside a text layer): `Esc` back one layer · `q` back/quit at root ·
`Ctrl+C` quit · `?` help · `:` / `Ctrl+P` palette **[v]** (a true overlay over a frozen
`renderToString` snapshot, `VirtualList`-backed so arrow-key selection stays visible — B-043) ·
`/` search · **`c` quick post** (into the
focused community when there is one, §191) · **`C` full compose** · **`N` notifications drawer** · **`Ctrl+R` refresh (moved from `R`)** · `L` account ·
`P` plain mode · **`~` quiet feed** · **`,` preferences** · `g h`/`g l`/`g p`/`g e`/`g b`/`g n`/`g v`/`g s` ·
**`g d` messages** · **`g c` communities** · `g g` top · **`Tab` next region (pane, then the pane's regions) [v, shipped B-046]** · **`Ctrl+W h`/`Ctrl+W l` focus the primary/secondary pane directly [v, shipped B-048]** · **`Ctrl+g <key>` opens the destination in the second pane; plain `g <key>` never auto-splits [v, shipped B-042]**.

**List regions:** `j`/`↓` next · `k`/`↑` prev · `G` last · `Home`/`End` **[p]** ·
`Ctrl+D`/`PgDn`, `Ctrl+U`/`PgUp` half page · `n`/`space` load more · `Enter` thread · `p` author ·
`r` reply · `l` like · `b` bookmark · `f` follow author · `o` open media externally · `v` reveal CW ·
`!` report · **`R` repost** · **`Q` quote** · **`E` edit own** · **`d` delete own (confirm)** ·
**`H` history** · **`t` tags** · **`#` tag feed** · **`i` media viewer [p]**.

**Screen-scoped:** `profile` → `f` `e` `v` `B` `M` **`m` message** **pin/unpin** ·
`page` → `[` `]` `e` `E` `s` · `communities` → **`J` join/leave** ·
`compose` → `Ctrl+S` `Ctrl+A` `Ctrl+X` **`Ctrl+Z` undo [p]** **`Ctrl+F` expand quick post to full [p]** · `notifications` → `m` mark all read ·
`accounts` → `a` `x`.

---

## 6. Feedback and state

- **Loading is per region, never a blank frame.** A screen renders its chrome immediately with
  `<Loading label>` **[v]** in the waiting region. A screen that has ever had content must never
  replace it with a spinner on refresh — that is what makes the app feel like it lost your place.
- **Optimistic actions** keep today's shape **[v]** (`decoratePost` + `reactionOverrides`, applied
  at render over the server's last value, reverted on failure, cleared on session change). Extend
  the same overlay to repost and pin. Every action toasts; every rollback toasts what failed.
- **Toast** is the reserved notice row with a short queue — a second toast replaces the first rather
  than stacking. 2.5 s info / 5 s error **[v]**.
- **`↑ N new`** exists from `usePaginatedList.refresh()`'s `newCount` **[v]**; promote it to a
  sticky one-row banner at the top of the content region that `Ctrl+R`/`g g` clears **[p]**.
- **Unread badge** in the status line **[v]** (`useUnreadCount`, 60 s + screen-change key).
  Mark-read-on-view is landed **[v]**.
- **Offline / reconnect banner [p]** in the notice row: `offline — retrying in 4s`, countdown driven
  by the API layer's retry schedule (§45), `Ctrl+R` to retry now. `useServerInfo` already tracks
  `connecting|ready|error` **[v]**.
- **Session expiry never loses a draft [p].** When `ensureAccessToken()` fails `UNAUTHENTICATED`,
  the shell pushes an **inline re-auth modal** over the current screen and replays the action on
  success. Compose is not popped; the draft is already persisted on every keystroke **[v]**.
- **Error copy** is human and never a gRPC status **[v]** (`describeGrpcError` →
  `FriendlyError {title, hint, retryable}`). Render `hint` in the notice row — today only `title`
  is used **[v]**.

---

## 7. Rich input **[p]** — `apps/tui/src/components/input/`

**`TextEditor.tsx`** replaces `ComposeScreen`'s append-only string **[v]**. State is
`{lines, row, col}` plus an undo ring. Movement: arrows, `Ctrl+A`/`Ctrl+E` line ends, word-wise with
`Alt+←/→`, `Ctrl+K` kill-to-end, `Ctrl+W` delete-word-back, `Ctrl+Z`/`Ctrl+Y` (ring of 50).
**Paste uses Ink's `usePaste`** **[v]** — bracketed paste is enabled automatically and pasted text
never reaches `useInput`, which is exactly why pasting a URL is unusable today. The editor is
measured and scrolls internally with the same viewport arithmetic as a list; the cursor is always
visible. The character limit comes from `GetNodeInfo.max_post_chars` **[v]** with `POST_BODY_LIMIT
= 5000` **[v]** as fallback — never hardcoded alone. The content-warning field is a second
single-line region in the same ring.

**`Autocomplete.tsx`** renders a measured list **directly beneath the editor**, inside the content
budget (no floating layer — §3.3). `@` or `#` at a word boundary opens it and starts a 150 ms
debounced `SearchActors` **[v]** / `SearchTags` **[v]** (`tags.proto:13`) query. `↑↓` select,
`Tab`/`Enter` accept, `Esc` closes the popover only (sub-mode layer). Path completion is the same
component over a `readdir` source. Capped at 8 rows so the editor never loses more than 8.

**`FilePicker.tsx`** replaces the raw path prompt **[v]**: directory listing, type-to-filter,
`Enter` descends or selects, `..` ascends, non-images rejected with the existing
`InvalidAttachmentError` copy **[v]**. Never interpolate a path into a shell (§76) — the argv-array
spawn stays.

**`ColorPicker.tsx`** for nameplates, flair and page themes (§171, §173, §184): a 6×6×6 swatch grid
plus a hex field. Degradation is chalk's via Ink's `backgroundColor` — truecolor → 256 → 16 by
detected support. Plain mode shows `#rrggbb`. **The contrast floor is enforced by us** (§192): a
below-floor pick is rejected with a reason before it can be saved.

**`ConfirmDialog.tsx`** — the 3-row strip (§4.4) behind every `destructive` binding.

**Command palette** (`:` or `Ctrl+P`) is a filtered list built **from `KEYMAP` itself**, so it is a
discoverability layer, not a second registry: typing `rep` offers "Repost selected post (R)" and
"Report (!)"; running one shows its key in the toast, so the palette teaches the keyboard. Routes
appear as "Go to Home (g h)". This is how a new user finds `~`, `,`, `t` and `H` without reading help.

---

## 8. Rendering post bodies

- **Sanitize first, always** **[v]** `format/sanitize.ts` (strips C0/C1/DEL, keeps `\n`, tabs → space).
  Every body, bio, CW, alt text, nameplate, flair, tag, community name and DM body goes through it.
- **Markdown-lite [p]** `format/markdown.tsx`, deliberately small: `**bold**`, `*italic*`,
  `` `code` ``, fences, `> quote`, `- `/`1. ` lists, bare and `[]()` links. No tables, no images, no
  HTML, no nesting beyond one level. Every construct needs a matching measurement function (§2.3) —
  which is itself the reason to keep the grammar small. `pages/render/markdown.tsx` **[v]** already
  exists for Pages: extract the shared core, don't write a second parser.
- **Plain mode keeps the source markers** (`**bold**` stays literal) so nothing becomes invisible.
- **`@mention` / `#tag`** stay highlighted **[v]** `format/rich-text.tsx` and become _navigable_:
  `t` lists the selected post's tags, `#` opens the tag feed for the first (§191), and the palette
  offers "Open @handle" per mention.
- **`— read more` fold**: in feed contexts a body folds past the node's threshold (P11-009's
  ~10 lines / 500 chars, derived from node limits); `Enter` shows it in full. **Computed from
  measured rows, not characters**, so it does the job it exists for.
- **Links are never auto-opened**; URLs are validated (§104) before any spawn.

---

## 9. Using Ink 7 properly

Verified against installed `ink@7.1.1` **[v]** (`build/index.d.ts`, `render.d.ts`).

**Use:** `alternateScreen: true` **[v, in use]**; `incrementalRendering: true` **[p]** (only changed
lines rewritten — materially less repaint churn under a Kitty placement, research §3.4);
`useWindowSize()` exactly once, in the shell; `measureElement`/`useBoxMetrics` **[v]** to _verify_ a
measured height in a dev assertion, never to drive layout (they report after a layout pass — driving
layout from them is a render loop); `usePaste` **[v]**; `useFocus`/`useFocusManager` **[v]** for
forms only; `Transform` for the selection gutter and plain-mode stripping applied in one place;
`Spacer`/`Newline`; explicit `width`/`height` on every `Box` holding measured content; `ink-spinner`
**[v, in use]**; `renderToString(node, {columns})` **[v]** for the measurement tests; `kittyKeyboard`
**[v]** `RenderOptions` **[p]** behind a capability check, for disambiguated modifiers (reliable
`Shift+Tab`, `Ctrl+Enter`), with the existing parser as fallback.

**Do not:**

- **`<Static>` — banned in the app shell.** Its output is written once and never rewritten, so a
  Kitty placement inside it can never be deleted (research §6.10) and its rows sit outside the frame
  budget. Fine in non-interactive CLI subcommands.
- **`console.log`/`console.error` in the render path** **[v]** — corrupts the alternate screen.
  Diagnostics go to a file.
- **`useStdout().write()`** for graphics — it erases and repaints Ink's frame; use
  `useStdout().stdout.write()` **[v]**.
- **APC sequences inside `<Text>`** — Ink strips them **[v]**. **`<Text color>` around a placeholder
  row**, or `wrap="truncate*"` on one **[v]**.
- **Re-mounting a list on every fetch** — keying a `PostList` on the fetch nonce throws away
  selection and re-transmits every image. `refreshKey` must change the _data_, not the component
  identity **[v]** — which is what it does today; keep it that way.
- **`setState` in an effect to compute a value** — derive during render **[v]**.
- **Mouse.** SGR mouse reporting needs a raw `stdin` listener competing with Ink's parser (a
  documented hazard, research §6.3), breaks native text selection, and buys nothing where §69
  already requires every affordance to have a key. Revisit only if Ink ships a supported mouse
  channel. See ADR 0018.

---

## 10. Migration path

Five stages, each independently shippable and revertable, with disjoint file sets so 4–6 agents can
run in parallel. (Four before the owner's layout addendum; §3 is now its own stage.)

**Stage A — the frame (in flight).** Owns `app/App.tsx`, `app/layout.tsx`,
`components/layout/Frame.tsx` (new), `components/{list-viewport,post-height}.ts`, `format/measure.ts`,
`components/{PostList,PostRow,StatusBar}.tsx`, `components/VirtualList.tsx` (new). Ships a frame that
provably fits, virtualization on measured heights, the reserved notice row, test size injection.
**Locked by** `test/frame-invariant.test.tsx`: render at 60×20, 80×24, 100×30, 200×60 and after a
simulated resize, on every screen, with a 1000-post feed; assert `line count ≤ rows` and
`max(cellWidth(line)) ≤ columns` for **every** frame in `frames`, not just `lastFrame()`. Plus
per-component `renderToString` height tests.

**Stage B — navigation, keys, modals.** Owns `app/{routes,navigation,keymap,input,modal}.ts(x)`,
`components/{ConfirmDialog,CommandPalette}.tsx`, `screens/HelpScreen.tsx`, `StatusBar`'s hint
rendering, `docs/user-guide.md`. Ships the key-layer stack, `Esc` = pop innermost, the §4.3
resolutions, the overlay/modal layer, the palette, region-aware hints. **Locked by**
`test/esc-everywhere.test.tsx` (reach every route, press `Esc`, assert depth decreases and the
shell's keys still respond) and `test/keymap-help.test.ts` (every binding appears in `?`; no
duplicate within a screen+region; every §191 key present; no user-guide key rebound).

**Stage C — composition: split panes, overlays, drawers.** Owns
`apps/tui/src/components/layout/{SplitPane,Overlay,Drawer}.tsx`, `app/layout.tsx` (tiers),
`app/routes.ts` (`kind` metadata), `theme/index.ts` (tokens). Ships the §3 layout system: tier
computation, one-stack/two-presentations split view, the verified overlay compositing path, the
notifications drawer, quick post. **Locked by** `test/layout-tiers.test.tsx` (the same nav stack at
70/100/140 columns renders stack / stack / split with **identical history**; resizing across a tier
boundary changes presentation and not the stack) and `test/overlay-composite.test.tsx` (every
composited row is exactly `contentColumns` wide; SGR survives the round trip; a Kitty placement is
released before the snapshot; `narrow`/`compact` degrade to region replacement).

**Stage D — rich input.** Owns `components/input/**` (new), `screens/ComposeScreen.tsx`,
`screens/SearchScreen.tsx`, `screens/PreferencesScreen.tsx` (new), `screens/EditProfileScreen.tsx`,
`compose/draft-store.ts`. Ships the editor, autocomplete, file picker, colour picker, post search,
preferences. **Locked by** `test/compose-editor.test.tsx` (cursor, undo, paste, autocomplete accept,
draft survives navigation and a simulated session expiry) and `test/search.test.tsx` (posts mode
returns posts; `Tab` uniformity).

**Stage E — bodies, media, Amendment B screens.** Owns `format/markdown.tsx`,
`components/PostBody.tsx`, `components/MediaAttachments.tsx`, `screens/MediaViewerScreen.tsx` (new),
`packages/terminal-media/src/renderer.ts` (placement LRU), plus P11-009…013's screens. Ships
markdown-lite, the fold, the §2.6 image policy, the viewer, and the tag/DM/community/flair screens on
the new primitives. **Locked by** `test/virtualization.test.tsx` (1000 posts: budget held, selection
visible, no re-mount on refresh, nothing transmitted for an off-screen row),
`test/media-policy.test.tsx` (inline and fallback measure identically; ≤ 4 live placements; every
placement released on pop) and `test/thread-focus.test.tsx` (`k` from the focused post reaches the
parent; `r` there replies to the parent; the reply lands back on the parent's thread).

---

## 11. P12 task list

Ranked. No two tasks within a stage share a file. 26 rather than the 20 originally scoped — the
layout addendum (§3) adds P12-020…025.

| ID      | Title                                                                                         | Owns                                                                                                                              | Acceptance                                                                                                                                                                                                                                                                                                       |
| ------- | --------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P12-001 | Frame budget + content-size provider + `Frame` component                                      | `apps/tui/src/app/layout.tsx`, `components/layout/Frame.tsx`                                                                      | `computeContentSize` unit-tested; footer always exactly `FOOTER_ROWS`; notice row reserved when empty; a `size` override seeds the provider; grep test proves nothing outside `layout.tsx` calls `useWindowSize`                                                                                                 |
| P12-002 | Shell adopts the frame — content box gets explicit height + `overflow="hidden"`               | `apps/tui/src/app/App.tsx`                                                                                                        | every screen renders inside the budget; `TerminalTooSmall` re-checked every render; no `justifyContent="space-between"` height hack remains                                                                                                                                                                      |
| P12-003 | Frame-fits invariant test, 4 sizes × every screen × 1000 posts                                | `apps/tui/test/frame-invariant.test.tsx`, `test/harness.tsx`                                                                      | asserts line count ≤ rows and `cellWidth(line)` ≤ columns for **every** frame in `frames`; fails on the pre-fix commit                                                                                                                                                                                           |
| P12-004 | Generalize the viewport into `VirtualList`, adopt in every list                               | `apps/tui/src/components/VirtualList.tsx`, `components/PostList.tsx`, `screens/NotificationsScreen.tsx`, `screens/HelpScreen.tsx` | one measurement path for posts/notifications/help/search; `Home`/`End` in `list-movement.ts`; per-component `renderToString` height tests                                                                                                                                                                        |
| P12-005 | Key-layer stack replaces `capturesInput`/`screenCapturing`                                    | `apps/tui/src/app/input.tsx`, `app/App.tsx`, `app/keymap.ts`                                                                      | one `useInput` at the shell; `Esc`/`Ctrl+C`/palette reachable from every screen **and** sub-mode; no screen can disable the shell; typing in compose does not fire `c`/`g h`                                                                                                                                     |
| P12-006 | Route table + `Esc`-from-everywhere test                                                      | `apps/tui/src/app/routes.ts`, `app/navigation.ts`, `test/esc-everywhere.test.tsx`                                                 | every `Route` variant reachable and poppable; the test walks all routes; `replace()` used for the post-reply landing                                                                                                                                                                                             |
| P12-007 | Keymap v2 — `R`→repost / `Ctrl+R`→refresh, `Q`→quote, `J`→join, all §191 keys                 | `apps/tui/src/app/keymap.ts`, `screens/HelpScreen.tsx`, `docs/user-guide.md`                                                      | `keymap-help.test.ts` proves no user-guide key rebound, no duplicate within a screen+region, every §191 key present; help and hints regenerate from `KEYMAP`                                                                                                                                                     |
| P12-008 | Modal layer + `ConfirmDialog` on every destructive binding                                    | `apps/tui/src/app/modal.tsx`, `components/ConfirmDialog.tsx`                                                                      | `d`/`B`/`M`/discard-draft/leave-community confirm; `Esc` closes the modal only; measured within the content budget; plain form is `[y/n]`                                                                                                                                                                        |
| P12-009 | Command palette (`:` / `Ctrl+P`) generated from `KEYMAP`                                      | `apps/tui/src/components/CommandPalette.tsx`                                                                                      | every non-`helpOnly` binding and every route invocable; running one toasts its key; no second key registry exists                                                                                                                                                                                                |
| P12-010 | Feedback layer — per-region loading, toast queue, offline banner, sticky `↑ N new`            | `apps/tui/src/components/{Toast,Loading,Banner}.tsx`, `hooks/useServerInfo.ts`                                                    | a refreshing screen never blanks its content; banner shows a live retry countdown + `Ctrl+R`; `FriendlyError.hint` rendered                                                                                                                                                                                      |
| P12-011 | Inline re-auth on `UNAUTHENTICATED` without losing a draft                                    | `apps/tui/src/auth/session.ts`, `app/modal.tsx`, `screens/ComposeScreen.tsx`                                                      | expiry mid-compose pushes a re-auth modal over compose and replays the action; draft byte-identical afterwards; test simulates a 401 mid-post                                                                                                                                                                    |
| P12-012 | `TextEditor` — multi-line cursor, word/line movement, undo, `usePaste`                        | `apps/tui/src/components/input/TextEditor.tsx`                                                                                    | cursor always visible; internal scroll respects the row budget; `Ctrl+Z` ring of 50; multi-line paste arrives as one edit; limit from `GetNodeInfo.max_post_chars` with a 5000 fallback                                                                                                                          |
| P12-013 | `Autocomplete` popover for `@`/`#` over `SearchActors`/`SearchTags`                           | `apps/tui/src/components/input/Autocomplete.tsx`                                                                                  | 150 ms debounce; ≤ 8 rows; `Esc` closes the popover only; accepted mentions match the server's `MENTION_PATTERN`; plain mode uses a `> ` gutter                                                                                                                                                                  |
| P12-014 | `FilePicker` with path completion replaces the raw attach prompt                              | `apps/tui/src/components/input/FilePicker.tsx`, `screens/ComposeScreen.tsx` (attach flow)                                         | `~` expansion, directory descent, type-to-filter; non-image rejected with existing copy; no path reaches a shell string                                                                                                                                                                                          |
| P12-015 | `ColorPicker` + enforced contrast floor                                                       | `apps/tui/src/components/input/ColorPicker.tsx`, `screens/EditProfileScreen.tsx`                                                  | 216-swatch grid + hex entry; truecolor→256→16 exercised with `FORCE_COLOR` levels; below-floor picks rejected with a reason; plain mode shows hex                                                                                                                                                                |
| P12-016 | Wire post search to `SearchPosts`; search becomes focus regions                               | `apps/tui/src/screens/SearchScreen.tsx`, `api/client.ts`                                                                          | posts mode returns real results, keyset-paginated, chronological, no ordering parameter; `Tab` means "next region"; the "arrives with the next server release" string is gone                                                                                                                                    |
| P12-017 | Markdown-lite renderer + measured read-more fold                                              | `apps/tui/src/format/markdown.tsx`, `components/PostBody.tsx`, `components/post-height.ts`                                        | shared core with `pages/render/markdown.tsx`; every construct has a matching measurement; plain mode keeps source markers; fold from measured rows and node limits                                                                                                                                               |
| P12-018 | Image policy — bounded placements + `MediaViewerScreen`                                       | `apps/tui/src/screens/MediaViewerScreen.tsx`, `components/MediaAttachments.tsx`, `packages/terminal-media/src/renderer.ts`        | inline only for selected row / focused post / viewer; inline and fallback measure identically; ≤ 4 live placements with LRU `d=I`; scrolling 1000 posts leaves zero placements after `Esc`                                                                                                                       |
| P12-019 | Thread focus — parent reachable, reply lands right, `i`/`H`/`E`/`d` on the focused post       | `apps/tui/src/screens/ThreadScreen.tsx`, `test/thread-focus.test.tsx`                                                             | `k` from the focused post selects the parent and `r` replies to it; posting returns to the parent's thread; no duplicate stack frame re-opening the focused row                                                                                                                                                  |
| P12-020 | Responsive tiers in `computeLayout` (width < 80 / 80–119 / ≥ 120, height < 20 / 20–29 / ≥ 30) | `apps/tui/src/app/layout.tsx`                                                                                                     | pure and unit-tested at every boundary; drawer columns subtracted before split math; `narrow`+`compact` disable split, drawer and floating overlays                                                                                                                                                              |
| P12-021 | `SplitPane` — one stack, two presentations                                                    | `apps/tui/src/components/layout/SplitPane.tsx`, `app/routes.ts` (`kind`), `app/App.tsx` (pane wiring)                             | `Enter` opens the detail in the right pane without a second state; `Esc` clears the right pane; resizing 140→100 columns collapses to the stack with **identical history** (asserted); panes are `Tab` regions; focused pane borders with `theme.borderFocus`; plain mode has no borders and a `> ` title prefix |
| P12-022 | `Overlay` — frozen-snapshot compositing                                                       | `apps/tui/src/components/layout/Overlay.tsx`, `app/modal.tsx`                                                                     | background snapshotted once via `renderToString`, **padded to `contentColumns`**, dimmed, spliced with `slice-ansi`; every emitted row is exactly `contentColumns` wide (test); Kitty placements released before the snapshot; degrades to region replacement in `narrow`/`compact`                              |
| P12-023 | Quick post (`c` overlay) + full compose (`C`), one draft, one editor                          | `apps/tui/src/screens/ComposeScreen.tsx`, `components/layout/Overlay.tsx` (consumer), `app/keymap.ts`                             | `c` opens the overlay, `Ctrl+S` posts, `Esc` keeps the draft, `Ctrl+F` expands to `C`; `r` opens it pre-scoped; both surfaces share one `ComposeDraft` and one `TextEditor` (no duplicated editing logic)                                                                                                        |
| P12-024 | Notifications drawer (`N`)                                                                    | `apps/tui/src/components/layout/Drawer.tsx`, `screens/NotificationsScreen.tsx` (shared list)                                      | `wide` tier only, falls back to `g n` below it; `g n` unchanged (§191); mark-read-on-view reuses the 800 ms dwell; `Enter` pushes the route and closes; `contentColumns` reduced by `DRAWER_COLUMNS` so the frame invariant still holds (asserted)                                                               |
| P12-025 | Polish pass — theme tokens, borders, upload `ProgressBar`, single relative-time tick          | `apps/tui/src/theme/index.ts`, `components/{Toast,Loading}.tsx`, `media/upload.ts` consumers, `hooks/useNow.ts` (new)             | `border`/`borderFocus`/`surfaceDim` tokens; border cost subtracted before measuring; `@inkjs/ui` `ProgressBar` replaces the percent string; **one** 30 s interval publishes "now" via context (test asserts no per-row timer); rich and plain measure to the **same height** everywhere                          |
| P12-026 | Docs sync                                                                                     | `docs/architecture/tui.md`, `docs/user-guide.md`, `.claude/rules/tui.md`                                                          | a test parses the markdown key table and asserts it matches `KEYMAP`; every documented command actually run; the `v` reveal/visit ambiguity corrected                                                                                                                                                            |
