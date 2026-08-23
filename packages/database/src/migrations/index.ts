import { CreateAppMeta1755400000000 } from './1755400000000-CreateAppMeta.js';
import { Phase1Schema1787036506325 } from './1787036506325-Phase1Schema.js';
import { Phase3SocialGraph1787055340075 } from './1787055340075-Phase3SocialGraph.js';
import { Phase4Interactions1787058326261 } from './1787058326261-Phase4Interactions.js';
import { ActorRegistrationIdempotency1787059787165 } from './1787059787165-ActorRegistrationIdempotency.js';
import { Phase6Admin1787062075716 } from './1787062075716-Phase6Admin.js';
import { Phase45Pages1787062912872 } from './1787062912872-Phase45Pages.js';
import { Phase8Federation1787076396680 } from './1787076396680-Phase8Federation.js';
import { Phase9Hardening1787082699518 } from './1787082699518-Phase9Hardening.js';
import { Phase11SocialDepth1787103400432 } from './1787103400432-Phase11SocialDepth.js';
import { Phase11ReactionNotifyTypes1787104500000 } from './1787104500000-Phase11ReactionNotifyTypes.js';
import { Phase11DirectMessagesModeration1787104600000 } from './1787104600000-Phase11DirectMessagesModeration.js';
import { Phase11CommunityIdempotency1787104700000 } from './1787104700000-Phase11CommunityIdempotency.js';
import { Phase12PostSearch1787104800000 } from './1787104800000-Phase12PostSearch.js';
import { Phase13E2ee1787134230745 } from './1787134230745-Phase13E2ee.js';
import { Phase14PrivacyAndFilters1787135113517 } from './1787135113517-Phase14PrivacyAndFilters.js';
import { Phase14FilterLists1787135204977 } from './1787135204977-Phase14FilterLists.js';
import { Phase14Labelers1787135294583 } from './1787135294583-Phase14Labelers.js';
import { Phase14ModerationAppeals1787135453592 } from './1787135453592-Phase14ModerationAppeals.js';
import { Phase14AccountLifecycle1787135493158 } from './1787135493158-Phase14AccountLifecycle.js';
import { Phase14FollowRequests1787153689257 } from './1787153689257-Phase14FollowRequests.js';
import { FilterListSubscriptionScopes1787159166765 } from './1787159166765-FilterListSubscriptionScopes.js';
import { AdminAuditLabelerSubjectType1787159300000 } from './1787159300000-AdminAuditLabelerSubjectType.js';
import { Phase15AuthPolicy1787170000000 } from './1787170000000-Phase15AuthPolicy.js';
import { Phase15Passkeys1787180000000 } from './1787180000000-Phase15Passkeys.js';
import { AddOidcCredentialType1787220000000 } from './1787220000000-AddOidcCredentialType.js';
import { Phase13NodeFrankingKeys1787235748738 } from './1787235748738-Phase13NodeFrankingKeys.js';
import { AuthCodeDeliveryEnvelopes1787420562003 } from './1787420562003-AuthCodeDeliveryEnvelopes.js';
import { AddE2eeGroupControlEvents1787448705727 } from './1787448705727-AddE2eeGroupControlEvents.js';

/**
 * Every migration, imported explicitly and listed in chronological order — not globbed.
 *
 * TypeORM's usual `migrations: [__dirname + "/migrations/*{.ts,.js}"]` glob works
 * differently from `src` (running `.ts` under the CLI's TS loader) vs `dist` (running
 * built `.js`), which is exactly the kind of environment-dependent behavior that's easy to
 * get subtly wrong (e.g. picking up stale/duplicate migrations, or missing a `.cjs`
 * extension). An explicit array sidesteps that entirely: this file itself is compiled
 * import-for-import by tsup into both `dist/migrations/index.js` (ESM) and
 * `dist/migrations/index.cjs` (CJS), so the array is correct in every context without any
 * runtime path/glob detection.
 */
export const ALL_MIGRATIONS = [
  CreateAppMeta1755400000000,
  Phase1Schema1787036506325,
  Phase3SocialGraph1787055340075,
  Phase4Interactions1787058326261,
  ActorRegistrationIdempotency1787059787165,
  Phase6Admin1787062075716,
  Phase45Pages1787062912872,
  Phase8Federation1787076396680,
  Phase9Hardening1787082699518,
  Phase11SocialDepth1787103400432,
  Phase11ReactionNotifyTypes1787104500000,
  Phase11DirectMessagesModeration1787104600000,
  Phase11CommunityIdempotency1787104700000,
  Phase12PostSearch1787104800000,
  Phase13E2ee1787134230745,
  Phase14PrivacyAndFilters1787135113517,
  Phase14FilterLists1787135204977,
  Phase14Labelers1787135294583,
  Phase14ModerationAppeals1787135453592,
  Phase14AccountLifecycle1787135493158,
  Phase14FollowRequests1787153689257,
  FilterListSubscriptionScopes1787159166765,
  AdminAuditLabelerSubjectType1787159300000,
  Phase15AuthPolicy1787170000000,
  Phase15Passkeys1787180000000,
  AddOidcCredentialType1787220000000,
  Phase13NodeFrankingKeys1787235748738,
  AuthCodeDeliveryEnvelopes1787420562003,
  AddE2eeGroupControlEvents1787448705727,
];
