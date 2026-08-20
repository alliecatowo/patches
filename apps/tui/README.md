# `@patches/tui`

The Ink 7 / React 19 terminal client for Patches — the `patches` command.

## Status

**Status: published as a self-contained tarball on GitHub Releases; npm registry publication
still requires an authenticated owner session.** The package is built under the name
**`patches-social`** (checked 2026-08-18: `npm view patches`
shows the bare `patches` name is taken by an unrelated package; `patches-social` is free).
The npm-facing package name is set via `publishConfig.name` in `package.json` — added in
pnpm 11.18 (this repo pins pnpm 11.22.0, see `mise.toml`) specifically for this case: a
project whose published name is already taken by a sibling can publish under a different
name without renaming its workspace-local `package.json` `name`. That means every
`pnpm --filter @patches/tui ...` / turbo `--filter=@patches/tui` command elsewhere in this
repo (root `package.json`, `mise.toml`, CI workflows) is unaffected by this and keeps
working unchanged; only the packed/published tarball's `package.json` says
`"name": "patches-social"`.

`npm i -g patches-social` is not runnable yet because registry publishing itself (`npm login`

- `pnpm publish`) has not happened. Until then, install the signed release tarball using the
  command in `docs/operations/try-it.md`. Building, packing, and installing that artifact into a
  scratch prefix is fully verified below.

### Self-contained build (P9-003 / A-046)

`apps/tui/tsup.config.ts` bundles `src/cli.tsx` into a single `dist/cli.js` (ESM, targeting
`node24`) via `noExternal: [/^@patches\//]`, which inlines the three workspace packages this
client depends on — `@patches/domain`, `@patches/proto`, `@patches/terminal-media` — directly
into the bundle. Those three stay `private: true` in their own `package.json`s and are never
published on their own; a real `npm install -g` from the registry can't resolve them as
separate dependencies, so bundling them is what makes a plain `npm install -g patches-social`
actually work. Everything else — native addons (`sharp`, `@napi-rs/keyring`) and packages
that must stay a single shared instance (`ink`, `react`) — stays a real, external npm
dependency with a concrete semver range (resolved from `pnpm-workspace.yaml`'s `catalog:` at
pack/publish time; verified by inspecting the packed `package.json`, not just trusted).

ADR 0023 (P10-013) moved the TUI's runtime off `@grpc/grpc-js`/`@grpc/proto-loader` onto
`@patches/client` + protobuf-es over a Connect transport, so the published package no longer
parses `.proto` files at startup and needs none copied into it. Slice 8 (P10-015) dropped the
`.proto`-copying build step (`scripts/copy-proto.mjs`) and both `@grpc/*` packages as runtime
dependencies — `dist/` in the packed tarball is `cli.js` alone, no `dist/proto/`. `@grpc/*`
remain devDependencies only, exercised by `test/transport.test.ts` against a real grpc-js
server to verify the Connect gRPC transport's wire behavior.

## Local install (proves the tarball itself works)

Verified end-to-end (2026-08-18) from a shell where the repo's own `node_modules` is not on
`PATH`, and against the live node (`patches-social.fly.dev:443`):

```bash
pnpm --filter @patches/tui build
pnpm --filter @patches/tui pack --pack-destination /tmp/patches-tui-pack
# packed tarball is patches-social-<version>.tgz — the pnpm workspace-local
# package.json "name" (@patches/tui) is rewritten to "patches-social" by
# publishConfig.name at pack time.

# install into a scratch global prefix and run it with no repo checkout on PATH:
mkdir -p /tmp/pfx/bin
PATH="/tmp/pfx/bin:$PATH" PNPM_HOME=/tmp/pfx pnpm add -g /tmp/patches-tui-pack/patches-social-*.tgz
cd /tmp && /tmp/pfx/bin/patches --version
cd /tmp && /tmp/pfx/bin/patches ping --server patches-social.fly.dev:443
```

(`pnpm add -g <tarball>` is used above as the reproducible local proof; a real npm user runs
`npm install -g patches-social` once it's published — both resolve the same npm-registry
semver ranges in the packed `package.json`, so this is an equivalent proof of installability.)

## Upgrading

An interactive launch checks GitHub Releases for a newer build at most once every 6 hours
(cached under `$XDG_CACHE_HOME/patches/upgrade-check.json`) and, if one exists, prompts before
opening the app: "A Patches upgrade is available: … → … . Upgrade now? [y/n]". `y` installs it
in place (`npm install -g` / `pnpm add -g` / "you're running from a repo checkout, `git pull &&
pnpm build` instead" — detected from how the running binary got there) and tells you to Ctrl+C
and relaunch; `n` continues into the app unchanged. `patches upgrade` does the same check and
install non-interactively, bypassing the cache. Skip the check with `--no-upgrade-check` /
`PATCHES_NO_UPGRADE_CHECK=1`; it's already off under `CI=true`. See `src/upgrade/` and
`docs/operations/release.md` (cutting a release).

## Running against a server

Once installed (locally, per above, or via `pnpm --filter @patches/tui start` from a repo
checkout):

```bash
patches --server grpc.patches.social:443          # production, TLS
patches --server 127.0.0.1:50051 --insecure        # local dev server, plaintext
patches ping --server 127.0.0.1:50051 --insecure   # non-interactive connectivity check
```

From a repo checkout without a global install: `pnpm --filter @patches/tui build && node
apps/tui/dist/cli.js --server 127.0.0.1:50051 --insecure` (or `mise run tui`).

## Development

See the repo root [`README.md`](../../README.md) and
[`docs/operations/local-development.md`](../../docs/operations/local-development.md).
Package-local commands: `pnpm --filter @patches/tui dev` (tsx, watch mode — run outside
Turbo, see `docs/operations/local-development.md`'s note on why), `pnpm --filter
@patches/tui test`, `pnpm --filter @patches/tui typecheck`. `pnpm --filter @patches/tui
build` now runs `tsup` (bundling) rather than `tsc`, see "Self-contained build" above —
`tsc --noEmit` (the `typecheck` script) is unaffected and still type-checks `src/` directly.
