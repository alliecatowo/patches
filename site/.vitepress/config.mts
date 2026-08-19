import { defineConfig } from 'vitepress';

// site/index.md is the hand-authored landing page, tracked in git. Everything under
// site/docs/ is generated at dev/build time by scripts/sync-docs.mjs from ../docs (see
// that script for the source manifest) and is gitignored — VitePress's `srcDir` can only
// point at one directory, so the project root stays `site/` (default srcDir '.') and the
// synced content lives at nav paths under /docs/*.
export default defineConfig({
  title: 'Patches',
  description: 'Terminal-native, chronological, open-source social media.',
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
      message: 'Released under the MIT License.',
      copyright: 'Copyright © Patches contributors',
    },

    search: { provider: 'local' },
  },
});
