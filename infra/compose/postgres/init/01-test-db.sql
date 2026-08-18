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
-- `patches_test_fed_b` is the second node's database for the P8-008 two-node federation
-- integration test (`apps/server/test/federation-two-node.integration.test.ts`) — node A
-- uses `patches_test_server` like every other server-integration test, node B needs its own
-- so the two in-process nodes never share rows.
-- `patches_lab_a`/`patches_lab_b` are the manual two-node federation lab's databases
-- (B-029, `infra/lab/fed-lab.sh`, `mise run fed:lab`) — same "one database per node" reasoning
-- as `patches_test_fed_b` above, just for the long-running manual lab instead of a vitest run.
-- Only created here for a fresh compose volume; `fed-lab.sh` also creates them idempotently
-- itself (`CREATE DATABASE ... OWNER patches` if missing) so the lab works against an
-- already-initialized volume too.
CREATE DATABASE patches_test OWNER patches;
CREATE DATABASE patches_test_server OWNER patches;
CREATE DATABASE patches_test_worker OWNER patches;
CREATE DATABASE patches_test_admin OWNER patches;
CREATE DATABASE patches_testkit_test OWNER patches;
CREATE DATABASE patches_test_fed_b OWNER patches;
CREATE DATABASE patches_lab_a OWNER patches;
CREATE DATABASE patches_lab_b OWNER patches;
