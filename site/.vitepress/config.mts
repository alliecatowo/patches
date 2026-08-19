import { execSync } from 'node:child_process';

import { defineConfig } from 'vitepress';

/**
 * The exact commit this build was produced from, so a reader can tell which of the two
 * mirrors (`docs/operations/site.md`) is ahead — both auto-deploy from `main` on a delay,
 * so they can briefly disagree. `git rev-parse` always succeeds in CI (a full checkout via
 * `actions/checkout`) and in a local dev/build run (this is a git working tree); falls back
 * to `'unknown'` rather than failing the whole site build in the one case that isn't (e.g. a
 * source tarball with no `.git` directory).
 */
function commitSha(): string {
  try {
    return execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim();
  } catch {
    // No `.git` directory available (e.g. a stripped source archive) — an honest "unknown"
    // beats failing the build over a footer credit line.
    return 'unknown';
  }
}

// site/index.md is the hand-authored landing page, tracked in git. Everything under
// site/docs/ is generated at dev/build time by scripts/sync-docs.mjs from ../docs (see
// that script for the source manifest) and is gitignored — VitePress's `srcDir` can only
// point at one directory, so the project root stays `site/` (default srcDir '.') and the
// synced content lives at nav paths under /docs/*.
// GitHub Pages serves this site from a repo subpath (https://alliecatowo.github.io/patches/),
// so every asset href needs that prefix baked in at build time — Cloudflare Pages serves it
// from the domain root instead, where the default `/` is correct. `.github/workflows/
// site-gh-pages.yml` sets `VITEPRESS_BASE=/patches/` only for the GitHub Pages build; every
// other build (local dev, `pnpm site:deploy`'s Cloudflare Pages build, `.github/workflows/
// site.yml`) leaves it unset and gets the existing root-relative behavior unchanged.
const base = process.env['VITEPRESS_BASE'] ?? '/';
const sha = commitSha();

export default defineConfig({
  title: 'Patches',
  description: 'Terminal-native, chronological, open-source social media.',
  base,
  cleanUrls: true,
  lastUpdated: false,
  appearance: 'dark',

  // The synced docs (see sync-docs.mjs) are a curated subset of docs/** — cross-links to
  // sibling docs that aren't part of that subset (ADRs, architecture/api, etc.) are expected
  // and intentionally not rewritten here; VitePress's dead-link check would otherwise fail
  // the build on those. https://vitepress.dev/reference/site-config#ignoredeadlinks
  ignoreDeadLinks: true,

  head: [['link', { rel: 'icon', href: '/favicon.svg' }]],

  themeConfig: {
    logo: '/favicon.svg',
    nav: [
      { text: 'Guide', link: '/docs/guide/' },
      {
        text: 'Architecture',
        items: [
          { text: 'Overview', link: '/docs/architecture/overview' },
          { text: 'Federation', link: '/docs/architecture/federation' },
          { text: 'Patches Pages', link: '/docs/architecture/pages' },
        ],
      },
      {
        text: 'Product',
        items: [
          { text: 'Principles', link: '/docs/product/principles' },
          { text: 'Roadmap', link: '/docs/product/roadmap' },
          { text: 'Moderation', link: '/docs/product/moderation' },
          { text: 'Privacy', link: '/docs/product/privacy' },
        ],
      },
      {
        text: 'Operations',
        items: [
          { text: 'Deployment', link: '/docs/operations/deployment' },
          { text: 'Federation lab', link: '/docs/operations/federation' },
        ],
      },
      { text: 'GitHub', link: 'https://github.com/alliecatowo/patches' },
    ],

    sidebar: {
      '/docs/guide/': [{ text: 'Guide', items: [{ text: 'User guide', link: '/docs/guide/' }] }],
      '/docs/architecture/': [
        {
          text: 'Architecture',
          items: [
            { text: 'Overview', link: '/docs/architecture/overview' },
            { text: 'Federation', link: '/docs/architecture/federation' },
            { text: 'Patches Pages', link: '/docs/architecture/pages' },
          ],
        },
      ],
      '/docs/product/': [
        {
          text: 'Product',
          items: [
            { text: 'Principles', link: '/docs/product/principles' },
            { text: 'Roadmap', link: '/docs/product/roadmap' },
            { text: 'Moderation', link: '/docs/product/moderation' },
            { text: 'Privacy', link: '/docs/product/privacy' },
          ],
        },
      ],
      '/docs/operations/': [
        {
          text: 'Operations',
          items: [
            { text: 'Deployment', link: '/docs/operations/deployment' },
            { text: 'Federation lab', link: '/docs/operations/federation' },
          ],
        },
      ],
    },

    socialLinks: [{ icon: 'github', link: 'https://github.com/alliecatowo/patches' }],

    footer: {
      message: `Released under the MIT License. Built from <a href="https://github.com/alliecatowo/patches/commit/${sha}">${sha}</a>.`,
      copyright: 'Copyright © Patches contributors',
    },

    search: { provider: 'local' },
  },
});
