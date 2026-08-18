# 0009. Pin TypeScript 5.9.x instead of TypeScript 7

**Status:** Accepted
**Date:** 2026-08-17

## Context

The spec calls for "modern TypeScript" with strict mode, no implicit `any`, and current
compiler checks (`INITIAL_VISION.md` §7). As of this decision, the latest package published
as `typescript` on npm is TypeScript 7 — the native Go-ported compiler — not TypeScript 6.
However, the project's other mandated tooling is not yet validated against it:

- `typescript-eslint` 8.x, which the project needs for linting, declares a peer dependency
  on `typescript <6.1` — it does not yet officially support the 7.x line.
- NestJS's decorator-heavy programming model depends on `emitDecoratorMetadata` and related
  decorator/reflection behavior. That tooling chain has not yet been validated against the
  TypeScript 7 native compiler at the time of this decision.

Shipping on an unsupported/unvalidated compiler version would risk silent linting gaps or
subtle decorator-metadata miscompilation in exactly the framework (NestJS) this project
depends on most heavily.

## Decision

Pin the repository to **TypeScript 5.9.x**, not TypeScript 7, across all packages and apps.
Use `mise`/`package.json` `engines`/lockfile pinning to keep this deterministic rather than
floating to `latest`. Revisit this decision once `typescript-eslint` officially supports the
TypeScript 7.x peer range and NestJS's decorator/`emitDecoratorMetadata` tooling has been
validated against the native TypeScript 7 compiler.

## Consequences

- Linting and decorator metadata behave predictably, because every tool in the chain
  (`typescript-eslint`, NestJS's reflection-based DI, `ts-proto` codegen) is exercised
  against a TypeScript version they actually support today.
- The project temporarily forgoes TypeScript 7's native-compiler performance
  improvements — acceptable at current codebase size, where compile time is not yet a
  bottleneck.
- This decision has an explicit expiration condition (not a permanent stance): once
  `typescript-eslint` and NestJS's decorator tooling are validated on 7.x, this ADR should
  be superseded rather than silently ignored.
- Generated protobuf code (`ts-proto` output) is exempted from the strictest compiler flags
  only where necessary (`INITIAL_VISION.md` §7), independent of this version pin.

## Alternatives considered

- **Adopt TypeScript 7 immediately for the performance win.** Rejected: `typescript-eslint`
  8.x's peer dependency range (`typescript <6.1`) would either force an unsupported
  configuration or block linting entirely, and NestJS decorator/metadata behavior on the
  native compiler is unvalidated — too much unknown risk for a young codebase that hasn't
  even reached v0.
- **Pin to TypeScript 6.x as a middle ground.** Not applicable: at the time of this
  decision, npm's `typescript` package skipped from the 5.x line directly to 7 (no
  general-availability 6.x line was the relevant intermediate target), so the real choice
  was 5.9.x (last fully-supported pre-native line) versus 7 (unsupported by current
  tooling).
- **Wait entirely and block on tooling catch-up before any TypeScript work.** Rejected:
  unnecessary — 5.9.x is a fully capable, strict-mode-supporting release; there's no reason
  to delay implementation for a compiler swap that isn't blocking anything today.
