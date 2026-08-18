---
name: nestjs-config-forroot-frozen-once-per-process
description: "@nestjs/config's ConfigModule.forRoot({validate}) runs validate(process.env) exactly once per process, not once per NestFactory.create() call — breaks running two differently-configured AppModule instances in one process"
metadata:
  type: feedback
---

`ConfigModule.forRoot({validate, cache})` is called as a plain JS function inside a
`@Module({imports: [...]})` decorator argument (e.g. `apps/server/src/config/config.module.ts`).
Decorator arguments evaluate **once**, the first time that module file is imported by Node/Vite
— not once per `NestFactory.create()` call. `@nestjs/config@4.0.4`'s `ConfigModule.forRoot()`
calls `validate(process.env)` **synchronously inside that one-time call** and freezes the
result into a closure baked into the returned `DynamicModule`'s providers. Every environment
variable with a zod `.default(...)` in the schema gets permanently frozen to whatever it
resolved to at that first import — later `process.env` writes are silently ignored for those
keys, because `ConfigService.get()` checks the frozen `validatedEnv` snapshot _before_ falling
through to live `process.env` (only keys with **no default**, like an `.optional()` `DATABASE_URL`,
correctly reach the live-`process.env` fallback).

**Why:** Discovered building the P8-008 two-node federation integration test
(`apps/server/test/support/federation-node.ts`): booting two `NestFactory.create(AppModule)`
instances in one test-file process with different `PUBLIC_ORIGIN`/`FEDERATION_ENABLED`/
`INVITE_ONLY`/`DATABASE_URL` per node silently gave both nodes the _first_ node's values for
every defaulted key (and, once a vitest `setupFiles` script had already set `DATABASE_URL`
once for the whole file, _both_ nodes shared that frozen `DATABASE_URL` too — the two nodes'
databases got cross-contaminated). `ConfigService.set(key, value)` (mutates `internalConfig`,
which _is_ checked before the frozen snapshot) only helps for values read **after** the app
already exists — anything read eagerly during `NestFactory.create()` (a `useFactory` provider,
e.g. `TypeOrmModule.forRootAsync`'s DB connection, or a naive `provide: TOKEN, useFactory: config
=> config.flag ? real : noop`) is too late to fix that way.

**How to apply:** Never assume two `NestFactory.create(SameAppModule)` calls in one process are
independently configured for anything with a schema default. Two fixes, pick per situation: (1)
for a provider whose _choice_ depends on a defaulted config flag, make the choice **lazy** —
dispatch on `config.flag` inside every method call, not once in a `useFactory` (see
`LazyFederationGateway` in `apps/server/src/modules/federation/federation.module.ts`); (2) for
anything that must be correct from the very first line of a fresh process (a DB connection, in
practice everything `NestFactory.create()` reads eagerly), run the second "node" as a genuine
child process instead (see `apps/server/test/support/federation-node.ts`, which spawns the
built `dist/main.js` with its own `env`) — a real process has its own untouched `process.env`
from the start and sidesteps this class of bug entirely. When in doubt, prefer the child-process
approach for any test that boots more than one differently-configured instance of the same
`AppModule` in one run.
