---
name: nest-guards-metadata-reflection-test
description: how to unit-test that @UseGuards(SomeGuard) is actually attached to a specific controller method, without booting Nest
metadata:
  type: feedback
---

To assert a specific `@UseGuards(X)` decorator is wired onto a given controller method (not
just that the guard class behaves correctly in isolation), read the metadata Nest itself
reads at request time rather than booting a full Nest app or grpc test server:

```ts
import { GUARDS_METADATA } from '@nestjs/common/constants'; // deep import; no exports map blocks it
// ...
const guards =
  (Reflect.getMetadata(GUARDS_METADATA, SomeController.prototype.someMethod) as unknown[]) ?? [];
expect(guards).toContain(SomeGuard);
```

Two gotchas that make this "just work" rather than crash:

- `@nestjs/common`'s own `index.js` does `require("reflect-metadata")` at import time, so any
  test file that already imports something from `@nestjs/common` (e.g. `type ExecutionContext`)
  has the global `Reflect.getMetadata`/`defineMetadata` polyfill available — no separate
  `import 'reflect-metadata'` needed in the test file itself.
- Method-level `@UseGuards()` metadata lives on the method function itself
  (`Controller.prototype.method`), not on the class or prototype object — matches
  `@nestjs/core`'s own `GuardsContextCreator`, which reads it the same way at request time.

Used this to verify `RequirePrivacyAckGuard` was actually attached to
`GraphController.followActor`/`CommunityController.createCommunity`/`joinCommunity` (and
absent from sibling read methods) in
`apps/server/src/common/guards/require-privacy-ack.guard.test.ts`, instead of a slower
integration test — matches [[nestjs-config-frozen-env-toggle-testing]]'s guidance to unit-test
guard wiring/config-gated behavior rather than toggling env across `startTestServer()` calls.

**Why:** importing the controller classes into the guard's own unit test file is cheap (no DB,
no gRPC server) and catches "guard exists but nobody attached it to the new site" — the exact
failure mode a brief asking to "attach guard X to sites A/B/C" needs covered, which a test of
the guard's `canActivate()` logic alone does not catch.

**How to apply:** whenever a task's acceptance criteria is "attach guard/interceptor Y to RPC
Z" rather than "guard Y behaves correctly," add a metadata-reflection assertion alongside the
guard's own logic tests — cheaper and more precise than an integration test asserting the
gRPC status code, and it survives even if `REQUIRE_PRIVACY_ACK`-style config later changes the
guard's no-op default.
