---
name: nestjs-config-frozen-env-toggle-testing
description: how to test a REQUIRE_X-style boot-time env flag's two states given ConfigModule.forRoot's once-per-process freeze
metadata:
  type: feedback
---

When a feature is gated by a new boolean env var read through `AppConfigService`
(`@nestjs/config`'s `ConfigModule.forRoot({ validate })`), don't try to test "both states" by
toggling `process.env` and starting a second `startTestServer()` in the same integration test
file — see [[nestjs-config-forroot-frozen-once-per-process]]: `validate(process.env)` runs once
per process at `config.module.js`'s first import, and even vitest's per-file module isolation
doesn't save you if the toggle happens _after_ any import that transitively pulls in
`app.module.js` (ESM import hoisting evaluates all static imports before your file's own
top-level code runs, so setting `process.env.X` textually "before" an import in the same file
still runs after that import's module graph is evaluated).

**What worked instead**: write a plain unit test for the guard/service class itself
(`new RequirePrivacyAckGuard(fakeConfig, fakeDataSource)`), passing `{ requirePrivacyAck: true }`
vs `{ requirePrivacyAck: false }` as a cast `AppConfigService` object — exactly the pattern
`messages.service.test.ts` already uses for `dmEnabled`. This tests both states directly and
cheaply. Then let the existing integration suite (which never sets the new var, so it exercises
the default-off state for real, end-to-end) stand in for the "off" integration coverage; don't
try to also integration-test the "on" state unless the task specifically needs a full-boot
proof — a dedicated `vitest.integration.config.mts` project (like `apps/admin`'s
`admin-integration`) would be the only reliable way to get a truly separate module registry for
that, and is overkill for one flag.

**Why**: chasing the "both states via startTestServer" approach costs a lot of debugging time
for a false negative (the second server silently inherits the first's config) before you
realize the class-level unit test was available and cheaper the whole time.
