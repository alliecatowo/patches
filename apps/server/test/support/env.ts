import { exportPKCS8, exportSPKI, generateKeyPair } from 'jose';

import { assertServerTestDatabaseUrl } from './database.js';

/**
 * Prepares the environment `AppModule` validates at boot.
 *
 * **Must run before anything imports `src/config/config.module.js`.** `ConfigModule.forRoot()`
 * validates `process.env` *when it is called* — which is at module-evaluation time, not at
 * module-instantiation time — and a validated value with a schema default wins over a later
 * `process.env` write. That is why this lives in its own module with no Nest imports and is
 * wired as a Vitest `setupFiles` entry: setup files are evaluated before the test file's
 * import graph.
 *
 * `DATABASE_URL` is **overwritten**, never defaulted: whatever a developer's shell or `.env`
 * points it at, an integration test must talk to the test database and nothing else
 * (INITIAL_VISION.md §119). Signing keys are generated per run, so the suite needs no secrets
 * and no two runs share a key.
 */
export async function prepareServerEnv(): Promise<void> {
  const testDatabaseUrl = process.env.TEST_DATABASE_URL;
  if (testDatabaseUrl !== undefined && testDatabaseUrl.length > 0) {
    assertServerTestDatabaseUrl(testDatabaseUrl);
    process.env.DATABASE_URL = testDatabaseUrl;
  }

  process.env.NODE_DOMAIN ??= TEST_NODE_DOMAIN;
  // The reference node's alpha policy (§33), and the behaviour the suite asserts.
  process.env.INVITE_ONLY ??= 'true';
  // Exercise the capability-gated Phase 11 community creation surface in integration tests.
  // Production retains the schema default (`false`) unless an operator opts in.
  process.env.CAN_CREATE_COMMUNITY ??= 'true';
  process.env.AUTH_CODE_DELIVERY_KEYS ??= JSON.stringify({
    test: Buffer.alloc(32, 7).toString('base64'),
  });
  process.env.AUTH_CODE_DELIVERY_ACTIVE_KEY_ID ??= 'test';
  // A-052 (spec §197.6): exercise the operator-configured `NodePolicy` fields end-to-end —
  // `system.integration.test.ts`'s `GetNodePolicy` suite asserts these render verbatim.
  // Production leaves all four at the schema default (`''`) unless an operator sets them.
  process.env.PRIVACY_NOTICE_SUMMARY ??=
    'This node stores your posts and direct messages; DMs are readable by this node’s operators.';
  process.env.TERMS_URL ??= 'https://patches.test/terms';
  process.env.APPEAL_INSTRUCTIONS ??= 'Email appeals@patches.test with your handle and notice ID.';
  process.env.OPERATOR_CONTACT ??= 'Operated by the Patches test node maintainers.';

  if (process.env.JWT_PRIVATE_KEY === undefined || process.env.JWT_PRIVATE_KEY.length === 0) {
    const { publicKey, privateKey } = await generateKeyPair('EdDSA', {
      crv: 'Ed25519',
      extractable: true,
    });
    process.env.JWT_PRIVATE_KEY = Buffer.from(await exportPKCS8(privateKey)).toString('base64');
    process.env.JWT_PUBLIC_KEY = Buffer.from(await exportSPKI(publicKey)).toString('base64');
  }
}

/** The canonical node domain the integration suite runs under (§163). */
export const TEST_NODE_DOMAIN = 'patches.test';
