# Identity cosmetics: the shared capability-aware catalog (B-117 / #241)

Status: implemented

A profile's visual identity is decoration and nothing more (spec §173, §184: cosmetics **never**
gate function, a capability failure degrades them, and a custom glyph is only ever a skin).
B-117/#241 introduces a **single shared catalog** in `@patches/domain`
(`packages/domain/src/cosmetics.ts`) that both the React web and the Ink TUI collate against, so
the two clients agree on what a given capability set permits instead of each re-deriving
ad-hoc switches.

## What the catalog holds

- **`IdentityCosmeticCaps`** — the capability signal a client supplies:
  - `plain` — the viewer asked for no decoration at all (TUI plain mode).
  - `highContrast` — only the border frame survives (glow/gradient are ambiguous on colour).
  - `reducedMotion` — the animated "pop" is dropped.
  - `colorDepth` — `'truecolor' | '256' | '16' | 'none'`; `'none'` behaves like `plain`, and
    `'16'` keeps a frame but the frame selector still resolves to a static border.
- **`avatarFrameToken(frame, caps)`** — a web CSS token for an avatar frame
  (`'none' | 'border' | 'glow' | 'gradient'`) from a closed allow-list. `plain`/no-colour →
  `'none'`; `highContrast` → `'border'`; otherwise verbatim.
- **`nameTagToken(style, caps)`** — `'none' | 'badge' | 'ribbon' | 'pilled'`; `plain`/no-colour →
  `'none'`.
- **`popEmphasis(caps)`** — restrained, motion-aware emphasis: web gets a gentle one-beat pulse,
  the TUI a single accent dot. `false` under `plain`, `reducedMotion`, `highContrast`, no-colour.
- **`deterministicIdentityArt(seed)`** — handle-derived `{ accent: '#rrggbb', motif }` from a
  FNV-1a hash of the **lowercased** handle, drawn from a closed six-glyph allow-list. Always
  returns a value (there is no empty state), never derives from user text beyond the seed.

The module is **proto-agnostic** — it exports string-union tokens mirroring the wire enums — so
the browser bundle never pays for a Connect/proto runtime. Each client translates the wire enum to
the domain token at its boundary (`profileFrameToToken` / `nameTagToToken` in
`apps/web/src/routes/ProfileRoute.tsx` and `apps/tui/src/screens/ProfileScreen.tsx`).

## How each client feeds caps

- **Web** (`apps/web/src/hooks/useIdentityCosmeticCaps.ts`): `plain=false`, `highContrast=false`,
  `colorDepth='truecolor'`, and `reducedMotion` is a live subscription to
  `prefers-reduced-motion` (`apps/web/src/lib/theme.ts`). A `data-pop` attribute on the profile
  header appears only when `popEmphasis` returns true; the pop animation is additionally gated on
  `@media (prefers-reduced-motion: no-preference)` in the module CSS as defence-in-depth. A
  placeholder avatar (no uploaded image) renders the deterministic accent + motif.
- **TUI** (`apps/tui/src/screens/ProfileScreen.tsx`): emulates caps from `usePlainMode` +
  `colorDepth` from the terminal (`apps/tui/src/theme/color-depth.ts`, via
  `process.stdout.getColorDepth()`). Same selectors decide the Ink frame border, the name-tag
  glyph, and the pop accent dot; a profile with no `accentColor` still gets a handle-derived
  accent so its frame/border/badge never silently fall back to the theme accent.

## Degradation is identical by construction

Because both clients hand the **same** `avatarFrameToken`/`nameTagToken`/`popEmphasis` the same
capability truth, "no colour on this terminal / plain mode on" resolves to the same set of visible
decorations regardless of client. Tests enforce this at both boundaries:
`apps/web/src/routes/ProfileRoute.test.tsx` (mocked `prefers-reduced-motion` drops `data-pop`
while keeping the static frame) and `apps/tui/src/screens/ProfileScreen.test.tsx` (pop dot present
in rich mode, stripped under plain mode).

Feed-row cosmetics (a deterministic accent on every post author's name, quiet-feed-aware pop) are
a follow-up: they need `quiet`-feed threading through `PostRow` and mass snapshot updates, and a
repack on the profile header is the #241 core.
