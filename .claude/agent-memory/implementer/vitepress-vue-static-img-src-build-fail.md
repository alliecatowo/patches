---
name: vitepress-vue-static-img-src-build-fail
description: VitePress/vue-plugin build fails on missing images referenced via static <img src> and on multi-line CommonMark inline code spans
metadata:
  type: feedback
---

Two non-obvious VitePress 1.6.4 build failures hit while building `site/` (P9-001), both
worth knowing before touching that package again:

1. **Static `<img src="/media/foo.gif">` in markdown fails the whole build if the file is
   missing** — `@vitejs/plugin-vue`'s `transformAssetUrls` resolves a static `src` on an
   `<img>` (including ones raw-HTML-embedded in markdown, not just `.vue` files) as a
   build-time asset import; if the file under `public/` doesn't exist yet, Rollup throws a
   hard "failed to resolve import" error, not a warning. Fix: use a bound expression,
   `:src="'/media/foo.gif'"`, instead of a static `src` attribute — Vue leaves bound
   expressions as plain runtime strings, so the build never depends on the file existing.
   Relevant when a doc/marketing site references assets another concurrent task is still
   producing (see [[concurrent-shared-checkout-hazard]]).

2. **A CommonMark inline code span that spans a soft line break (`` `--foo\n<bar>` ``, valid
   per spec) breaks VitePress's markdown→Vue-SFC pipeline** — markdown-it renders it fine,
   but the second pass (Vue's SFC compiler re-parsing the rendered HTML as a template) loses
   the span boundary, so `<bar>` leaks through looking like an unclosed HTML tag:
   `SyntaxError: Element is missing end tag`. The error location it reports (e.g.
   `docs/guide/index.md:93:31`) is often nowhere near the actual multi-line span — bisect by
   deleting sibling pages/dirs one at a time until the file with the real span shows up.
   Fix: join the span onto one line before feeding it to VitePress (see
   `site/scripts/sync-docs.mjs`'s `collapseMultilineCodeSpans` for a line-based, fence-aware
   implementation) rather than editing the source doc, if the source isn't yours to touch.

**Why:** both cost real debugging time isolating a generic-looking error down to these two
specific causes; neither is documented anywhere obvious in VitePress's own docs.

**How to apply:** before touching `site/**` again, or building any other VitePress site in
this repo, check for both patterns first instead of re-diagnosing from scratch.
