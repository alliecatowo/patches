# Storybook (web) — visual management + viewport/visual-regression testing for apps/web

Stack: latest stable Storybook is **10.5.10** (`storybook` dist-tag `latest`, npm registry, checked
2026-08-26 via `pnpm view storybook dist-tags`). Repo pins (read from `pnpm-workspace.yaml` catalog +
installed `node_modules`, 2026-08-26): Vite **8.2.2**, React/React-DOM **19.2.8**, TypeScript
**5.9.3**, Vitest **4.1.11**, `@playwright/test` **1.62.1**, Node **24.19.0**, pnpm **11.22.0**.
apps/web tests today: Vitest 4 + jsdom + Testing Library (`apps/web/vitest.config.ts`, ~55
`src/**/*.test.{ts,tsx}` files, `vitest run --passWithNoTests`), plus a Playwright E2E suite
(`apps/web/playwright.config.ts`, `e2e/*.spec.ts`) that boots a managed Vite server against the lab
harness. Verified 2026-08-26 against the official docs pages linked below.

## 1. Compatibility matrix

All peer ranges below were read live from the npm registry (`pnpm view <pkg> version
peerDependencies --json`, 2026-08-26) — not from memory or blog posts:

| Package (version checked)           | Peer requirement                                                                                                          | Repo value    | OK?                               |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | ------------- | --------------------------------- |
| `storybook@10.5.10` (latest stable) | —                                                                                                                         | —             | ✅ current major                  |
| `@storybook/react-vite@10.5.10`     | `vite ^5 \|\| ^6 \|\| ^7 \|\| ^8`                                                                                         | vite 8.2.2    | ✅                                |
|                                     | `react / react-dom ^16.8 … ^19`                                                                                           | 19.2.8        | ✅                                |
|                                     | `typescript >= 4.9.x`                                                                                                     | 5.9.3         | ✅                                |
| `@storybook/addon-vitest@10.5.10`   | `vitest ^3 \|\| ^4`, `@vitest/runner ^3 \|\| ^4`, `@vitest/browser ^3 \|\| ^4` (optional `@vitest/browser-playwright ^4`) | vitest 4.1.11 | ✅ (add `@vitest/browser@4.1.11`) |
| `@storybook/addon-a11y@10.5.10`     | `storybook ^10.5.10`                                                                                                      | —             | ✅                                |
| `@storybook/test-runner@0.24.4`     | `storybook ^10.x`                                                                                                         | —             | ✅ (fallback option only, §4a)    |
| `@storybook/builder-vite@10.5.10`   | `vite ^5 \|\| ^6 \|\| ^7 \|\| ^8`                                                                                         | vite 8.2.2    | ✅                                |

Storybook's own project requirements page lists "Node.js 20+, pnpm 9+, Vite 5+, Vitest 3+,
TypeScript 4.9+" — this repo clears every one ([Install → Project
requirements](https://storybook.js.org/docs/get-started/install#project-requirements)).

Two findings that change the plan an implementer might have from older blog posts:

- **`@storybook/addon-test` is dead.** Its `latest` dist-tag is a `0.0.0-pr-*` PR build and the
  package has **zero stable versions** (verified: `pnpm view @storybook/addon-test versions`). In
  Storybook 10 the Vitest integration is **`@storybook/addon-vitest`** ("Vitest addon"), which
  transforms stories into Vitest browser-mode tests ([writing-tests → Get
  started](https://storybook.js.org/docs/writing-tests#get-started),
  [Vitest addon](https://storybook.js.org/docs/writing-tests/integrations/vitest-addon)).
- **Story format is CSF 3.** Every current docs example defaults to a "CSF 3" tab with "CSF Next 🧪"
  marked experimental. Write plain CSF 3 (`satisfies Meta<typeof Component>` + named `StoryObj`
  exports).

**No known incompatibilities.** Vite 8 + React 19 + Vitest 4 is squarely inside every published peer
range. The one soft spot: `toMatchScreenshot` (the SaaS-free visual assertion, §4b) is labeled
**experimental** in the Vitest 4.1.11 docs.

## 2. Install footprint in this pnpm workspace

`npx storybook@latest init` (docs now frame it as `npm create storybook@latest`; for a workspace
package run it inside `apps/web` with `--package-manager pnpm --type react_project`) per the
[install page](https://storybook.js.org/docs/get-started/install) installs dependencies, adds
`storybook` / `build-storybook` scripts, creates `.storybook/main.ts` + `.storybook/preview.ts`,
boilerplate stories, and telemetry (opt out in `.storybook/main.ts`). Expected devDeps for this repo:
`storybook`, `@storybook/react-vite`, `@storybook/addon-vitest`, `@storybook/addon-a11y`,
`@vitest/browser` (+ `@vitest/browser-playwright`); a11y and Vitest addon are also offered as init
`--features docs test a11y`. All go in `apps/web` **devDependencies** via
`pnpm add --filter @patches/web ...` per repo convention — the Vite builder is also the default
builder ([Builders → Vite](https://storybook.js.org/docs/builders/vite)).

Interaction with `apps/web/vite.config.ts`: the Vite builder **automatically loads the project's
`vite.config.ts`** and merges it ([Vite builder →
Configuration](https://storybook.js.org/docs/builders/vite#configuration)). For this repo that is
mostly good (`@vitejs/plugin-react` is needed) and partly bad: `VitePWA` (injectManifest) and the
`ANALYZE`-gated visualizer belong to the deployable app, not to a component workbench, and the
`define`d build-version globals are meaningless there. Use the documented escape hatch — point the
builder at a minimal dedicated config instead of the app's:

```ts
// .storybook/main.ts (sketch)
core: { builder: { name: '@storybook/builder-vite', options: { viteConfigPath: './.storybook/vite.config.ts' } } }
```

(Vite builder docs: "If you do not want Storybook to load the Vite configuration file automatically,
you can use the `viteConfigPath` option to point to a non-existent file" — a dedicated small config
reusing only `react()` is the cleaner variant of the same mechanism.)

Keeping Storybook out of the production build and turbo graph (B-201 context):

- `vite build` bundles from the `index.html` entry graph; `*.stories.tsx` files are not in it, so
  the deployable bundle is untouched. B-201's `dist:check` scans `dist/**/*.js` — Storybook builds to
  `storybook-static/` (default `--output-dir`), never `dist/`, so the guard is structurally
  unaffected.
- Do **not** add storybook to the `build` script; keep `storybook`/`build-storybook` as separate
  scripts. `turbo run build` (turbo.json `outputs: ["dist/**"]`) then never caches or depends on
  storybook artifacts. Add `storybook-static/` and `**/__screenshots__/` to `.gitignore` (baselines
  are the exception — see §4b) and to the app's `clean` script.
- `tsc --noEmit` (the `typecheck` script) _will_ typecheck stories since they live under `src/` —
  that is desirable and keeps the no-`any` rule enforced in stories too. Plain `vitest run` only
  collects `src/**/*.test.{ts,tsx}`, so the existing jsdom suite never picks up stories; the Vitest
  addon's tests live in a separate `storybook` vitest _project_ run by an explicit
  `test-storybook` script ([Vitest addon →
  CLI](https://storybook.js.org/docs/writing-tests/integrations/vitest-addon#cli)) — keep the plain
  `test` script as-is so `pnpm verify` behavior is unchanged until phase 3 decides otherwise.

## 3. Viewport / mobile emulation

Two different tools for two different places:

**In the Storybook UI** — the viewport feature is core in 10.5 (`storybook/viewport` exports
`INITIAL_VIEWPORTS`/`MINIMAL_VIEWPORTS`), configured via `parameters.viewport.options` with custom
devices (`{ name, styles: { width, height }, type: 'mobile' | 'tablet' | 'desktop' | 'other' }`) and
pinned per story via `globals.viewport` ([Essentials →
Viewport](https://storybook.js.org/docs/essentials/viewport)). The owner's matrix as first-class
presets in `.storybook/preview.ts`:

```ts
const PATCHES_VIEWPORTS = {
  mobilePwa: {
    name: 'Mobile PWA (iPhone SE/8)',
    styles: { width: '375px', height: '667px' },
    type: 'mobile',
  },
  tablet: {
    name: 'Tablet (iPad portrait)',
    styles: { width: '768px', height: '1024px' },
    type: 'tablet',
  },
  desktop: { name: 'Desktop', styles: { width: '1280px', height: '800px' }, type: 'desktop' },
};
```

375x667 / 768x1024 match real entries in `INITIAL_VIEWPORTS` (`iphone6`, `iphoneSE3`, `ipad`), and
375x667 portrait matches the installed PWA (`apps/web/public/manifest.webmanifest`:
`"display": "standalone"`, `"orientation": "portrait-primary"`).

**Limitations, stated plainly:** the viewport module _resizes the story iframe_ — it does not
emulate touch, `deviceScaleFactor`, or `display-mode: standalone`. Story-level media-feature
mocking: components that branch on `matchMedia('(display-mode: standalone)')` (PWA chrome, install
prompts) need a story decorator that stubs `window.matchMedia` for that query; Playwright's
`emulateMedia` covers only `colorScheme`/`reducedMotion`/`forcedColors`/`screen|print`, not
`display-mode`.

**In headless tests** — the Vitest addon runs stories as Vitest browser-mode tests where the
viewport comes from the _Vitest instance config_, not the addon toolbar:
`browser.instances: [{ browser: 'chromium', viewport: { width: 375, height: 667 } }]`, and
"Under the hood, Vitest transforms these instances into separate test projects" ([browser.instances
docs](https://vitest.dev/config/browser/instances)). Combine with the addon's `initialGlobals`
option, which "configures a set of initial global values that will be applied to every story this
project runs … Useful for running tests with different options, such as testing every story in a
specific theme" ([Vitest addon → API →
initialGlobals](https://storybook.js.org/docs/writing-tests/integrations/vitest-addon#initialglobals))
— one vitest project per viewport in the owner's matrix, e.g. `storybook-mobile`, `storybook-tablet`,
`storybook-desktop`. Touch (`hasTouch`/`isMobile`) is _not_ among Vitest 4.1.11's documented browser
options (the config reference lists only `viewport`, `headless`, `locators`, etc. per instance), so
model touch-specific UI through story args/decorators and keep real touch interaction in the
Playwright E2E suite where `devices[...]` descriptors exist.

**Can a story assert its viewport class?** Yes — via a CSF 3 `play` function using
`expect.element` with retryability, e.g. assert the mobile-only `ThumbNavFab`
(`apps/web/src/components/ThumbNavFab.tsx`) is visible in the 375-wide project and absent in the
1280-wide one (Vitest browser assertions:
[vitest.dev/api/browser/assertions](https://vitest.dev/api/browser/assertions)). Assertions about
layout-at-viewport belong in these per-viewport projects; that is exactly the matrix screenshots
also run under (§4b).

## 4. Visual regression WITHOUT SaaS

> **Update 2026-08-26 — Lost Pixel is dead; Argos CI evaluated.** Lost Pixel (the owner's
> earlier preference as a Chromatic alternative) was **archived 2026-04-22** — "Lost Pixel is
> joining Figma. We are sunsetting the product"
> (<https://github.com/lost-pixel/lost-pixel>, now read-only). Do not adopt it. The owner
> suggested **Argos CI** as the replacement candidate: verified active
> (<https://argos-ci.com/>), first-class `@argos-ci/storybook` SDK, GitHub check
> integration, per-PR review UI, flake management, an agent-facing MCP server, free Hobby
> tier of 5,000 screenshots/month. **It is SaaS** — the same B-167-precedent line this
> section was drawn around — so adopting it is an explicit owner decision, not a default.
> State of the field after the sunset: self-hosted options are (b) below (recommended,
> already chosen for phase 3) and `reg-suit` (self-hosted S3-backed, no hosted review UI,
> slow release cadence); everything else credible (Argos, Chromatic, Percy, Happo) is SaaS.
> Decision rule: if a hosted review UI + zero baseline bookkeeping turns out to matter to
> the owner, revisit Argos (5k screenshots/month covers our ~60-shot phase-3 matrix 80×
> over); otherwise (b) stays the plan.

Chromatic and Percy are **rejected** up front — external SaaS, same precedent as B-167's flag-tooling
decision. Note the official path _is_ SaaS: "Storybook supports cross-browser visual testing natively
using Chromatic, a cloud service made by the Storybook team"
([Visual tests](https://storybook.js.org/docs/writing-tests/visual-testing)). Everything below is
self-hosted.

**(a) `@storybook/test-runner` (0.24.4) + `toHaveScreenshot`.** The test runner is a Jest+Playwright
runner that visits a _served_ Storybook and executes play functions
([test-runner](https://storybook.js.org/docs/writing-tests/integrations/test-runner)). Its
officially documented snapshot support is **DOM/HTML snapshots**; image snapshots would be a DIY
`postVisit` hook calling Playwright's `toHaveScreenshot` — plausible but not an officially
documented feature, and it needs a second always-on web server (the composed storybook). The addon
comparison table marks snapshot tests "test-runner ✅ / Vitest addon ❌" and vice-versa for the
Chromatic-only visual tests — there is no first-party non-SaaS image path here.

**(b) `@storybook/addon-vitest` + Vitest browser mode + `toMatchScreenshot` — RECOMMENDED.** The
addon turns every tagged story into a real Vitest test (render smoke + play function) in
Playwright's Chromium ([How it works](https://storybook.js.org/docs/writing-tests/integrations/vitest-addon#how-it-works)).
On top of that, Vitest 4.1.11 ships a built-in screenshot assertion:
`await expect.element(page.getByTestId('x')).toMatchScreenshot()` — pixelmatch comparator
(`@blazediff/core`) with `allowedMismatchedPixelRatio`/`threshold`, automatic stability retry
("retries taking screenshots until two consecutive captures yield the same result"), diff images on
failure, and `-u`/`--update` to refresh baselines ([Assertion API →
toMatchScreenshot](https://vitest.dev/api/browser/assertions#tomatchscreenshot),
[Visual Regression Testing guide](https://vitest.dev/guide/browser/visual-regression-testing)).

- **Where baselines live:** `__screenshots__` directories next to the story files, file names
  suffixed with browser+platform (`*-chromium-linux.png`), "Don't forget to commit them!" (guide).
  Commit them under `apps/web/src/**/__screenshots__/`.
- **Intentional changes:** `vitest --project=storybook -u`, review the PNGs, commit — same workflow
  as `UPDATE_GOLDEN=1` in the TUI. The guide also sketches a manually-triggered
  "update-screenshots" GitHub workflow; given this repo's "stage explicit paths" rule, prefer the
  local `-u` + explicit `git add` over a bot committing.
- **Flake story:** the guide is blunt — "Font rendering (the big one …) … GPU drivers … headless or
  not" — and recommends one stable environment: CI-generated/CI-compared baselines on a pinned
  ubuntu runner with `playwright install --with-deps chromium` (the headless _shell_ is what
  `--only-shell` installs; full chromium for screenshots), web fonts + `await document.fonts.ready`
  (apps/web bundles its own woff2 — verify fonts settle in-story), animations disabled by default in
  the matcher's screenshotOptions, `allowedMismatchedPixelRatio: 0.01–0.02` to absorb residual
  antialiasing, and `mask` for dynamic regions (timestamps). Practical consequence: baselines are
  per-platform; either always regenerate on CI, or generate locally inside the same container.
- **Rough CI cost:** for phase 1's ~5 components × ~4 stories × 3 viewport projects ≈ 60
  screenshots ≈ **2–4 min** on ubuntu-latest plus ~1 min browser setup (chromium, cached) — cheap
  as a non-required job; grows linearly with stories, and the guide's sharding escape hatch exists.

**(c) Plain Playwright against a static `storybook build`.** Works with the existing
`@playwright/test` 1.62.1 (`webServer: { command: 'vite preview storybook-static' }`), but it
duplicates the baseline/update/report machinery Playwright already has… while (b) reuses the repo's
existing vitest install, the storybook dev-server lifecycle, _and_ lights up pass/fail status in the
Storybook UI sidebar. Choose (c) only if (b)'s `experimental` label becomes a real problem.

## 5. Accessibility (`@storybook/addon-a11y`)

Current and actively maintained (`10.5.10`, same versioning as core). It is axe-core based ("WCAG
2.0/2.1 Level A & AA + best practices" rulesets), renders violations in a panel with element
highlighting and vision-impairment simulation, and integrates with the Vitest addon:
`parameters.a11y.test = 'error' | 'todo' | 'off'` controls whether violations fail CI
([Accessibility tests](https://storybook.js.org/docs/writing-tests/accessibility-testing)). The docs'
recommended workflow fits this repo: start project-wide `'todo'`, promote per-component to
`'error'` as issues are fixed. Default config disables the `region` rule, which otherwise false-
positives on isolated components.

## 6. Overlap with H-018 and the existing route tests

`tasks.md` H-018 (browser E2E harness) is the required smoke proof for web changes; H-029 already
deferred _this_ Storybook evaluation "only after the browser harness (H-018) is stable … an
evaluation may conclude that existing route fixtures are sufficient." This note is that evaluation;
its conclusion widens H-029's remit (viewport matrix + non-SaaS visual regression are things route
fixtures do not do), but sequencing should still respect it: land H-018's harness first, then build
on its Playwright/browser footing (both use the same chromium-under-playwright stack).

Division of labor:

- **Stays in jsdom route/component tests:** behavioral truth — hooks, state, roles, query logic,
  a11y semantics via Testing Library. ~55 existing test files keep running unchanged; do not port
  them to stories.
- **Storybook adds:** isolated _visual_ state catalog (loading/empty/error/long-content variants
  hard to reach via routes), the 375/768/1280 viewport matrix with per-viewport assertions, pixel
  regression baselines, in-UI a11y review.
- **Stays in E2E (H-018):** full-stack journeys against the lab (register → compose → verify
  rendered UI), real service-worker/PWA install behavior, real touch input, auth/session lifecycle.
  Stories run against mocked/stubbed data by design; anything needing the real server never belongs
  in a story.

## Recommendation: GO (phased, after H-018 is stable)

Compatibility is clean, the SaaS-free visual-regression path exists in tooling the repo already
runs (Vitest + Playwright chromium), and the deploy pipeline is structurally insulated (storybook
never touches `dist/` or `turbo build` outputs). Biggest risk: `toMatchScreenshot` is marked
experimental — mitigated by running visual regression as a **non-required** CI job (phase 3) where a
matcher regression is an inconvenience, not a blocked merge. Second risk: baseline churn from font
rendering across runner images — mitigated by CI-owned baselines + threshold + masking.

### Implementation plan

- **Phase 1 — skeleton (≈1 day).** In `apps/web`: `pnpm add --filter @patches/web --save-dev
storybook @storybook/react-vite @storybook/addon-vitest @storybook/addon-a11y @vitest/browser`
  (versions resolve to 10.5.10 / 4.1.11 today; use the CLI `storybook init`/`storybook add
@storybook/addon-vitest` if preferred — not executed during this read-only research pass). Create
  `.storybook/main.ts` (framework `@storybook/react-vite`, `stories: ['../src/**/*.stories.tsx']`,
  `viteConfigPath` pointing at a minimal `.storybook/vite.config.ts` with just `react()`),
  `.storybook/preview.ts` (viewport presets from §3, `a11y: { test: 'todo' }`), and a vitest
  `storybook` project per the addon's documented Vitest-4 shape (`projects: [{ plugins:
[storybookTest({ configDir, storybookScript })], test: { name: 'storybook', browser: { enabled:
true, provider: playwright({}), headless: true, instances: [{ browser: 'chromium' }] } } }]`).
  Scripts: `storybook`, `build-storybook`, `test-storybook` (`vitest run --project=storybook`).
  Stories for 5 representative components: `PostCard`, `Nameplate`, `RichBody`, `EditWallDialog`,
  `MediaLightbox` (+ `ThumbNavFab` for the viewport work). Add `storybook-static/` to
  `.gitignore`/`clean`. Acceptance: `mise run check web` green, `pnpm --filter @patches/web build` +
  `dist:check` unchanged, storybook UI renders the 5 components with mocked RPC (reuse
  `createFakeApi`-style fixtures from route tests).
- **Phase 2 — viewport matrix (≈½ day).** Land the three viewport presets; add per-viewport vitest
  projects (`storybook-mobile/tablet/desktop`, `instances: [{ browser: 'chromium', viewport: … }]`)
  with `initialGlobals` for theme; write play-function assertions per §3 (ThumbNavFab visibility,
  PostCard layout); add a `matchMedia('(display-mode: standalone)')` stub decorator + one PWA-chrome
  story.
- **Phase 3 — visual regression in CI, non-required (≈1–1.5 days).** Add `toMatchScreenshot` to the
  phase-1/2 stories (element-scoped, not whole-page); generate baselines in CI; new
  `.github/workflows/web-visual.yml` (separate workflow, therefore outside the `ci-ok` aggregation —
  docs/operations/ci.md documents `ci-ok` as the single required check, so a separate workflow is
  non-required by construction) running `test-storybook` with `playwright install --with-deps
chromium`; thresholds `allowedMismatchedPixelRatio: 0.01` start; promote to required only after a
  month of stability, then reconsider per H-029's original bar.

Effort total: ≈2.5–3 days. Do not port route tests; do not add storybook anywhere in the deploy
path (`web:deploy`, `web.yml` untouched).

<!-- Sources (all fetched 2026-08-26):
     https://storybook.js.org/docs/get-started/install (requirements, init behavior)
     https://storybook.js.org/docs/builders/vite (viteConfigPath, config auto-merge)
     https://storybook.js.org/docs/essentials/viewport (viewport options/globals API)
     https://storybook.js.org/docs/writing-tests (testing landscape, addon-test → addon-vitest)
     https://storybook.js.org/docs/writing-tests/integrations/vitest-addon (setup, projects, initialGlobals, tags)
     https://storybook.js.org/docs/writing-tests/visual-testing (Chromatic-only visual tests)
     https://storybook.js.org/docs/writing-tests/snapshot-testing (portable stories, test-runner snapshots)
     https://storybook.js.org/docs/writing-tests/accessibility-testing (addon-a11y state, test parameter)
     https://vitest.dev/api/browser/assertions (toMatchScreenshot)
     https://vitest.dev/guide/browser/visual-regression-testing (baselines, flake, CI, update workflow)
     https://vitest.dev/config/browser/instances (per-instance viewport → projects)
     Registry peer-dep checks run 2026-08-26: pnpm view storybook/@storybook/react-vite/@storybook/addon-vitest/@storybook/addon-a11y/@storybook/test-runner/@storybook/addon-test (version|peerDependencies|dist-tags)
     Local reads: apps/web/{package.json,vite.config.ts,vitest.config.ts,playwright.config.ts,public/manifest.webmanifest}, pnpm-workspace.yaml, mise.toml, turbo.json, .github/workflows/{ci,web}.yml, tasks.md (H-018/H-029/B-167/B-201). -->
