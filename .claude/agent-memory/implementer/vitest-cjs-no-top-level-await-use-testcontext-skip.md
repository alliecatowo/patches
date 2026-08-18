---
name: vitest-cjs-no-top-level-await-use-testcontext-skip
description: apps/server and apps/worker compile as CJS, so integration test files can't use top-level await for an async reachability probe (e.g. MinIO) — do the probe in beforeAll and call ctx.skip() per test instead
metadata:
  type: feedback
---

`apps/server`/`apps/worker` are CommonJS (`docs/agents/PACKAGE_CONVENTIONS.md` — no
`"type":"module"`, NestJS has no native ESM support). Under `tsconfig`'s `module: NodeNext`,
a plain `.ts` file in a CJS package is typechecked as CommonJS, and `tsc` rejects top-level
`await` there (`TS1309`) even though the file runs fine at test time (vitest transpiles with
esbuild/swc, which doesn't enforce this) — so it only surfaces as a `pnpm typecheck` failure,
not a test failure, which makes it easy to miss if you only run `pnpm test`.

**Why:** Every existing `*.integration.test.ts` file in this repo gates
`describe.skipIf(...)` on a _synchronous_ check (`process.env.TEST_DATABASE_URL` presence).
The first time a suite needed an actual async reachability probe (pinging local MinIO before
running `apps/server/test/media.integration.test.ts` /
`apps/worker/test/media-processing.integration.test.ts`), a naive top-level
`const minioReachable = await isMinioReachable();` typechecked fine locally in isolation but
failed `pnpm --filter <app> typecheck` — caught before commit, but worth avoiding the
re-discovery.

**How to apply:** For any future integration test that needs an async pre-flight check beyond
"is this env var set": do the probe inside `beforeAll`, store the result in an outer `let`,
and have every `it()` accept its `TestContext` and call `if (!reachable) ctx.skip();` as its
first line (vitest's supported "skip a running test from inside its own body" API — real,
not a workaround). Keep `describe.skipIf(...)` for whatever _can_ be checked synchronously
(e.g. `TEST_DATABASE_URL`), and layer the async check on top via per-test `ctx.skip()` rather
than trying to fold both into one `describe.skipIf`.

Related: [[concurrent-shared-checkout-hazard]]
