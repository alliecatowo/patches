-- Creates the isolated database(s) used by integration tests (never point tests at the
-- dev DB). `patches_test` is used by the `database` vitest project (see
-- docs/operations/ci.md "Why one database" / tasks.md A-006). `patches_test_server` is
-- `server-integration`'s own database (apps/server/vitest.integration.config.mts).
-- `patches_test_worker` is `worker-integration`'s own database
-- (apps/worker/vitest.integration.config.mts), same reasoning. `patches_test_admin` is
-- `admin-integration`'s own database (apps/admin/vitest.integration.config.mts), same
-- reasoning again. `patches_testkit_test` is `testkit`'s own database
-- (packages/testkit/vitest.config.ts, B-012) — named with the `_test` *suffix* rather than
-- `patches_test_testkit`'s infix because `createTestDataSource()`'s own guard (what this
-- project's suite actually tests) requires the database name to end in `_test`
-- (INITIAL_VISION.md §119); see the doc comment in packages/testkit/vitest.config.ts.
CREATE DATABASE patches_test OWNER patches;
CREATE DATABASE patches_test_server OWNER patches;
CREATE DATABASE patches_test_worker OWNER patches;
CREATE DATABASE patches_test_admin OWNER patches;
CREATE DATABASE patches_testkit_test OWNER patches;
