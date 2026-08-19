# `@patches/tui`

The Ink 7 / React 19 terminal client for Patches — the `patches` command.

## Status

**Status: planned until first publish.** This package builds a self-contained, publishable
npm package under the name **`patches-social`** (checked 2026-08-18: `npm view patches`
shows the bare `patches` name is taken by an unrelated package; `patches-social` is free).
The npm-facing package name is set via `publishConfig.name` in `package.json` — added in
pnpm 11.18 (this repo pins pnpm 11.22.0, see `mise.toml`) specifically for this case: a
project whose published name is already taken by a sibling can publish under a different
name without renaming its workspace-local `package.json` `name`. That means every
`pnpm --filter @patches/tui ...` / turbo `--filter=@patches/tui` command elsewhere in this
repo (root `package.json`, `mise.toml`, CI workflows) is unaffected by this and keeps
working unchanged; only the packed/published tarball's `package.json` says
`"name": "patches-social"`.

`npm i -g patches-social` is not runnable yet because publishing itself (`npm login` +
`pnpm publish`) hasn't happened — that's the package owner's manual step, see
`docs/operations/deployment.md`'s "Publishing the TUI" section. Building and packing the
tarball locally and installing it into a scratch prefix, however, is fully verified below and
proves the eventual `npm i -g patches-social` will work once published.

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

`@patches/proto` ships its `.proto` files as a directory sibling to its own `dist/` at
runtime (`packages/proto/src/proto-path.ts`'s `getProtoDir()`). Once `@patches/proto`'s code
is inlined into `apps/tui/dist/cli.js`, that lookup runs from `apps/tui/dist/` instead of
`packages/proto/dist/`, so the build also copies `packages/proto/proto/**` to
`apps/tui/dist/proto/` (`apps/tui/scripts/copy-proto.mjs`, run as part of `pnpm build`), and
`getProtoDir()` now checks a `proto/` directory next to itself before falling back to the
original one-level-up hop — see the comment on `getProtoDir()` for the full resolution order.

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
