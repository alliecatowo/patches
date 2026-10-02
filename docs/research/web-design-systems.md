# Web Design System Survey — Candidates & Recommendation

Status: researched | Verification date: **2026-08-30**

Stack context: React 19 (catalog pin), Vite (SPA), PWA via `workbox-*`, no SSR framework, Storybook already configured, CSS Modules per-component + `src/styles/tokens.css` for design tokens, hand-rolled UI primitives in `apps/web/src/components/ui/` (Button, Panel, ListRow, Avatar, EmptyState, Illustration, StatusChip = 7 named exports in `ui/index.ts`). Owner wants "light, portable, beautiful and user friendly" — not heavy CSS-in-JS, not lock-in-heavy, themable (already supports light/dark/custom themes), accessible primitives, and incremental adoption (no big-bang rewrite). Also requested brief assessment of the Ink 7 TUI.

Related board issue: #354.

---

## 1. Current Inventory (apps/web/src/components/)

### Hand-rolled UI primitives (shared, themable, consume only `tokens.css`)

| Component                  | Lines | Purpose                                                                    |
| -------------------------- | ----- | -------------------------------------------------------------------------- |
| `Avatar` / `AvatarCluster` | 76    | Actor avatar with deterministic initials tile + hue, cluster layout        |
| `Button` / `ButtonGroup`   | 83    | Variants (primary/secondary/ghost/danger), sizes, loading, icon-only       |
| `Panel`                    | 56    | Inline card with eyebrow/title/description/footer; used by e2ee surfaces   |
| `ListRow` / `UnreadDot`    | 90    | Two-line row (leading/title+meta/subtitle+trailing); router-link or button |
| `EmptyState`               | —     | Placeholder when collection is empty                                       |
| `Illustration`             | —     | SVG placeholder illustrations                                              |
| `StatusChip`               | —     | Tone-based badge (ok/warn/danger)                                          |

**Total: 7 primitives.** Small but cohesive. Each consumes only CSS custom properties from `tokens.css`; none fetch, route, or know domain types. They were assembled around issues #325/#336.

### Largest duplication offenders (domain-specific, not shared primitives)

- **PostCard / PinnedPosts / PostTimeline** — each implements its own variant of an actor row with avatar, nameplate, timestamp, and action buttons. The pattern repeats in conversation previews (`ListRow` partially covers this).
- **Dialog/modal patterns** — scattered across `EditWallDialog`, `NeedsAuthorityFlow`, e2ee panels; no shared `<Dialog>` primitive exists yet.
- **Input wrappers** — multiple screen-level forms each roll their own label/input/error/suggestion stack.

---

## 2. Candidate Survey

### Dropped candidates (reasons cited)

| Candidate               | Reason for dropping                                                                                                                                                                                                                                                                            | Source                                                                                                                                                                                                                    |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **AlignUI**             | npm does not host an `alignui` React package; the sole GitHub repo (`keell0renz/mirror-ui`) has 1 star, self-describes as a "shadcn/Radix structure" clone. Not production-viable.                                                                                                             | npm registry search; GitHub API                                                                                                                                                                                           |
| **Park UI + Panda CSS** | Park UI is a Radix-wrapper for Panda CSS styling. Requires both `@pandacss/dev` + `@ark-ui/react` + `@park-ui/core` (3 packages for what Ark UI alone provides). Adds significant build complexity for marginal gain over using Ark UI directly or going shadcn.                               | [Ark UI docs](https://ark-ui.com/docs) (v5.39.1)                                                                                                                                                                          |
| **Chakra UI v3**        | Chakra v3 depends on Emotion (`@emotion/use-insertion-effect-with-fallbacks`) — runtime CSS-in-JS at build time. The owner's constraint is "not too web-appy" and "no heavy runtime CSS-in-JS". Also requires `MantineProvider`-like wrapper. The primitives underneath are now Ark UI anyway. | [@chakra-ui/react latest npm metadata](https://registry.npmjs.org/@chakra-ui/react/latest): peerDep `>=18`, deps include 5 `@emotion/*` packages ([2026-08-30 fetch](https://registry.npmjs.org/@chakra-ui/react/latest)) |

Note: Chakra v3's `docs/get-started` at `v3.chakra-ui.com` returns 404; the project redirects to `chakra-ui.com`. Version 3.37.0 is the active release line.

### Evaluated candidates

#### A. shadcn/ui (copy-in, Radix under the hood, Tailwind)

- **How it works**: CLI copies component source into `components/ui/` as owned TSX + CSS (Tailwind class names by default). You own every byte. Upgrade by re-running `add <component>` or manually syncing.
- **React 19**: Yes — `@shadcn/react` declares peer `^19`. Official Vite installation documented. Monorepo support via `-c apps/web` flag.
- **Bundle weight**: Zero runtime dependency. Components are pure TSX + Tailwind utility classes resolved at build time. No CSS-in-JS, no framework.
- **Theming**: Customizable via Tailwind config (`tailwind.config.ts`) plus CSS variables injected through Radix's built-in CSS variable tokens. Works with existing CSS variable architecture — tokens can map onto `tokens.css` custom properties.
- **A11y**: Radix Primitives underneath (`@radix-ui/*`) — WCAG compliant, keyboard navigation tested.
- **Maintenance model**: Copy-in + ownership. You modify shipped code. Upstream updates require manual merge or re-copy. Low lock-in because you own the code.
- **"Web-appy" risk**: Medium-high if you accept defaults. The default Radix-based shadcn aesthetic (rounded corners, subtle shadows, indigo accent) reads very "Vercel/SaaS dashboard". However, since you **own** the code, stripping defaults down to your tokens is straightforward.
- **License**: MIT (`@shadcn/react` v0.3.0).
- **Components available**: 60+ base components, including Dialog, Select, Combobox, Tabs, Toast, Sheet, Dropdown Menu, Tooltip, Popover, Accordion, Carousel, Navigation Menu, Sidebar, Calendar, Form fields, DataTable, Charts.

Sources:

- [shadcn/ui introduction](https://ui.shadcn.com/docs) — 2026-08-30
- [shadcn/ui Vite installation](https://ui.shadcn.com/docs/installation/vite) — 2026-08-30
- [npm: @shadcn/react@0.3.0](https://registry.npmjs.org/@shadcn/react/latest) — peer dep `>=19`, 0 direct deps, MIT license

#### B. Radix Primitives standalone (unstyled, CSS anywhere)

- **How it works**: Pure unstyled headless primitives. You style everything yourself. One component = one independently versioned npm package (e.g., `@radix-ui/react-avatar`).
- **React 19**: Yes — peer dep `^16.8 || ^17 || ^18 || ^19 || ^19.0.0-rc` (confirmed via [npm](https://registry.npmjs.org/@radix-ui/react-avatar/latest)).
- **Bundle weight**: Very low per-primitive (~2–8 kb gzipped). Tree-shakeable (import only what you use). No CSS required — you write CSS in CSS Modules today, this works perfectly with that model.
- **Theming**: No built-in theming. You wire CSS variables / CSS Modules exactly as you do today. Full control, zero opinion.
- **A11y**: Gold standard. WAI-ARIA patterns tested against assistive tech. Screen reader tested. Keyboard navigation complete. Maintained by WorkOS (funding-stable org).
- **Maintenance model**: Dependency. You import primitives and compose. Stable API contracts. Minimal upgrade surface compared to full libraries.
- **"Web-appy" risk**: Near-zero — you control every pixel. Radix is invisible; it's just behavior and DOM structure. The app looks like whatever CSS you write.
- **License**: MIT.
- **Component count**: ~40 primitives (Dialog, Popover, Tabs, Menubar, Dropdown Menu, Combobox, Select, Switch, Slider, Toggle Group, Tooltip, Accordion, Collapsible, Scroll Area, Toast, Checkbox, Radio Group, Separator, Progress, Badge, Avatar, Presence, Focus Trap, Floating Portal, Resize Observer, etc.).

Sources:

- [Radix Primitives homepage](https://www.radix-ui.com/primitives) — 2026-08-30
- [Radix Primitives docs](https://www.radix-ui.com/primitives/docs/overview/introduction) — 2026-08-30
- [npm: @radix-ui/react-avatar@1.2.6](https://registry.npmjs.org/@radix-ui/react-avatar/latest) — peer dep includes `^19.0`

#### C. Mantine v9 (full library, CSS files, headless mode available)

- **How it works**: 120+ pre-styled React components. Ships actual `.css` files at build time (zero runtime CSS-in-JS core, though the PostCSS preset uses Emotion-like mixins at compile time). Also ships `HeadlessMantineProvider` for fully unstyled usage.
- **React 19**: Peer dep `^19.2.0` (strictly pinned; may lag behind React 19 minor releases). [Verified via npm](https://registry.npmjs.org/@mantine/core/latest).
- **Bundle weight**: Moderate — 5 dependencies in `@mantine/core`, CSS files included. Using only a handful of components still pulls in the whole CSS bundle unless tree-shaking is configured. Headless mode reduces this significantly.
- **Theming**: Excellent out-of-the-box theming system with `MantineProvider` and theme objects. Can reference theme tokens in CSS Modules via CSS variables (`var(--mantine-color-red-5)`). Would compete with your existing `tokens.css` — potential overlap.
- **A11y**: Good, though not as rigorously audited as Radix/Base UI. Follows common patterns but some edge cases may need work.
- **Maintenance model**: Dependency. Large upgrade surface — 120+ components change together. Breaking changes between major versions are real (v7→v8 was significant).
- **"Web-appy" risk**: Medium-high with defaults. Even stripped-down Mantine components have a recognizable "library feel" (the spacing rhythm, border treatment, default radii). The `unstyled` prop helps for individual components.
- **License**: MIT.
- **Bonus**: 70+ hooks (including useful ones like `use-hotkeys`, `use-resize-observer`, `use-eye-dropper`), form library (`@mantine/form`), storybook integrations.

Sources:

- [Mantine homepage](https://mantine.dev/) — 2026-08-30
- [Mantine styles overview](https://mantine.dev/styles/styles-overview/) — 2026-08-30
- [Mantine unstyled/headless docs](https://mantine.dev/styles/unstyled/) — 2026-08-30
- [npm: @mantine/core@9.5.2](https://registry.npmjs.org/@mantine/core/latest) — MIT, peer `^19.2.0`, 5 deps

#### D. Base UI v1 (unstyled, MIT, by MUI team)

- **How it works**: Unstyled headless primitives + low-level hooks. Similar API surface to Radix but developed by a larger, actively-funded team (ex-MUI/FloatingUI creators). Provides some components Radix lacks natively (Combobox, Autocomplete, nested dialogs).
- **React 19**: Yes — peer dep `^17 || ^18 || ^19`. [Verified via npm](https://registry.npmjs.org/@base-ui/react/latest).
- **Bundle weight**: Very low — 5 dependencies (`@floating-ui/react-dom`, `@base-ui/utils`, `@babel/runtime`, `use-sync-external-store`). Per-component packages are tiny.
- **Theming**: None built-in. Style however you want (CSS Modules, Tailwind, plain CSS). Matches your current model perfectly.
- **A11y**: Claims to go beyond ARIA APG patterns and comply with WCAG 2.2. Actively maintained by a dedicated 7-person team (full-time at Material-UI/MUI org).
- **Maintenance model**: Dependency. Smaller footprint than Radix for specific advanced patterns.
- **"Web-appy" risk**: Near-zero — unstyled, same as Radix.
- **License**: MIT.
- **Caveat**: Brand-new library (first stable release relatively recently). Community smaller, fewer community resources, potentially more edge-case bugs than Radix's decade-old track record. But actively funded and growing.

Sources:

- [Base UI homepage](https://www.base-ui.dev/) — 2026-08-30
- [npm: @base-ui/react@1.7.0](https://registry.npmjs.org/@base-ui/react/latest) — MIT, peer `^17 || ^18 || ^19`, 5 deps

#### E. daisyUI + Tailwind (semantic class names, no JS runtime)

- **How it works**: Tailwind CSS plugin providing semantic component class names (`btn`, `card`, `modal`, etc.). Zero JavaScript runtime — purely a CSS concern. 68+ component class sets.
- **React 19**: N/A — it's a CSS-only plugin. Works with any framework including React 19. Currently on v5.7.22. Supports Tailwind v4.
- **Bundle weight**: Zero JS. Tailwind purges unused classes at build time. Very small shipped payload if you use few components.
- **Theming**: Built-in theme system with 40+ named themes (dark, cupcake, forest, nord, etc.) plus fully customizable color names via CSS variables. Would integrate with existing `tokens.css` — you'd define your custom themes in the Tailwind config rather than CSS custom properties.
- **A11y**: **Weak point.** DaisyUI focuses on visual class names and basic HTML semantics. It does NOT provide ARIA attributes, focus management, keyboard navigation for complex widgets, or accessibility testing. Modals, dropdowns, select menus, tooltips lack proper dialog/menu patterns. For simple elements (buttons, badges, cards, alerts) it's fine; for interactive primitives (Dialog, Combobox, Popover, Select) you'd need additional libraries.
- **Maintenance model**: Dependency (one devDependency). Lightweight, well-maintained (42k GitHub stars).
- **"Web-appy" risk**: Medium — the default theme designs are pleasant but recognizable. Heavy customization possible via Tailwind utilities layered on top.
- **License**: MIT.

Sources:

- [daisyUI homepage](https://daisyui.com/) — 2026-08-30
- [npm: daisyui@5.7.22](https://registry.npmjs.org/daisyui/latest) — MIT, 0 JS deps, Tailwind plugin only

#### F. vanilla-extract (type-safe static CSS, zero runtime)

- **How it works**: Write CSS in TypeScript with full type safety for variables, themes, variants. Generates static `.css` files at build time (same output quality as Sass/Less). Created by John Resig (jQuery), supported by Seek.
- **React 19**: N/A — it's a CSS tool, not a component library. Works with any React version. Vite integration is first-class.
- **Bundle weight**: Zero runtime. Produces regular CSS files identical to what SASS generates.
- **Theming**: Built-in `createTheme()` and `createGlobalThemeContract()` — deeply typed token system. Would overlay nicely on top of existing `tokens.css`, adding TypeScript safety to your current token consumption. Could also replace `tokens.css` entirely.
- **a11y**: Doesn't touch accessibility — you're still writing the components yourself. Same as today.
- **Maintenance model**: Dependency for the CSS layer. No component layer to adopt. Incremental migration: swap `*.module.css` imports to `.css.ts` files selectively. Low friction.
- **"Web-appy" risk**: None — you still write the components. Just better-typed CSS.
- **License**: MIT.
- **Trade-off**: Migration cost. Every CSS Module needs a `.css.ts` equivalent. Build pipeline changes (vanilla-extract Vite plugin must run before Vite's native CSS processing). Not a component solution — just a styling-layer upgrade.

Sources:

- [vanilla-extract homepage](https://vanilla-extract.style/) — 2026-08-30
- [GitHub: vanilla-extract-css/vanilla-extract](https://github.com/vanilla-extract-css/vanilla-extract)

#### G. Ark UI v5 (headless, multi-framework)

- **How it works**: Unstyled headless primitives from the former Chakra team. Supports React, Solid, Vue, Svelte. Uses `data-scope`/`data-part` attributes for CSS targeting. Compatible with CSS Modules, Tailwind, Panda, or raw CSS.
- **React 19**: Yes — peer dep `>=18.0.0` (covers 19). [Verified via npm](https://registry.npmjs.org/@ark-ui/react/latest).
- **Bundle weight**: Higher than Radix — 69 dependencies. Some components pull in substantial supporting code (date parsing, collection management, etc.).
- **Theming**: No built-in theming. Style via `data-part` selectors in CSS Modules. Works with your existing model.
- **A11y**: Strong — follows ARIA patterns, tested. Inherited from Chakra's accessibility work.
- **Maintenance model**: Dependency. Actively developed. Multi-framework adds overhead if you only use React.
- **"Web-appy" risk**: Near-zero — unstyled.
- **License**: MIT.
- **Assessment**: Solid choice if you wanted a Radix replacement with richer compound components (Tabs, Select, Combobox, Date Picker are particularly polished). But adds significant dep count for what Radix delivers individually. Worth considering if you need Ark's date-picker or combobox complexity that Radix doesn't cover.

Sources:

- [Ark UI getting started](https://ark-ui.com/docs/overview/getting-started) — 2026-08-30
- [npm: @ark-ui/react@5.39.1](https://registry.npmjs.org/@ark-ui/react/latest) — MIT, peer `>=18.0.0`, 69 deps

---

## 3. Comparison Matrix

| Criteria            | shadcn/ui                                         | Radix Primitives                            | Base UI                  | Mantine                               | Ark UI               | daisyUI                      | vanilla-extract                        |
| ------------------- | ------------------------------------------------- | ------------------------------------------- | ------------------------ | ------------------------------------- | -------------------- | ---------------------------- | -------------------------------------- |
| **Runtime CSS**     | None                                              | None                                        | None                     | None (build-time CSS)                 | None                 | None                         | None                                   |
| **JS deps**         | 0 (copy-in)                                       | Per-primitive (tiny)                        | 5                        | 5                                     | 69                   | 0 (CSS plugin)               | Build-time only                        |
| **React 19 ✓**      | ✅                                                | ✅                                          | ✅                       | ✅ (^19.2.0 only)                     | ✅                   | ✅ (N/A)                     | ✅ (N/A)                               |
| **Vite ✓**          | ✅ official                                       | ✅                                          | ✅                       | ✅                                    | ✅                   | ✅                           | ✅ official                            |
| **PWA compatible**  | ✅                                                | ✅                                          | ✅                       | ✅                                    | ✅                   | ✅                           | ✅                                     |
| **Theming fit**     | Medium (needs mapping to tokens.css)              | N/A (you style)                             | N/A (you style)          | High (competes with tokens.css)       | N/A (you style)      | High (separate theme system) | High (replaces/enhances tokens.css)    |
| **A11y depth**      | Excellent (Radix)                                 | Excellent (gold standard)                   | Very good                | Good                                  | Excellent            | Basic (DOM elements only)    | N/A (no components)                    |
| **Migration cost**  | Medium (clone CSS Modules → Tailwind OR re-style) | Low (drop in alongside existing components) | Low                      | High (new provider, theming conflict) | Medium               | High (requires Tailwind)     | Medium (rewrite .module.css → .css.ts) |
| **"Web-appy" risk** | Medium-high with defaults                         | Near-zero                                   | Near-zero                | Medium-high with defaults             | Near-zero            | Medium                       | None (no components)                   |
| **Maintainability** | High (you own code)                               | Very high (stable APIs, small scope)        | High (growing team)      | Medium (large upgrade surface)        | Medium (many deps)   | High                         | Very high (no components)              |
| **Component count** | 60+                                               | ~40                                         | ~25                      | 120+                                  | ~50                  | 68 class sets                | 0 (CSS only)                           |
| **License**         | MIT                                               | MIT                                         | MIT                      | MIT                                   | MIT                  | MIT                          | MIT                                    |
| **Team stability**  | shadcn/Vercel                                     | WorkOS (funded)                             | MUI org (funded, 7 devs) | Individual maintainer (rtivital)      | Chakra team (funded) | Individual maintainer        | Seek (funded org)                      |

---

## 4. Recommendation

### Primary: **Radix Primitives + existing CSS Modules**

**Why:**

1. **Perfect fit for the existing architecture.** Your `ui/` primitives are already thin TSX wrappers over CSS Modules consuming CSS custom properties from `tokens.css`. Radix gives you the hard parts (dialog focus trapping, popover positioning/collision handling, combobox filtering, menubar roving focus, tooltip delay-group timing, portal rendering) while leaving all styling to your existing CSS Module + token system. Zero migration friction — Radix components become drop-in replacements for scattered ad-hoc implementations (dialogs, popovers, dropdown menus, date pickers) that currently don't exist as primitives.

2. **Zero "web-appy" sameness.** Radix is invisible. It manages behavior and ARIA; it produces no styles, no opinions about radius/shadow/color. Your app will look exactly like your CSS makes it look — which is the point of "not too web-appy." The owner already has a cohesive design language in `tokens.css`; wrapping that around Radix behavior preserves that voice.

3. **Incremental adoption is natural.** Add `@radix-ui/react-dialog` when `EditWallDialog` needs a proper modal with focus trap and backdrop. Add `@radix-ui/react-popover` when you need a settings panel that opens near a trigger. Add `@radix-ui/react-select` for account filters. One component per PR. No breaking changes to anything that isn't being touched.

4. **No runtime, no bundling surprise, no provider injection.** Unlike Mantine (which wants `MantineProvider` wrapping the app root and injects CSS variables inline), Radix is composable anywhere. No app-root decorator needed.

**Staged adoption plan:**

**Phase 0 — Foundation (no code changes yet)**

- `pnpm add @radix-ui/react-dialog @radix-ui/react-popover @radix-ui/react-dropdown-menu @radix-ui/react-tooltip @radix-ui/react-hover-card` — install only the 5 most-needed primitives.
- Document Radix patterns in a `docs/research/radix-primitives-web.md` noting the exact props used in Phase 1.

**Phase 1 — New surfaces (PR-by-PR)**

- Replace the ad-hoc dialog overlay in `EditWallDialog.tsx` with `<Dialog.Root>/<Dialog.Content>` styled via CSS Modules.
- Replace any ad-hoc popover/select logic in new screens.
- Create a `ComboBoxPrimitive` wrapper (if needed) for the mention-autocomplete in `MentionAutocomplete.tsx` — currently hand-rolled.

**Phase 2 — Existing screen migration (low-priority)**

- `ProfileMenu.tsx` likely rolls its own dropdown/popover behavior — candidate for `DropdownMenu` primitive.
- `IssueReporter.tsx` likely needs a dialog/modal — candidate for `Dialog`.
- Any future e2ee overlay panels could use `Popover` instead of custom positioning.

**Phase 3 — Compound components (when needed)**

- If the feed ever needs tabs/filters, add `@radix-ui/react-tabs`.
- If navigation deepens, `@radix-ui/react-navigation-menu`.
- Date/time pickers: Radix doesn't ship one. Evaluate `@internationalized/date` (Radix's date utility) + custom calendar UI, or consider a separate lightweight library like `@ariakit/date` if you need full date picker semantics.

### Runner-up: **shadcn/ui**

**Why considered, why runner-up:**

- **Pros**: Largest component catalog (60+), CLI automation, excellent documentation, AI-friendly (open code), MIT. Covers everything Radix misses (Form, Calendar, Chart, Data Table). The copy-in model means you own every byte and can adapt to CSS Modules instead of Tailwind defaults.
- **Cons vs Radix**: Default aesthetics lean heavily "Vercel/SaaS dashboard" which conflicts with "not too web-appy." Installing shadcn typically introduces Tailwind as the primary styling vehicle, requiring either accepting Tailwind across the entire codebase or spending effort re-styling every cloned component back to CSS Modules. The migration path from CSS Modules to Tailwind is non-trivial (every `*.module.css` in `ui/` would need rewriting). With Radix, you keep your existing CSS Modules and add just the behavioral primitives you need.

If the board prefers "max components out of the box" over "minimal architectural change," shadcn is the right choice — but it requires committing to Tailwind as the styling language across `apps/web`, which is a bigger step than installing a few Radix packages.

### Honorable mentions (not recommended, but worth knowing)

- **Base UI**: Best alternative to Radix if you need more advanced compound components (Combobox with autocomplete, nested dialogs) that Radix doesn't cover as mature. Backed by MUI org. Trade-off: newer library, smaller community, higher risk of edge-case bugs during adoption. Consider migrating from Radix to Base UI later if Radix's coverage gaps prove painful.
- **vanilla-extract**: Worth evaluating for Phase 0 as a _parallel_ experiment: create one component's styles in `.css.ts` format alongside the existing `.module.css` to benchmark developer experience. Do not commit to replacing CSS Modules until a side-by-side comparison is done.

---

## 5. TUI Assessment — Should the Ink 7 TUI get a design system layer?

**Short answer: Not yet.**

The TUI (`apps/tui`) currently has approximately 30 components across `components/` (Banner, CommandPalette, ConfirmDialog, Drawer, Loading, MediaAttachments, Nameplate, Overlay, ProgressBar, PostList, PostRow, SplitPane, StatusBar, TerminalTooSmall, plus `input/` and `pickers/` subdirectories), a theme context (`app/theme-context.tsx`, 42 lines), and a render-time theme file (`pages/render/theme.ts`, 34 lines). Total theme code is ~76 lines of Ink-compatible styling using Ink's own text primitives (colors, spacing, borders rendered via Unicode box-drawing characters). At this scale, the code is still small enough that ad-hoc consistency (copy-paste with minor edits) is manageable. The Ink rendering model itself (terminal character grid, unicode placeholders for images, APC sequences for Kitty graphics) imposes constraints that a general-purpose web design system cannot address. If the component count grows past ~50 and you notice repeated patterns in banner/alert/progress/dialog structures, a thin internal abstraction layer (similar to how `ui/` sits in `apps/web`) would be justified then. Until that threshold, the current ad-hoc approach is fine.

---

## Sources

- [shadcn/ui Introduction](https://ui.shadcn.com/docs) — fetched 2026-08-30
- [shadcn/ui Vite Installation](https://ui.shadcn.com/docs/installation/vite) — fetched 2026-08-30
- [Radix Primitives Overview](https://www.radix-ui.com/primitives/docs/overview/introduction) — fetched 2026-08-30
- [Radix Primitives Homepage](https://www.radix-ui.com/primitives) — fetched 2026-08-30
- [npm: @radix-ui/react-avatar@1.2.6 metadata](https://registry.npmjs.org/@radix-ui/react-avatar/latest) — fetched 2026-08-30
- [Base UI Homepage](https://www.base-ui.dev/) — fetched 2026-08-30
- [npm: @base-ui/react@1.7.0 metadata](https://registry.npmjs.org/@base-ui/react/latest) — fetched 2026-08-30
- [Mantine Getting Started](https://mantine.dev/getting-started/) — fetched 2026-08-30
- [Mantine Styles Overview](https://mantine.dev/styles/styles-overview/) — fetched 2026-08-30
- [Mantine Unstyled / Headless](https://mantine.dev/styles/unstyled/) — fetched 2026-08-30
- [npm: @mantine/core@9.5.2 metadata](https://registry.npmjs.org/@mantine/core/latest) — fetched 2026-08-30
- [Ark UI Getting Started](https://ark-ui.com/docs/overview/getting-started) — fetched 2026-08-30
- [npm: @ark-ui/react@5.39.1 metadata](https://registry.npmjs.org/@ark-ui/react/latest) — fetched 2026-08-30
- [daisyUI Homepage](https://daisyui.com/) — fetched 2026-08-30
- [npm: daisyui@5.7.22 metadata](https://registry.npmjs.org/daisyui/latest) — fetched 2026-08-30
- [vanilla-extract Homepage](https://vanilla-extract.style/) — fetched 2026-08-30
- [npm: @shadcn/react@0.3.0 metadata](https://registry.npmjs.org/@shadcn/react/latest) — fetched 2026-08-30
- [npm: @chakra-ui/react@3.37.0 metadata](https://registry.npmjs.org/@chakra-ui/react/latest) — fetched 2026-08-30
- npm search "align ui" — fetched 2026-08-30 (no matching React package; only positioning libs like `rc-align`)
- GitHub search "alignui react" — fetched 2026-08-30 (sole result: `keell0renz/mirror-ui`, 1 star)
