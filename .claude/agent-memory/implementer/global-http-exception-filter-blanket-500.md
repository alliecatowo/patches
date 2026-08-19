---
name: global-http-exception-filter-blanket-500
description: a global APP_FILTER's HTTP branch that hardcodes statusCode=500 silently breaks once a second HTTP surface (e.g. Nest's own NotFoundException for unmatched routes) starts routing through it
metadata:
  type: feedback
---

A Nest `APP_FILTER`-global exception filter written for one narrow HTTP surface (e.g. a
federation surface whose controllers only ever throw application `AppError`s, never let a
framework exception escape) can end up hardcoding `response.statusCode = 500` for _every_
caught HTTP exception, with no branch for Nest's own `HttpException` subclasses.

**Why:** This is invisible until a second, more general HTTP surface starts sharing the same
global filter — e.g. an always-on HTTP listener whose unmatched routes throw Nest's own
`NotFoundException`. That exception is a normal framework routing outcome, not a bug, but the
blanket 500 branch swallowed its real status/message and reported 500 instead of 404. Found via
`GET /not-healthz`/an unmatched Connect path finally exercising the "any other path" case for
the first time (P10-004/ADR 0016 — the HTTP listener went from conditional to always-on).

**How to apply:** When a global exception filter has an HTTP branch, check `exception
instanceof HttpException` (from `@nestjs/common`) first and use its own `getStatus()`/`message`
— sanitize-to-generic-500 only for the actual fallthrough (non-`HttpException`, i.e. unexpected
bugs). Re-check this assumption specifically whenever a second HTTP surface starts sharing an
app's global exception filter, since the filter's author usually only tested against the first
surface's own throw sites.
