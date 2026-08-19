---
name: tsup-noexternal-bundles-built-dist-not-source
description: tsup's noExternal on a workspace package resolves and inlines that package's already-built dist/ (via its package.json main/exports), not its live TS source — a stale sibling dist silently ships old code, and a source-level fix (e.g. a runtime path-resolution fallback) needs that package rebuilt first
metadata:
  type: feedback
---

When `tsup.config.ts` sets `noExternal: [/^@patches\//]` to inline a workspace dependency's
code straight into a bundle (e.g. `apps/tui`'s CLI inlining `@patches/proto`,
`@patches/domain`, `@patches/terminal-media` so the published tarball is self-contained —
P9-003/A-046), esbuild resolves that import the normal Node way: through the dependency's own
`package.json` `main`/`module`/`exports` fields, which point at its **already-built**
`dist/`. It does not re-transpile the dependency's TypeScript source on the fly.

**Why this bit me:** I edited `packages/proto/src/proto-path.ts` (added a fallback so
`getProtoDir()` still finds the `.proto` tree once its own code is inlined into a
consumer's single-file bundle) and rebuilt `apps/tui` — but not `packages/proto` first. The
bundle still contained the _old_ `proto-path.ts` logic, silently, with zero build error;
only a runtime check (`node dist/cli.js ping ...` from `/tmp`, outside the repo) surfaced the
stale behavior, because the built-in single-package `pnpm --filter @patches/tui build` script
doesn't build its dependencies first (bypasses turbo's `dependsOn: ["^build"]`).

**How to apply:** After editing the source of any workspace package consumed via a
`noExternal` bundle, either rebuild that package explicitly before rebuilding the bundling
consumer, or invoke the build through turbo (`pnpm turbo run build --filter=<consumer>`,
which respects `dependsOn: ["^build"]` and rebuilds dependencies first) rather than the
package's own bare `pnpm --filter <consumer> build` script. Always do a real runtime smoke
test of the final bundled artifact from outside the repo checkout (no repo `node_modules` on
`PATH`) — a green `tsc`/build only proves the bundle _compiled_, not that a cross-package
source edit actually made it into the inlined output.

Related: [[proto-fieldmask-wire-shape]], [[proto-nestjs-value-export-leak]]
