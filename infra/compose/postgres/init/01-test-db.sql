-- Creates the isolated database(s) used by integration tests (never point tests at the
-- dev DB). `patches_test` is shared by the `database` and `testkit` vitest projects
-- (see docs/operations/ci.md "Why one database" / tasks.md A-006 for why that's safe
-- only with `--no-file-parallelism`). `patches_test_server` is `server-integration`'s
-- own database (apps/server/vitest.integration.config.mts), unused until Phase 1 lands
-- DB-backed server tests. `patches_test_testkit` is provisioned for a future per-project
-- split but not yet wired up — packages/testkit's own vitest config would need to read
-- a dedicated env var, which is out of scope here (see tasks.md A-006 follow-up).
CREATE DATABASE patches_test OWNER patches;
CREATE DATABASE patches_test_server OWNER patches;
CREATE DATABASE patches_test_testkit OWNER patches;
