---
name: nestjs-hybrid-app-grpc-interceptors-break-http
description: 'APP_INTERCEPTOR/APP_FILTER providers written assuming gRPC-only ExecutionContext hang every HTTP request in a hybrid app with no response at all — must guard on context.getType()'
metadata:
  type: feedback
---

In a NestJS hybrid app (`NestFactory.create(AppModule)` + `app.connectMicroservice()` +
`app.listen()`, e.g. `apps/server/src/main.ts`'s gRPC+HTTP setup for Phase 8 federation), any
globally-registered `APP_INTERCEPTOR`/`APP_FILTER` provider runs for **every** transport, not
just the one it was written for. `context.switchToRpc().getContext()` on an HTTP request does
not throw or return `undefined` cleanly — it re-indexes the same underlying handler arguments
Nest already has, so for Express it actually returns the `Response` object reinterpreted as
"RPC context". Calling gRPC-`Metadata`-shaped methods on it (e.g. `.get(key)[0]`, since
`Response#get` returns a string or `undefined`, not an array) throws synchronously, before the
request ever reaches a controller — and because this happens inside a global interceptor/filter
rather than a normal handler, the HTTP response never gets written at all. The client just hangs
until its own timeout; there is no error, no stack trace client-side, nothing in server logs
either if the logger is set to `false`/quiet.

**Why:** This produced a full-on unexplained hang while building the P8-001..008 federation
HTTP surface — `apps/server/src/common/interceptors/request-context.interceptor.ts` and
`apps/server/src/common/errors/rpc-exception.filter.ts` were both written pre-hybrid-app,
assuming every request was gRPC. A minimal `NestFactory.create(PingModule)` HTTP-only test
worked fine; the _same_ minimal module worked fine hybrid with gRPC connected too; only the
full `AppModule` (with these two global providers) hung. Root-caused by bisecting: strip the
app down to a trivial controller+module, confirm it works, then add pieces back one at a time
(gRPC hybrid, then the real `AppModule`) until the hang reappears.

**How to apply:** Any `APP_INTERCEPTOR`/`APP_FILTER`/`APP_GUARD` written for a gRPC-only app,
the moment that app becomes a hybrid app, must branch on `context.getType()` (interceptors/
guards) or `host.getType()` (filters) and either skip gRPC-specific logic entirely for
non-`'rpc'` contexts, or handle the HTTP case properly (an `ExceptionFilter`-style branch must
write the HTTP response itself via `host.switchToHttp().getResponse()` — returning an
`Observable` the way an `RpcExceptionFilter` does is meaningless for HTTP and can also leave
the response unwritten). Test this explicitly with a real HTTP call the first time any project
adds an HTTP listener to a previously gRPC-only Nest app — the failure mode (silent hang, no
error) is easy to miss until it's the only symptom.
