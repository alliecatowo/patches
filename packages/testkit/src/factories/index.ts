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

export {
  createTestBookmark,
  createTestLike,
  createTestNotification,
  createTestReport,
} from './interactions.js';
export type {
  CreateTestBookmarkOptions,
  CreateTestLikeOptions,
  CreateTestNotificationOptions,
  CreateTestReportOptions,
} from './interactions.js';

export {
  createTestGuestbookEntry,
  createTestPage,
  createTestPageRevision,
  testPageDocument,
} from './pages.js';
export type {
  CreateTestGuestbookEntryOptions,
  CreateTestPageOptions,
  CreateTestPageRevisionOptions,
} from './pages.js';

export {
  createTestActorFlair,
  createTestCommunity,
  createTestCommunityBan,
  createTestCommunityInvite,
  createTestCommunityMember,
  createTestConversation,
  createTestConversationMember,
  createTestPinnedPost,
  createTestPostEdit,
  createTestPostTag,
  createTestRepost,
  createTestTag,
  createTestTagMute,
} from './social-depth.js';
export type {
  CreateTestActorFlairOptions,
  CreateTestCommunityBanOptions,
  CreateTestCommunityInviteOptions,
  CreateTestCommunityMemberOptions,
  CreateTestCommunityOptions,
  CreateTestConversationMemberOptions,
  CreateTestConversationOptions,
  CreateTestPinnedPostOptions,
  CreateTestPostEditOptions,
  CreateTestPostTagOptions,
  CreateTestRepostOptions,
  CreateTestTagMuteOptions,
  CreateTestTagOptions,
} from './social-depth.js';
