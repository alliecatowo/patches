# `@patches/tui`

The Ink 7 / React 19 terminal client for Patches — the `patches` command.

## Status

**Not yet published to npm.** `npm view patches` (checked 2026-08-18) shows the bare
`patches` package name is already taken by an unrelated package, so this project publishes
as the scoped name `@patches/tui` instead (confirmed free: `npm view @patches/tui` returns
404 as of the same date). The `patches-social` name is also free, noted here in case
`@patches/tui` needs to change later.

**A real `npm i -g @patches/tui` will not work yet even once this package itself is
published**, because it depends on two other workspace packages that are still private and
unpublished:

```
@patches/proto            (packages/proto)
@patches/terminal-media   (packages/terminal-media)
```

`pnpm pack`/`pnpm publish` rewrite `workspace:*` to the exact local version (e.g.
`@patches/proto: 0.1.0`) rather than bundling those packages in — so an install from the
public registry 404s on them (`ERR_PNPM_FETCH_404` / npm's equivalent). Verified locally:
packing all three (`pnpm --filter <pkg> pack`) and installing the `@patches/tui` tarball
into a scratch project with `pnpm-workspace.yaml` `overrides` pointing `@patches/proto`
and `@patches/terminal-media` at the other two tarballs succeeds and `patches --version`
runs correctly — but that override is exactly the thing a real `npm install -g` from the
registry can't do. **Follow-up needed before a real publish**: either publish
`@patches/proto`/`@patches/terminal-media` too (making them public, versioned packages in
their own right), or bundle `apps/tui`'s dependencies at build time (e.g. via `tsup`/
`esbuild`) so the published tarball is self-contained. Not decided yet — see
`docs/operations/deployment.md`'s npm packaging section.

## Local install (proves the tarball itself works)

```bash
pnpm --filter @patches/tui build
pnpm --filter @patches/tui pack --pack-destination /tmp/patches-tui-pack
# installs the built tarball into a scratch project, exercising the real `bin` wiring —
# see docs/operations/deployment.md for the full repro including the workspace override
# needed to satisfy @patches/proto/@patches/terminal-media locally.
```

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
@patches/tui test`, `pnpm --filter @patches/tui typecheck`.
