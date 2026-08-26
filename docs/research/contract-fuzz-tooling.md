# Off-the-shelf contract fuzzing for the protobuf/gRPC/Connect API — H-026 survey

**Verified:** 2026-08-26. Owner direction (2026-08-26): do **not** build a hand-rolled fuzzer;
find an off-the-shelf engine in the spirit of Schemathesis. A thin CI wrapper around an
off-the-shelf engine is acceptable; writing the generator/mutator/oracle engine ourselves is
not. This note supersedes the "Safe contract-fuzzing replacement" section of
`docs/research/contract-load-tooling.md` (its fast-check harness proposal is now owner-rejected);
the load/H-027/H-028 content of that note is unaffected.

## Contract under test (verified in-repo 2026-08-26)

- 22 `packages/proto/proto/patches/v1/*.proto` files, **21 services, 171 unary RPCs**, zero
  streaming, no `oneof`/`map` (ADR 0016 guard). Descriptor collection `PATCHES_V1_FILES` at
  `packages/proto/src/es.ts:76`.
- Transports: native gRPC on `:50051` (Nest + proto-loader) and a unary Connect HTTP edge that
  byte-proxies to it (`apps/server/src/transport/connect/`, ADR 0016). gRPC server reflection
  exists but is gated behind `GRPC_REFLECTION`, default off (B-006,
  `apps/server/src/grpc-options.ts:30`).
- No OpenAPI document, by design (`docs/research/contract-load-tooling.md`).
- `fast-check` is already a workspace dependency (`packages/domain`, `packages/crypto`, catalog).
- Disposable local lab + real registration path already exist: `packages/harness`
  (`mise run lab`, register/login/`world-ensure`, server `127.0.0.1:50058`, HTTP `:8088`).

## Survey

Each row verified against current official sources on 2026-08-26.

| Candidate                                                                                                    | Status                                                                                                                                                                                                                 | Verdict                                                                                                                                                                                                                                |
| ------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Schemathesis**                                                                                             | Docs: supported specs are OpenAPI 2.0/3.0/3.1/3.2 and GraphQL only. Issue-title search for "grpc": 0 results — no roadmap item.                                                                                        | **Incompatible.** Closes the loop with the owner: authoritative statement obtained.                                                                                                                                                    |
| **buf CLI**                                                                                                  | Full command list (`buf breaking/build/convert/curl/format/generate/lint/...`): no fuzz or contract-test surface. `buf curl` is a single-shot RPC invoker for Connect/gRPC/gRPC-Web.                                   | **No.** Already used for lint/breaking; `buf curl` is a debugging aid, not a fuzzer.                                                                                                                                                   |
| **EvoMaster** (WebFuzzing/EvoMaster)                                                                         | Active (pushed 2026-08-26), LGPL-3.0, free, "no telemetry… can be run in-house". Black-box mode for any language; REST/GraphQL/RPC (gRPC, Thrift). Docker image + GitHub Action + `pip install evomaster` since 6.0.0. | **Recommended** — the only credible off-the-shelf _intelligent_ fuzzer that supports gRPC. Caveat below.                                                                                                                               |
| **Pact protobuf plugin** (`pactflow/pact-protobuf-plugin`)                                                   | v0.8.0 (2026-05-13), v0.7.0 (2025-10-06); Rust standalone binary, MIT; embedded protoc (protox) since 0.8.0. Pact JS (v13, plugin framework) is the TS entry point.                                                    | **Runner-up.** Real, maintained gRPC contract _matching_ driven by `.proto` + declarative pacts — but interactions are hand-declared, not generated. Contract testing, not fuzzing.                                                    |
| **connectrpc/conformance**                                                                                   | Active, stable semver; Apache-2.0. YAML-defined battery over Connect/gRPC/gRPC-Web: malformed envelopes, compression, headers.                                                                                         | **Adjacent, optional.** Tests a _transport implementation_ via its ConformanceService; does not consume our 171-RPC contract, probes no auth guards. Our edge is stock connect-express + grpc-js, already conformance-tested upstream. |
| **ZAP "gRPC Support" add-on**                                                                                | Documented at zaproxy.org: "inspect, attack gRPC endpoints, decode and encode protobuf messages… still in an early stage." Wire-format-level (no `.proto`).                                                            | **No for CI.** Free OSS (Apache-2.0) but a GUI/proxy offensive scanner; schema-blind mutation, no expectation oracle, no fixture provisioning. Useful for occasional manual spot-checks.                                               |
| **Hypothesis + hypothesis-protobuf**                                                                         | Both strategy packages dead: `hchasestevens/hypothesis-protobuf` last push 2019-07; `Julian/hypothesis-protobuf` 2018-12.                                                                                              | **No.** Reviving it means hand-writing the protobuf strategies ourselves — exactly what the owner rejected — plus a Python/grpcio glue layer and a second toolchain.                                                                   |
| **libFuzzer + libprotobuf-mutator / grpc-fuzz lineage**                                                      | libprotobuf-mutator alive (2026-02) but is an in-process C++ mutation library; grpc's own fuzzers live inside grpc/grpc (C++); googleapis/grpc-fuzz does not exist (404); google/fuzztest (2026-08) is C++.            | **No.** Pointing C++ coverage-guided mutation at a TS server requires writing a C++ network harness — the harness _is_ the fuzzer.                                                                                                     |
| **Go native fuzzing / cargo-fuzz + prost**                                                                   | Both mature — as _libraries_ for fuzzing Go/Rust code in-process.                                                                                                                                                      | **No.** A network harness in Go/Rust with generated stubs and hand-written marshalling/mutation is a hand-rolled fuzzer by the owner's definition.                                                                                     |
| **CATS** (Endava/cats, active 2026-07)                                                                       | Self-described "REST API Fuzzer… for OpenAPI endpoints".                                                                                                                                                               | **No.** OpenAPI-only.                                                                                                                                                                                                                  |
| **EvoMaster-adjacent OSS fuzzers** (Restler, Dredd, WuppieFuzz, speakeasy)                                   | Restler/Dredd/WuppieFuzz are OpenAPI-driven REST tools.                                                                                                                                                                | **No.**                                                                                                                                                                                                                                |
| **Small gRPC fuzzers on GitHub** (Viasat/gRPC-Fuzzer, ChaosCabbage/proto-fuzzer, SametHaymana/grpcFuzzer, …) | Viasat: last push 2022-06, 3 stars, 4 commits; others similar or smaller.                                                                                                                                              | **No credible docs / unmaintained.** Recorded, not invented.                                                                                                                                                                           |
| **Mayhem for API (ForAllSecure/Bugcrowd)**                                                                   | Vendor page: "Mayhem API uses API fuzzing to perform automated security penetration tests of REST and gRPC APIs".                                                                                                      | **Reject per B-167 precedent** (commercial SaaS, demo-gated). gRPC support is real _in the product class_ — this is the commercial proof the capability exists.                                                                        |
| **Synopsys/Black Duck Defensics, Code Intelligence CI-Fuzz, Burp Suite**                                     | Defensics' public pages do not list a verifiable gRPC protocol suite (fetched 2026-08-26); no credible Burp gRPC-fuzzing docs found (404 on plausible doc paths); CI-Fuzz is commercial.                               | **No credible docs found / commercial reject.** Recorded for completeness.                                                                                                                                                             |

## Criteria matrix (viable candidates only)

| Criterion                                      | EvoMaster (black-box RPC)                                                                                                                                                                                                              | Pact protobuf plugin                                                                | connectrpc/conformance                                                        |
| ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| Consumes real `.proto`/descriptors             | Via the driver's generated grpc-java stubs — schema-driven, no invented surface.                                                                                                                                                       | Yes — plugin compiles the proto itself (embedded protox).                           | No — runs its own ConformanceService protos.                                  |
| Auth-guard probing (anon/invalid/valid matrix) | Engine explores; the driver performs real `Register`/`Login` to obtain tokens (same capability Schemathesis calls auth config). Exploratory, not an assertion matrix — the deterministic matrix stays in our vitest integration tests. | Yes, declaratively (interaction: no auth header → expect `UNAUTHENTICATED`).        | No.                                                                           |
| Stateful fixture provisioning                  | Driver can call the real registration path; targets the existing `mise run lab`.                                                                                                                                                       | Provider states via declared `given` callbacks (we implement them against the lab). | n/a.                                                                          |
| Runtime fit for TS monorepo                    | JVM/Docker in CI only; no product-code dependency; findings ported to vitest.                                                                                                                                                          | Standalone Rust binary + `@pact-foundation/pact` devDependency.                     | Go binary; needs a TS sidecar implementing ConformanceService.                |
| License                                        | LGPL-3.0 (tool use via Docker/pip — nothing linked into our code).                                                                                                                                                                     | MIT plugin; Pact JS MIT.                                                            | Apache-2.0.                                                                   |
| Maintenance signal                             | Commits 2026-08-26; ERC-funded research group; two independent studies rate it best-in-class for API fuzzing.                                                                                                                          | Releases 2025-08 → 2026-05; core Pact maintainer.                                   | Active; 665 commits; "stable" semver statement.                               |
| SaaS/on-prem                                   | Local only, explicitly no telemetry.                                                                                                                                                                                                   | Local only (Broker optional, not needed).                                           | Local only.                                                                   |
| Custom glue remaining                          | **A JVM driver class exposing RPCs to the engine.** Engine (generation, mutation, search, oracle) stays EvoMaster's. This is the go/no-go question — see Phase 1.                                                                      | Pact files + verifier wiring; no generation glue (nothing to fuzz).                 | ConformanceService implementation + known-failing config for streaming cases. |

## Recommendation

**Adopt EvoMaster in black-box RPC-driver mode against the local harness lab, behind a bounded
go/no-go spike.** It is the only surveyed tool that is off-the-shelf, free, non-SaaS, actively
maintained, and actually supports gRPC. Its own README states the cost plainly: _"for the moment,
we do not directly support RPC schema definitions. Fuzzing RPC APIs requires to write a driver,
using the client library of the API to make the calls."_ The driver is transport glue around
their generation/mutation/search engine — consistent with the owner's "thin wrapper" line — but
it is a JVM artifact we must generate (grpc-java stubs from our 22 protos) and maintain, so the
spike must prove it stays thin. If the spike fails that bar, the surveyed fallback is **not** a
hand-rolled fuzzer: it is (a) keep the deterministic auth-guard/negative matrix as declarative
vitest integration tests (already partially present via ADR 0016 phase A), and optionally
(b) add the Pact protobuf plugin for pinned, proto-driven contract assertions. Both are
recorded above; neither requires owner-forbidden engine code.

Runner-up: **pact-protobuf-plugin** for deterministic, proto-driven contract pinning
(including the anonymous/invalid/valid expectation matrix) — valuable when a second independent
consumer of the API exists; low marginal value in a single monorepo whose drift is already
caught by typecheck.

## Phased plan

1. **Phase 1 — spike (≤2 days, read-only).** Generate grpc-java stubs via existing buf
   toolchain (`buf.gen.yaml` already runs remote/local plugins — add a `java` output to a
   scratch profile, not the product one). Write one driver exposing 2–3 read-safe services
   (`NodeService`, `SystemService`, `FeedService.GetPost`) plus `AuthService.Register`/`Login`
   for token acquisition. Run `webfuzzing/evomaster` (pinned tag) for 10 minutes against
   `mise run lab`. **Go criteria:** driver ≤ ~300 lines excluding generated stubs; ≥1 real
   finding or credible coverage story; no artifacts leaking message bodies. **No-go:** fall back
   per above and record the evidence here.
2. **Phase 2 — nightly read-only fuzz.** Extend the driver to the read-safe allowlist
   (`GetNodeInfo`, `GetServerInfo`, public `ListLocalFeed`, `GetPost`, `GetActor`,
   `ListThread`, …). 30-minute nightly budget. Every finding is reproduced and ported into a
   vitest regression test in `apps/server`; the EvoMaster report is triage input only, never a
   checked-in test suite. Exclude `E2eeService`, `DirectMessageService`, `ModerationService`,
   media finalization, federation inbox, auth reset, and deletion (§183.1: no DM bodies in
   artifacts, ever).
3. **Phase 3 — optional guarded writes.** A separately named `--allow-writes` driver run using
   a per-run namespace `fuzz-<run-id>-*`, only after idempotency review, only against the lab
   (never H-024 previews without owner sign-off), artifacts deleted on success per
   contract-load-tooling.md's redaction rules.
4. **Phase 4 — optional complements, only if gaps appear.** connectrpc/conformance sidecar for
   transport-level edge cases; Pact plugin for a pinned auth-guard matrix.

## CI wiring sketch (repo conventions)

A new `.github/workflows/contract-fuzz.yml` (mirrors `web.yml`/`preview.yml`: own triggers, not
part of `ci.yml`'s required `ci-ok` set — a nightly fuzz must never deadlock merges):

```yaml
name: contract-fuzz
on:
  schedule: [{ cron: '0 3 * * *' }]
  workflow_dispatch:
permissions: { contents: read }
jobs:
  evomaster:
    runs-on: ubuntu-latest
    timeout-minutes: 60
    steps:
      - uses: actions/checkout@v7
      - uses: ./.github/actions/setup
      - name: Build + start local lab
        run: mise run lab # builds server/worker, postgres via compose, :50058
      - name: Run EvoMaster (read-safe allowlist, pinned image tag)
        run: infra/fuzz/run-evomaster.sh --maxTime 30m --target 127.0.0.1:50058
      - name: Upload redacted failure bundle
        if: failure()
        uses: actions/upload-artifact@v7
        with: { name: contract-fuzz-redacted, path: infra/fuzz/out/ }
```

`infra/fuzz/run-evomaster.sh` (the only new glue besides the driver): pins the EvoMaster
version, refuses any target that is not the lab's loopback origin, scrubs request/response
bodies and tokens from the report before it lands in `out/`, and exits non-zero only on
server-error-class findings. Local equivalent: `mise run fuzz:contract`. `mise run verify`
remains the authoritative gate; this workflow is advisory-until-tuned.

## Addendum: OSS-Fuzz (evaluated 2026-08-26 after owner suggestion)

**Not a fit for H-026's endpoint/auth-guard goal; a credible later complement for pure
parser/codec targets.** Verified against the official docs
(<https://google.github.io/oss-fuzz/>, <https://google.github.io/oss-fuzz/getting-started/new-project-guide/javascript-lang/>):
OSS-Fuzz's JavaScript support is **Jazzer.js** — _in-process, function-level_ fuzzing.
A fuzz target is `module.exports.fuzz = function (data: Buffer)` compiled and run inside
Google's `base-builder-javascript` Docker image under libFuzzer. Targets must be
self-contained in that image: there is no live Postgres, no running server, and no network
services, so it cannot drive the gRPC/Connect edge, exercise auth guards, or provision
members — the exact things H-026 wants. Integration is also a service relationship
(free, but the project must be open source — Patches qualifies) with Google's ClusterFuzz
infra, not something we run in our CI.

Where it **would** add real value later, as a separate task if ever wanted: Jazzer.js's
coverage-guided mutation against our pure, dependency-free parsers/codecs —
`@patches/markup` (the renderer input parser), `packages/domain/src/page.ts`
(`parsePageLenient`/`parsePageForRender` over untrusted JSON), protobuf-es `decode` error
paths on wire-format garbage, and `packages/crypto` deserialization corners. Those are
exactly the self-contained `fuzz(data)` shapes Jazzer.js is built for, and they deepen the
existing vitest property tests with coverage feedback. The deterministic vitest
auth-guard matrix stays the source of truth for endpoint security either way.

## What this does not cover

- **The Connect HTTP edge itself.** EvoMaster speaks native gRPC (grpc-java). The unary Connect
  edge keeps its existing cross-transport parity tests (ADR 0016 phase A); protocol-level edge
  cases are Phase 4's optional conformance sidecar. The Connect JSON codec stays untested by any
  fuzzer surveyed here.
- **White-box/coverage-guided fuzzing.** White-box mode is JVM-only; a TS server gets
  black-box heuristics (HTTP-500-class oracles, no code-coverage feedback).
- **Load/performance** — H-027's separate plan.
- **DM/E2EE content, moderation, media finalization, federation delivery, auth reset** —
  excluded by default-deny, unchanged from the prior note's rules.
- **A deterministic auth-guard assertion suite** — EvoMaster explores; it does not assert our
  expected-code matrix. That matrix belongs in vitest regardless of this adoption.

## Owner resolution (2026-08-26, final — supersedes the draft below)

**Fuzzing is the priority; wire the best off-the-shelf engine now.** Owner's reasoning: tests
we write and assert ourselves "of course match" — the value is catching what we're blind to.
EvoMaster (this survey's winner) gets wired per the phased plan below, with two scope upgrades
over the earlier draft: (1) **writes are in scope from day one** — member creation included —
because the target is a disposable ephemeral lab, not a shared environment; the default-deny
stance is retired for lab targets and retained only as a hard refusal of production/unknown
hosts; (2) the Connect HTTP edge is a valid secondary target (verify which codecs it accepts —
Connect JSON would open plain-HTTP fuzzing of every RPC). The deterministic vitest auth-guard
matrix is demoted to aspirational follow-up; the JVM-in-nightly-CI question is answered yes.
Do not default to OSS-Fuzz/Jazzer.js for this (in-process, can't drive endpoints).

## Proposed replacement wording for tasks.md H-026 (draft — do not apply from this note)

> - [ ] H-026 — Off-the-shelf contract fuzzing via EvoMaster (black-box gRPC RPC-driver mode)
>       against the disposable local harness lab only: first run a bounded read-only driver spike
>       (grpc-java stubs from the existing buf toolchain, read-safe allowlist, real
>       Register/Login for tokens) to confirm the driver stays thin transport glue around the
>       off-the-shelf engine rather than a hand-rolled fuzzer; if the spike passes, wire a nightly
>       scheduled workflow (not in `ci-ok`) with pinned versions, 30-minute budget, redacted
>       failure-only artifacts containing no message bodies or tokens, DM/E2EE/moderation/media/
>       federation/auth-reset excluded, per-run fixture namespaces for any later write runs, and
>       hard refusal of production or unknown targets; port every finding into a vitest regression
>       test. If the spike fails, record the evidence and fall back to the declarative vitest
>       negative/auth matrix (+ optional pact-protobuf-plugin pinning) — not a hand-rolled fuzzer
>       (owner direction 2026-08-26; Schemathesis verified OpenAPI/GraphQL-only same date). See
>       docs/research/contract-fuzz-tooling.md.

## Sources (all fetched 2026-08-26)

- Schemathesis supported specifications and issue search:
  <https://schemathesis.readthedocs.io/en/stable/>, `api.github.com/search/issues?q=repo:schemathesis/schemathesis+grpc+in:title` (0 results).
- Buf CLI command reference: <https://buf.build/docs/reference/cli/buf/> and `buf curl` usage <https://buf.build/docs/curl/usage/>.
- EvoMaster README (key features, limitations incl. the RPC-driver quote, license, install, Docker, GitHub Action, in-house/no-telemetry): <https://github.com/WebFuzzing/EvoMaster>; repo metadata (pushed 2026-08-26, LGPL-3.0) via GitHub API.
- Pact protobuf plugin: <https://github.com/pactflow/pact-protobuf-plugin> (repo + releases v0.6.5→v0.8.0 via API); Pact JS README incl. plugins doc link: <https://github.com/pact-foundation/pact-js>.
- Connect conformance suite: <https://github.com/connectrpc/conformance>.
- ZAP gRPC Support add-on: <https://www.zaproxy.org/docs/desktop/addons/grpc-support/>.
- hypothesis-protobuf: <https://github.com/hchasestevens/hypothesis-protobuf> (pushed 2019-07-03), <https://github.com/Julian/hypothesis-protobuf> (pushed 2018-12-15), via GitHub API.
- libprotobuf-mutator <https://github.com/google/libprotobuf-mutator> (pushed 2026-02-10); google/fuzztest <https://github.com/google/fuzztest>; googleapis/grpc-fuzz (404).
- CATS: <https://github.com/Endava/cats> ("REST API Fuzzer… for OpenAPI endpoints").
- Mayhem for API: <https://www.forallsecure.com/mayhem-for-api> ("automated security penetration tests of REST and gRPC APIs"); Defensics pages: <https://www.blackduck.com/fuzz-testing.html> (no verifiable gRPC suite listing).
- npm registry searches (no TS protobuf-arbitrary or gRPC-fuzz package exists; version currency for `fast-check` 4.9.0 2026-07-08, `@bufbuild/protobuf` 2.14.0 2026-08-13, `@grpc/grpc-js` 1.14.4 2026-05-20): `registry.npmjs.org/-/v1/search?text=protobuf+fast-check`, `…text=grpc+fuzz`, `…text=protobuf+arbitrary`.
- Repo facts: ADR 0016; `apps/server/src/grpc-options.ts`; `packages/proto/src/es.ts`; `packages/harness/src/cli.ts`; `tasks.md` H-026/B-167; `.github/workflows/ci.yml` (triggers, `ci-ok`, actionpin conventions).
