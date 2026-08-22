# Site (docs/marketing)

**Status: deployed 2026-08-18, mirrored 2026-08-19.** `site/` is a VitePress site providing
the Patches landing page and a mirror of a curated set of `docs/**` pages. It ships to two
independent hosts so losing either one doesn't take the whole site down:

| Host                                               | URL                                        | Deploy path                                                                                   |
| -------------------------------------------------- | ------------------------------------------ | --------------------------------------------------------------------------------------------- |
| Cloudflare Pages (primary, project `patches-site`) | **https://patches-site.pages.dev**         | `pnpm site:deploy` (manual today — see [CI](#ci))                                             |
| GitHub Pages (mirror)                              | **https://alliecatowo.github.io/patches/** | `.github/workflows/site-gh-pages.yml`, auto on every `main` push touching `site/**`/`docs/**` |

Both build from the same `site/` source; the only difference is the base path
(`VITEPRESS_BASE=/patches/` for GitHub Pages, since it serves from a repo-name subpath —
Cloudflare Pages serves from its domain root). **Check which version is live** by scrolling to
either site's footer: `themeConfig.footer.message` (`site/.vitepress/config.mts`) is computed
at build time from `git rev-parse --short HEAD` and links to that commit on GitHub — if the two
footers show different short SHAs, one host is lagging (Cloudflare is manual-deploy today, so
this is expected to happen; GitHub Pages redeploys automatically on every qualifying `main`
push and should usually be current).

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

**Live URL: https://patches-site.pages.dev** (first deploy 2026-08-18, redeployed 2026-08-19
with the current docs, build ~3s, 71 files).

## GitHub Pages mirror

**Live URL: https://alliecatowo.github.io/patches/** (first deploy 2026-08-19).
`.github/workflows/site-gh-pages.yml` builds and deploys on every push to `main` that touches
`site/**` or `docs/**`, plus `workflow_dispatch`, via `actions/configure-pages` +
`actions/upload-pages-artifact` + `actions/deploy-pages` (`pages: write`/`id-token: write`).
It sets `VITEPRESS_BASE=/patches/` so every asset href resolves under the repo-name subpath
GitHub Pages serves a project site from — verified locally with
`VITEPRESS_BASE=/patches/ pnpm --filter @patches/site build` and inspecting
`site/.vitepress/dist/index.html`'s asset hrefs (`/patches/assets/...`, `/patches/vp-icons.css`,
etc., vs. root-relative `/assets/...` for the default Cloudflare build). Unlike the Cloudflare
mirror, this one needs no secrets — `actions/deploy-pages` authenticates via the workflow's own
OIDC token.

Repo setting required before this workflow's `deploy` job can publish anything: **Settings →
Pages → Source: GitHub Actions**. Done for this repo via
`gh api -X POST repos/alliecatowo/patches/pages -f build_type=workflow` (succeeded — no manual
click was needed here); if that API call ever fails with a permissions error on a fork/new
repo, the equivalent one-time manual step is: open the repo's Settings → Pages tab and choose
"GitHub Actions" under **Build and deployment → Source**.

## CI

`.github/workflows/site.yml` (Cloudflare Pages) builds the site on every successful `CI` run
on `main` (via `workflow_run`, same pattern as `deploy.yml`), plus `workflow_dispatch` for
manual runs. The actual `wrangler pages deploy` step is gated behind `vars.SITE_DEPLOY_ENABLED`
— unset today, so the workflow builds (and reports green) on every `main` push but does not
deploy from CI yet. To turn it on: set the `SITE_DEPLOY_ENABLED` repository/environment
variable to `true`, add a narrowly scoped `CLOUDFLARE_API_TOKEN` secret, and set the non-secret
`CLOUDFLARE_ACCOUNT_ID` variable. Until then, Cloudflare deploys are manual
(`pnpm site:deploy`). `.github/workflows/site-gh-pages.yml` (GitHub Pages) has no such gate —
it deploys unconditionally on every qualifying `main` push, since `actions/deploy-pages` needs
no external secrets.

## Known gaps

- No custom domain configured on either host (`patches-site.pages.dev` /
  `alliecatowo.github.io/patches/` only).
- Cloudflare's CI deploy path (`vars.SITE_DEPLOY_ENABLED`) has never been exercised — every
  Cloudflare deploy so far was done by hand with `wrangler`, same caveat as
  `docs/operations/deployment.md`'s Fly deploy workflow. GitHub Pages' deploy path _is_
  CI-driven from day one (there is no manual `wrangler`-equivalent for it), but has only been
  exercised via `workflow_dispatch`/the one-time `gh api pages` enable call in this session, not
  yet a real `main` push.
- `site/public/media/*` are placeholders/absent until P9-002 lands real recordings.
