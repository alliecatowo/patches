---
name: zod-v4-url-validation
description: zod v4 z.httpUrl() rejects localhost — use z.url({ protocol: /^https?$/ }) for dev-friendly strict-scheme URLs
metadata:
  type: project
---

In this repo's zod v4.4.3, `z.httpUrl()` is not just "z.url() but http(s)-only" — it also
constrains `hostname` to `core.regexes.domain` (`/^([a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$/`),
which rejects bare `localhost`. `z.httpUrl().safeParse('http://localhost:3000')` is `false`.

**Why:** Discovered while tightening `PUBLIC_ORIGIN` validation for `apps/server`/`packages/config`
(task B-002) — dev default is `http://localhost:3000`, and `z.httpUrl()` silently broke it.

**How to apply:** For "http(s) scheme required, but still accept localhost/dev hosts", use
`z.url({ protocol: /^https?$/ })`, not `z.httpUrl()`. Reserve `z.httpUrl()` for fields that are
genuinely always a real public domain. Verify zod behavior against the actual installed version
in `node_modules/.pnpm/zod@<version>` before relying on a specific validator — the exact regexes
live in `zod/v4/core/regexes.js`.
