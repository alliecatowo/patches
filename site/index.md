---
layout: home

hero:
  name: Patches
  text: Terminal-native social media
  tagline: chronological, open-source, yours
  image:
    src: /media/hero.gif
    alt: Patches TUI in action
  actions:
    - theme: brand
      text: Try the live node
      link: /docs/guide/
    - theme: alt
      text: GitHub
      link: https://github.com/alliecatowo/patches

features:
  - icon: 🕰️
    title: No ranking algorithm
    details: Home and local timelines are strictly chronological — no engagement-optimized feed, ever.
  - icon: ⌨️
    title: Terminal-first
    details: A real Ink/React TUI with Kitty inline images, keyboard-first navigation, and a clean non-Kitty fallback.
  - icon: 🌐
    title: Open source & self-hostable
    details: MIT-licensed. Run your own node against Postgres, or use the flagship hosted node.
  - icon: 🗂️
    title: Patches Pages
    details: Every account gets a small, structured mini-site of its own — no HTML/CSS required.
  - icon: 🔗
    title: Federation-ready
    details: An ActivityPub gateway lab, built as a seam from day one — not bolted on later.
  - icon: 🔒
    title: Privacy & moderation first
    details: Invite-only bootstrapping, domain blocks, and ingestion hardening are part of the core, not an afterthought.
---

## See it

<!--
  `:src` (a bound expression) rather than a static `src` attribute — Vue's SFC compiler
  (via @vitejs/plugin-vue's transformAssetUrls) treats a static `src="/media/..."` as an
  asset it must resolve at build time, which fails the whole site build if that file isn't
  present yet under public/media/ (populated separately by P9-002). A bound expression is
  left as a runtime string, so the build never depends on the file existing.
-->
<div class="patches-see-it">
  <img :src="'/media/hero.gif'" alt="Patches TUI hero demo" />
  <div class="patches-see-it-grid">
    <img :src="'/media/home.png'" alt="Home timeline" />
    <img :src="'/media/profile.png'" alt="Profile view" />
    <img :src="'/media/thread.png'" alt="Thread view" />
  </div>
</div>

## Quickstart

Run your own node locally:

```sh
git clone https://github.com/alliecatowo/patches && cd patches
mise install && pnpm install
pnpm --filter patches-social build
node apps/tui/dist/cli.js register --handle you --display-name "You" --email you@example.com --invite <code>
```

Then, any time:

```sh
node apps/tui/dist/cli.js
```

::: tip Coming soon
`npm i -g patches-social` — a single self-contained global install ([tracked](https://github.com/alliecatowo/patches) as P9-003).
:::

See the [guide](/docs/guide/) for the full walkthrough, or the [architecture overview](/docs/architecture/overview) for how a node is put together.

<style>
.patches-see-it { display: flex; flex-direction: column; gap: 1rem; margin: 2rem 0; }
.patches-see-it img { border-radius: 8px; border: 1px solid var(--vp-c-divider); width: 100%; }
.patches-see-it-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 1rem; }
</style>
