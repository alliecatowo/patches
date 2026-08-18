/**
 * Fixture factories (`INITIAL_VISION.md` §118). All of them take the caller's
 * `EntityManager` so fixtures participate in the test's transaction — see
 * `withTransactionRollback`.
 */
export {
  createTestActor,
  createTestCredential,
  createTestInvite,
  createTestUser,
} from './identity.js';
export type {
  CreateTestActorOptions,
  CreateTestCredentialOptions,
  CreateTestInviteOptions,
  CreateTestUserOptions,
} from './identity.js';

export { createTestPost } from './content.js';
export type { CreateTestPostOptions } from './content.js';

export { createTestBlock, createTestFollow, createTestMute } from './social-graph.js';
export type {
  CreateTestBlockOptions,
  CreateTestFollowOptions,
  CreateTestMuteOptions,
} from './social-graph.js';
