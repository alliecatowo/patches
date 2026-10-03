---
layout: page
title: Patches
pageClass: pt-home-page
---

<h1><span class="pt-prompt">$</span> patches</h1>
<p class="pt-lede">Terminal-native social media. Chronological, open-source, yours. A real Ink/React TUI against a self-hostable node.</p>
<div class="pt-actions">
  <a class="pt-primary" href="https://patches-web.pages.dev">try it in the browser</a>
  <a href="/docs/guide/">read the guide</a>
  <a href="https://github.com/alliecatowo/patches">github</a>
</div>

<div class="pt-term">
<div class="pt-term-bar">patches: Home</div>
<pre><span class="p">Home</span>
<span class="m"> </span>
<span class="u">@allie</span> <span class="m">· just now</span>
hello from the terminal
<span class="m">♡ 0 · 0 replies</span>
<span class="m"> </span>
@juan <span class="m">· 1 hour ago</span>
welcome to patches, allie — replying from my terminal
<span class="m">♡ 0 · 0 replies</span>
<span class="m"> </span>
@allie <span class="m">· 1 hour ago</span>
hello from production! posted from the terminal via patches-social.fly.dev
<span class="u">♥ 1 · 1 reply</span>
<span class="m"> </span>
<span class="m">— end of the timeline —</span></pre>
<div class="pt-term-status"><span class="g">connected</span> · patches-social.fly.dev:443 · @juan
j/k move   Enter thread   p author   r reply   l like   b bookmark   o open media   ! report   g h/l/p go   ? help</div>
</div>

## what it does

<dl class="pt-facts">
  <dt>no ranking</dt>
  <dd>Home and local timelines are strictly chronological. No engagement-optimized feed.</dd>
  <dt>terminal-first</dt>
  <dd>Keyboard-first Ink/React TUI with Kitty inline images and a plain fallback for other terminals.</dd>
  <dt>self-hostable</dt>
  <dd>MIT-licensed. Run your own node against Postgres, or use the flagship hosted node.</dd>
  <dt>patches pages</dt>
  <dd>Every account gets a small structured mini-site, no HTML or CSS required.</dd>
  <dt>federation seam</dt>
  <dd>An ActivityPub gateway lab, built as a seam from day one.</dd>
  <dt>moderation</dt>
  <dd>Invite-only bootstrapping, domain blocks and ingestion hardening are part of the core.</dd>
</dl>

## more of the TUI

<div class="pt-shots">
  <figure><img :src="'/media/profile.png'" alt="Profile view in the Patches TUI" /><figcaption>profile</figcaption></figure>
  <figure><img :src="'/media/thread.png'" alt="Thread view in the Patches TUI" /><figcaption>thread</figcaption></figure>
  <figure><img :src="'/media/notifications.png'" alt="Notifications view in the Patches TUI" /><figcaption>notifications</figcaption></figure>
  <figure><img :src="'/media/help.png'" alt="Keybinding help overlay in the Patches TUI" /><figcaption>help</figcaption></figure>
</div>

## quickstart

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
`npm i -g patches-social`, a single self-contained global install ([tracked](https://github.com/alliecatowo/patches) as P9-003).
:::

See the [guide](/docs/guide/) for the full walkthrough, or the [architecture overview](/docs/architecture/overview) for how a node is put together.
