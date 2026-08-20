---
name: node-version-mismatch-jsdom-localstorage
description: bare `node`/`pnpm` on PATH resolving to a newer Node than mise.toml's pin can produce phantom jsdom test failures (window.localStorage undefined) that look like app bugs
metadata:
  type: feedback
---

Before concluding a failing web/TUI test reveals a real app bug, check `node -v` vs the
`node = "..."` pin in `mise.toml`, and re-run under `mise exec -- pnpm ...` before touching
source. On this machine, `which node` resolved to a linuxbrew Node 26.7.0, while `mise.toml`
pins 24.19.0 — a stale shell PATH picking up a system/brew Node ahead of the mise-managed one.

**Why:** Node 26 ships an experimental native global `localStorage` (returns `undefined`
without `--localstorage-file`). Vitest 4's jsdom environment (`populateGlobal` in
`vitest/dist/chunks/index.*.js`) only overrides a global key with jsdom's version if the key
is already in Vitest's own hardcoded `KEYS` list _or_ absent from `global` — since Node 26 now
defines `localStorage` on `global` itself and Vitest's list predates that, `window.localStorage`
in tests silently resolves to Node's broken native stub instead of jsdom's real `Storage`,
crashing any code that reads/writes it at module scope with
`TypeError: Cannot read properties of undefined (reading 'getItem')`. This reproduced in two
`apps/web` test files (`HomeRoute.test.tsx`, `PrivacyNoticeBanner.test.tsx`) that import
`session.ts`, which calls `localStorage` at module import time. Under `mise exec -- pnpm
--filter @patches/web test`, all 8 files / 29 tests passed with zero source changes.

**How to apply:** When a test failure smells like "environment/runtime is missing/undefined
a thing that should obviously exist" (storage, fetch, crypto, etc.) rather than an assertion
mismatch, run the same command through `mise exec --` before writing a defensive-code fix. A
guard like `window.localStorage?.` may still be legitimate production hardening, but decide
that on its own merits — don't add it just to paper over a toolchain-version artifact, and
say in the report which one it was.
