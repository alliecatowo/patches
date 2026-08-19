# Site (docs/marketing)

**Status: deployed 2026-08-18.** `site/` is a VitePress site providing the Patches landing
page and a mirror of a curated set of `docs/**` pages. It's deployed to Cloudflare Pages
(project `patches-site`) and live at **https://patches-site.pages.dev**.

## What it is

- `site/index.md` — hand-authored landing page (hero, feature grid, screenshots, quickstart).
  VitePress `layout: home`.
- `site/docs/**` — **generated, gitignored.** `site/scripts/sync-docs.mjs` copies a fixed
  list of files from the repo's `docs/` into `site/docs/` with a generated frontmatter
  block, before every `dev`/`build` run. Edit the source in `docs/`, not the copy — the
  copy is overwritten on the next build. See the `MANIFEST` array in that script for the
  exact source → destination mapping (currently: `docs/user-guide.md`,
  `docs/architecture/{overview,federation,pages}.md`,
  `docs/product/{principles,roadmap,moderation,privacy}.md`,
  `docs/operations/{deployment,federation}.md`). A missing source file is logged and
  skipped, not a build failure — other agents/PRs own those files independently.
- `site/public/media/` — TUI screenshots/GIFs (`hero.gif`, `compose.gif`,
  `search-follow.gif`, `cli.gif`, `home.png`, `profile.png`, `thread.png`,
  `notifications.png`), owned by the media-recording task (P9-002). Referenced from
  `site/index.md` via `:src="'/media/....'"` (a Vue bound expression, not a static `src`
  attribute) specifically so the build never depends on these files existing — a static
  `src="/media/hero.gif"` gets resolved as a build-time asset import by
  `@vitejs/plugin-vue`'s `transformAssetUrls` and fails the whole build if the file is
  missing; a bound expression is left as a plain runtime string. If a file is missing, the
  corresponding `<img>` just renders broken until the next deploy after it lands.
- VitePress's `srcDir` can only point at one directory, so the project root stays `site/`
  (default `srcDir: '.'`) and the generated content lives under nav paths prefixed
  `/docs/*` (e.g. `/docs/guide/`, `/docs/architecture/overview`) — see
  `site/.vitepress/config.mts` for the nav/sidebar.
- `ignoreDeadLinks: true` is set deliberately: the synced docs are a curated subset of
  `docs/**`, so their relative links to sibling docs that aren't part of that subset (ADRs,
  `architecture/api.md`, etc.) are expected and not rewritten.

## Commands

```sh
pnpm site:dev              # http://localhost:5173, live-reloads (re-run sync-docs manually if you edit docs/ mid-session)
pnpm site:build            # -> site/.vitepress/dist
pnpm site:deploy           # build + wrangler pages deploy
mise run site               # same as `pnpm site:dev`
mise run site:deploy        # same as `pnpm site:deploy`
```

Or scoped to the workspace directly: `pnpm --filter @patches/site build|dev|typecheck`.

## Deploying

Deploys go through `wrangler` (Cloudflare's CLI), authenticated locally via OAuth
(`pnpm exec wrangler whoami`) on this machine, or via `CLOUDFLARE_API_TOKEN`/
`CLOUDFLARE_ACCOUNT_ID` secrets in CI.

The Cloudflare Pages project was created once with:

```sh
pnpm exec wrangler pages project create patches-site --production-branch main
```

Every deploy after that is:

```sh
pnpm --filter @patches/site build
pnpm exec wrangler pages deploy site/.vitepress/dist --project-name patches-site --branch main --commit-dirty=true
```

(`pnpm site:deploy` wraps both steps.) Deploying `branch main` publishes to the production
URL; any other `--branch` value gets its own preview URL
(`<hash>.patches-site.pages.dev`) without touching production.

**Live URL: https://patches-site.pages.dev** (first deploy 2026-08-18, build ~3s, 61
files).

## CI

`.github/workflows/site.yml` builds the site on every successful `CI` run on `main` (via
`workflow_run`, same pattern as `deploy.yml`), plus `workflow_dispatch` for manual runs. The
actual `wrangler pages deploy` step is gated behind `vars.SITE_DEPLOY_ENABLED` — unset today,
so the workflow builds (and reports green) on every `main` push but does not deploy from CI
yet. To turn it on: set the `SITE_DEPLOY_ENABLED` repository/environment variable to `true`
and add `CLOUDFLARE_API_TOKEN` (Pages:Edit permission) + `CLOUDFLARE_ACCOUNT_ID` as repo
secrets. Until then, deploys are manual (`pnpm site:deploy`) as done for the first deploy
above.

## Known gaps

- No custom domain configured yet (`patches-site.pages.dev` only).
- CI deploy path (`vars.SITE_DEPLOY_ENABLED`) has never been exercised — the live deploy
  above was done by hand with `wrangler`, same caveat as `docs/operations/deployment.md`'s
  Fly deploy workflow.
- `site/public/media/*` are placeholders/absent until P9-002 lands real recordings.
