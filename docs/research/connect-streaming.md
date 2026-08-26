# Connect protocol server-streaming — viability per client/hop

Verified 2026-08-25 against connectrpc.com/docs (Node, Web, protocol, FAQ), the connect-es source
(github.com/connectrpc/connect-es), the maintained official React Native example
(github.com/connectrpc/examples-es/tree/main/react-native), the upstream
`connectrpc/connect-es#199` issue thread (read via `gh api`, not the training-data snapshot), Expo's
own docs for `expo/fetch`, and Fly.io's configuration reference + community reports (flagged
separately, community is not an authority per spec §132). Stack in scope: same as
`docs/research/connect-es.md` (`@connectrpc/connect` 2.1.2, `@connectrpc/connect-express` 2.1.2,
`@connectrpc/connect-node` 2.1.2) plus `@connectrpc/connect-web` for browser/RN and ADR
0016/0027's Fly topology (`infra/fly/fly.toml`, read directly in this worktree). Today's schema has
zero streaming RPCs — this note is pre-implementation research, not a description of shipped
behavior.

None of my training knowledge about streaming support was trusted; every claim below is sourced
per-section. Unverified/inferred claims are flagged as such.

---

## 1. Does the Connect protocol require HTTP/2 for server-streaming?

**No — this is the load-bearing fact.** Per the Connect protocol spec:

> "Bidirectional streaming requires HTTP/2, but the other RPC types also support HTTP/1.1."

Server-streaming responses don't need HTTP/2 trailers because Connect encodes the stream in-band:
the HTTP response body is a sequence of length-prefixed **Enveloped-Message** frames, and the
final frame is flagged (`Envelope-Flags` bit) as an `EndStreamResponse` carrying the equivalent of
gRPC trailers (status/error) instead of relying on real HTTP/2 trailers. This is why unary and
server-streaming both work over plain HTTP/1.1 chunked responses, while only **bidirectional**
streaming (which needs concurrent independent read/write directions) and the **gRPC protocol
itself** (which always requires HTTP/2 framing, for any RPC type) are HTTP/2-only.

Source: connectrpc.com/docs/protocol (fetched 2026-08-25) — quoted directly above.

## 2. connect-node: `createConnectTransport`, `createGrpcTransport`, `httpVersion`

- Both `httpVersion: "1.1"` and `"2"` are valid options on connect-node's transports; the docs
  state you "have to tell the Node.js http API which HTTP version to use."
- "With HTTP 1.1, the gRPC protocol and bidirectional streaming are not supported." This applies
  to `createGrpcTransport()` specifically (gRPC protocol always needs HTTP/2) and to bidi streaming
  on any transport.
- "With HTTP/2, clients can use the Connect, gRPC, or gRPC-Web protocol, and call all types of
  RPCs."
- The docs page did not spell out server-streaming explicitly beyond this, but combined with §1 the
  conclusion is direct: **`createConnectTransport({ httpVersion: "1.1", ... })` supports
  server-streaming** (Connect protocol, not gRPC protocol); only `createGrpcTransport` or
  bidi-streaming calls force `httpVersion: "2"`.

Source: connectrpc.com/docs/node/using-clients (fetched 2026-08-25).

## 3. Server side — connect-express vs Fastify vs vanilla-Node vs Next.js

This is the critical question and is answered explicitly, per-adapter, on the official docs page,
quoted verbatim:

- **Express**: "Express does not support the `http2` module. You can serve the Connect protocol
  and gRPC-Web. The gRPC protocol and bidirectional streaming RPCs are not supported."
- **Next.js**: "Next.js does not support the `http2` module. You can serve the Connect protocol
  and gRPC-Web. The gRPC protocol and bidirectional streaming are not supported." (same
  constraint as Express, for the same reason — no `http2` module access.)
- **Fastify**: "Over HTTP/2, Fastify can serve the Connect, gRPC, and gRPC-Web protocols with all
  types of RPCs. Over HTTP 1.1, the gRPC protocol and bidirectional streaming are not supported."
  (Fastify _can_ run HTTP/2, unlike Express, so it gets full support if configured for HTTP/2.)
- **Vanilla Node (`connectNodeAdapter`)**: "Over HTTP/2, Node.js can serve the Connect, gRPC, and
  gRPC-Web protocols with all types of RPCs. Over HTTP 1.1, the gRPC protocol and bidirectional
  streaming RPCs are not supported." Same shape as Fastify.

**Conclusion: `@connectrpc/connect-express` (this repo's server adapter, ADR 0016) already
supports server-streaming today**, because server-streaming under the _Connect_ protocol needs
only HTTP/1.1, which is all Express ever speaks. Express is disqualified only for the **gRPC**
protocol and for **bidirectional** streaming — neither of which this stack uses or needs (gRPC
proper stays on the TUI's separate grpc-js/`:50051` listener per ADR 0016; the Connect edge only
ever needs to speak Connect + gRPC-Web). **No adapter change is required to add a server-streaming
RPC** — `expressConnectMiddleware` handles it on the existing Express app.

Source: connectrpc.com/docs/node/server-plugins (fetched 2026-08-25) — all four quotes above are
verbatim from that page's per-adapter "Protocol support in X" sections.

## 4. Browsers (`@connectrpc/connect-web`, `createConnectTransport`)

- "Though the Connect protocol supports _all_ types of streaming RPCs, web browsers do not support
  streaming from the client side across the board." The cause is cited as a browser-vendor gap in
  `fetch` request-body streaming (linking `whatwg/fetch#1438`), not a Connect limitation.
- Direct conclusion stated on the page: **"you can use streaming from the browser, but only
  server streaming."**
- I did not find an explicit HTTP/2 requirement stated for browser server-streaming specifically;
  combined with §1's protocol-level fact, server-streaming over Connect works over HTTP/1.1 or
  HTTP/2 from a browser `fetch` call the same as from connect-node.

Source: connectrpc.com/docs/web/getting-started (fetched 2026-08-25, via search-engine-cached
content — I was not able to load this specific page directly with WebFetch, it 404's on direct
fetch for reasons I could not determine; treat the exact wording as high-confidence but not
independently re-verified against raw HTML in this pass — the FAQ page below corroborates the same
conclusion and _was_ fetched directly).

**Conclusion: viable for `apps/web`** — the browser is capable of consuming a Connect
server-streaming response using the exact same `createClient`/`createConnectTransport` API already
planned for unary calls in ADR 0016 §9/§C. No separate transport or library is needed.

## 5. React Native / Expo — `connectrpc/connect-es#199`, current status

ADR 0016 §Context states (as of 2026-08-18): "React Native's `fetch` is an XHR polyfill and
**cannot stream** (connect-es#199)." **This is now stale relative to the issue's own resolution —
flagging as a discrepancy, see below.**

Full history of `connectrpc/connect-es#199` ("Streaming support in React Native"), read via
`gh api repos/connectrpc/connect-es/issues/199` (opened 2022-07-22, **closed**, last activity
2024-12-18):

- 2023-06-15 (connect-es maintainer `smaye81`): "There is currently no option to provide
  server-streaming support in React Native due to some limitations with the Fetch API. We would
  need action on React Native's part first."
- 2023-06-15 (`timostamm`): "React Native provides a fetch implementation, but it is incomplete,
  and does not support streams" — pointing at the upstream `facebook/react-native#27741` issue.
  Suggests a hand-rolled SSE-style text endpoint plus polling as a workaround if streaming is
  needed before upstream fixes it, with a `: ping` comment-line keepalive to hold the connection
  open — **this workaround is now obsolete per the entries below, kept here only as historical
  context** in case a very old RN runtime is ever targeted.
- 2024-08-21 (`peterlazar1993`): "Expo is adding support for streaming in fetch"
  (`expo/expo#30173`).
- 2024-11-14: Expo shipped **`expo/fetch`**, a separate WinterCG-compliant fetch implementation
  (not the RN-core XHR-polyfill fetch), in **Expo SDK 52**.
- 2024-11-25 (`iitsdani`): "on Expo 52 I can just use `createConnectTransport` and it works fine
  (so far I've only tested unary calls)."
- 2024-12-12 (`smaye81`, maintainer): "We have upgraded to React Native v0.76.5 and Expo 52 in our
  React Native example [connectrpc/examples-es/react-native]. This makes use of the new streaming
  support... We tested this with both binary and JSON format as well as Connect and gRPC-web
  transports." Confirmed **no polyfills are needed anymore** (2024-12-13 follow-up).

**I independently read the current official example** (`connectrpc/examples-es/tree/main/react-native`,
`package.json` pins `expo: ^53.0.20`, `react-native: 0.79.5`, `@connectrpc/connect-web: ^2.0.3`;
`app/index.tsx` read directly via `gh api`) and confirmed it really does call a
**server-streaming** RPC (`client.introduce(request)`, consumed with `for await (const response of
stream)`) by wiring Expo's fetch into connect-web's transport:

```ts
import { fetch, FetchRequestInit } from 'expo/fetch';
import { createConnectTransport } from '@connectrpc/connect-web';

const client = createClient(
  ElizaService,
  createConnectTransport({
    baseUrl: 'https://demo.connectrpc.com',
    fetch: (input, init) => {
      if (typeof input !== 'string') {
        throw new Error('expo/fetch requires the first argument to be a string URL');
      }
      return fetch(input, init as unknown as FetchRequestInit) as unknown as Promise<Response>;
    },
  }),
);
```

Two caveats, from the example's own source comment and a linked, now-**closed** Expo issue:

- The example's code comment: "Note that cancelling streams does not currently work with React
  Native Expo v52" (`expo/expo#33549`). I checked that issue directly (`gh api
repos/expo/expo/issues/33549`) — filed 2024-12, **state: closed**, i.e. fixed upstream; I did not
  verify which Expo SDK version the fix shipped in, so treat "abort/cancel works on current Expo"
  as **inferred**, not independently confirmed against a changelog.
- This uses `@connectrpc/connect-web`'s browser transport (not `connect-node`'s), with Expo's
  fetch injected via the `fetch` option — the correct transport choice for RN per this example, not
  `connect-node`.

**Conclusion: React Native streaming is now viable, given Expo SDK ≥52 and the `expo/fetch`
injection pattern above** — a materially different answer than ADR 0016's "cannot stream." Bare
React Native (no Expo, or Expo <52 relying on the built-in `fetch`) still cannot stream, since that
`fetch` remains the XHR polyfill described in the issue. **This is a discrepancy with ADR 0016 and
should be flagged for an ADR update/amendment** (architect's call, not this note's) — plan for
Expo, and don't repeat "RN cannot stream" as an absolute constraint in future planning docs without
qualifying "on Expo <52 / bare RN's built-in fetch."

Source: github.com/connectrpc/connect-es/issues/199 (read via `gh api`, full comment thread,
2022-07-22 through 2024-12-18); github.com/connectrpc/examples-es/tree/main/react-native
(`package.json`, `app/index.tsx`, read directly via `gh api`); docs.expo.dev/versions/latest/sdk/expo
(`expo/fetch` section, fetched 2026-08-25); github.com/expo/expo/issues/33549 (read via `gh api`,
confirmed closed).

## 6. Fly.io — proxy support for long-lived HTTP streaming, timeouts

- `infra/fly/fly.toml` (read directly in this worktree) already runs **two** `[[services]]` blocks
  on the `server` process: the gRPC service on `:443→50051` sets `[services.ports.http_options]
h2_backend = true` (needed because gRPC-proper always requires HTTP/2, per §1/§3 above); the
  Connect/HTTP service on `:443,80→8080` (ADR 0016 §8) sets **no** `h2_backend` — consistent with
  §3's finding that Connect protocol server-streaming needs only HTTP/1.1, so nothing about the
  existing Fly config needs to change to add a server-streaming Connect RPC.
- Fly's own config reference documents an `idle_timeout` key: `[http_service.http_options]
idle_timeout = 600` (example value, seconds) — "Configure an idle-timeout for connections to your
  app." **The doc excerpt I fetched did not state a default value or unit precisely** (I inferred
  "seconds" from the example's bare integer and Fly's other timeout fields, which are consistently
  seconds elsewhere in the same reference — flagged as **inferred**, re-check the live page before
  relying on a specific default). This key is not currently set in `infra/fly/fly.toml`, so
  whatever Fly's undocumented default is applies today.
- **Fly's own docs page did not state whether/what the default idle timeout actually is**, nor did
  it separately document long-lived-streaming-response behavior. A Fly community thread (not an
  authoritative source, flagged accordingly) reports differing anecdotal numbers (one report
  suggested single-digit-second delays after ~10 minutes idle due to a _connection-establishment_
  bug, not a hard idle-timeout kill of an active stream) — **I could not confirm an authoritative
  specific idle-timeout duration from Fly's official docs in this pass; treat any specific second
  count for Fly's proxy idle timeout as unverified** until re-checked directly against a current
  Fly docs page or a support ticket.
- **A server-streaming RPC that emits data periodically (not perfectly idle) should not be affected
  by an idle-connection timeout** at all, since `idle_timeout` (by its own description) triggers
  only on connections with no traffic — this is consistent with, but not identical to, the general
  Connect FAQ guidance in §7 about not letting _infrastructure_ impose timeouts shorter than the
  call's expected duration.
- I found no Fly documentation stating a hard maximum request/response duration distinct from
  idle timeout (i.e. no evidence Fly forcibly cuts a _busy_ streaming response after N minutes
  regardless of activity) — **absence of a stated cap is not the same as a documented "no cap,"
  flag as unverified** and worth a smoke test (a real multi-minute streaming RPC against a
  deployed Fly Machine) before depending on it in production.

Source: connectrpc.com/docs and github.com/connectrpc/connect-es cited above for the protocol
facts; `fly.io/docs/reference/configuration` (fetched 2026-08-25, `[http_service.http_options]`
section, `idle_timeout` and `h2_backend`/`services.ports.http_options.h2_backend` keys); local file
`/home/allie/develop/wt-p19-011/infra/fly/fly.toml` (read directly); Fly community thread
`community.fly.io/t/outgoing-request-timeouts-after-idle-time/21000` (**unofficial, flagged, not
authoritative** — cited only to show what wasn't confirmable from official docs).

## 7. Keepalive/heartbeat recommendations for long-lived streams through proxies

Connect's own FAQ, quoted verbatim (connectrpc.com/docs/faq, fetched 2026-08-25):

> "How do I reliably call a server streaming RPC from a web browser? The answer is highly
> dependent on all of the networking parties involved. Generally, make sure that your server or
> your infrastructure does not apply timeouts within the expected duration of calls. If possible,
> pre-empt timeouts by setting short deadlines and by repeating the call when the deadline is
> exceeded."

And, on proxying through NGINX specifically:

> "Streaming RPCs typically require end-to-end HTTP/2, which NGINX supports — but it isn't enabled
> by default. Turn it on for clients with `ngx_http_v2_module`, and for upstream connections with
> `proxy_http_version 2`."

Read together with §1/§3, this NGINX-specific line is a **practical infra recommendation for
_general_ streaming reliability through a particular proxy implementation, not a restatement of
the Connect protocol's own HTTP/2 requirement** — Connect server-streaming is still spec'd to work
over HTTP/1.1 (§1); NGINX's advice to prefer HTTP/2 end-to-end is about that proxy's own chunked
HTTP/1.1 handling being less well-exercised for streaming, not a protocol mandate. **This is worth
treating as caution, not a hard blocker, for Fly** (whose proxy is not NGINX and is not separately
documented on this point per §6) — recommend validating with a real deployed smoke test rather than
assuming HTTP/1.1 chunked streaming is trouble-free end-to-end through Fly's specific proxy.

The only concrete **keepalive** technique found in official/near-official sources is the
`timostamm` SSE-style suggestion in the connect-es#199 thread (§5) — a periodic no-op line
("`: ping`") to keep an idle connection's bytes flowing — but that was proposed for a **hand-rolled
non-Connect SSE endpoint**, not as a Connect-protocol-native keepalive mechanism. **I found no
official Connect or gRPC-Web documentation describing an in-protocol heartbeat/keepalive message
for server-streaming RPCs themselves** (unlike gRPC's HTTP/2-level `PING` frames, which are a
transport-level mechanism connect-es's Connect-protocol-over-HTTP/1.1 path does not have access
to). **Flagged as unverified/unresolved**: if a server-streaming RPC in this schema needs to
survive long idle gaps between messages, the only documented mitigation found is "the server emits
data often enough that no hop's idle timeout fires" (§7's FAQ quote) — there is no documented
protocol-level ping for Connect server-streaming to fall back on if that's insufficient.

Source: connectrpc.com/docs/faq (fetched 2026-08-25, both quotes verbatim);
github.com/connectrpc/connect-es/issues/199 comment by `timostamm`, 2023-09-21 (read via `gh api`,
cited in §5).

---

## Verdict

**Server-streaming is viable on this stack today, with no server-adapter change required**, for
every planned client:

| Hop / client                                                     | Verdict                                                         | Why                                                                                                                                                                                                                                                                                   |
| ---------------------------------------------------------------- | --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Server (`@connectrpc/connect-express` on Nest's Express adapter) | **Viable as-is**                                                | Express serves Connect protocol server-streaming over HTTP/1.1 natively (§3); only gRPC-proper and bidi are disqualified, neither is in scope.                                                                                                                                        |
| TUI (grpc-js, separate `:50051` listener)                        | **Out of scope for this question**                              | TUI stays on native gRPC per ADR 0016 — gRPC server-streaming already works over HTTP/2 (unaffected; not part of the Connect edge).                                                                                                                                                   |
| `apps/web` (browser, connect-web)                                | **Viable**                                                      | Browsers support Connect server-streaming (client-streaming/bidi are the excluded cases) (§4).                                                                                                                                                                                        |
| React Native / Expo mobile                                       | **Viable, contingent on Expo SDK ≥52 + `expo/fetch` injection** | Bare RN fetch (XHR polyfill) still can't stream; Expo's own `expo/fetch`, wired into `createConnectTransport`'s `fetch` option, is proven in an official example (§5). **This contradicts ADR 0016's "RN cannot stream" — flag for an ADR update.**                                   |
| Fly.io transport                                                 | **Likely viable, not fully verified**                           | No `h2_backend`/protocol change needed for the Connect port (§6); Fly's exact idle-timeout default and hard duration cap are not confirmed from official docs — recommend a real smoke test against a deployed Fly Machine before shipping a long-lived stream to production (§6/§7). |

**What would have to change on the server**: nothing at the adapter/transport level. What
changes is schema/implementation work only — add a `server_streaming` RPC to a `.proto` (crossing
ADR 0016's own guard, which currently "fails if a `.proto` ever introduces streaming" per
`docs/research/connect-es.md` §2 — **that guard would need to be relaxed/rewritten to
allow-list server-streaming specifically while still rejecting client-streaming/bidi**, since this
research shows server-streaming is safe on every current hop but bidi/client-streaming are not),
implement it as an `AsyncIterable`/generator in the Connect router (`ServiceImpl`'s streaming
method shape was not independently re-verified in this pass — the existing `connect-es.md` §5 only
confirmed the **unary** `MethodImpl` shape; **flag as next step**: read
`packages/connect/src/implementation.ts`'s server-streaming `MethodImpl` variant before
implementing), and decide how ADR 0016 §3's "byte-level gRPC proxy" model extends to streaming
(today's proxy design is unary-only, calling `client.makeUnaryRequest` — a streaming RPC would need
`client.makeServerStreamRequest` on the grpc-js side, forwarding chunks as they arrive rather than
buffering one response).

## Status of this note (added 2026-08-25 by ADR 0032)

This note is **pre-implementation research that is not being acted on**. ADR
[0032](../decisions/0032-dm-delivery-stays-poll-based.md) decided to keep DM delivery poll-based,
so no streaming RPC enters the schema and the unary-only guards
(`packages/proto/src/es.test.ts:21-26`, `apps/server/src/transport/connect/grpc-proxy.ts:145-151`)
stay in force. The note's value is that it **retires ADR 0016's "browsers/RN cannot stream"
premise** — the deferral is a product choice, not a capability limit — and that it records exactly
what would have to be verified first if a re-open gate (ADR 0032 §T1/T2/T3) ever trips. The
unresolved items below are deliberately left unresolved for that reason, not overlooked.

<!-- INCOMPLETE: next step — read packages/connect/src/implementation.ts's server-streaming
MethodImpl/StreamingImpl signature and packages/connect/src/router.ts's streaming registration
path before any implementer starts P-level work on an actual streaming RPC; also independently
verify Fly's idle_timeout default/units and whether it can kill an *active* (non-idle) long stream,
via a real deployed smoke test rather than docs alone. -->
