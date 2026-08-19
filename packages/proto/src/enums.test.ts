import { describe, expect, it } from 'vitest';

import { AppealStatus } from './generated/patches/v1/appeals.js';
import { CredentialType, GitHubLoginStatus } from './generated/patches/v1/auth.js';
import { CommunityInviteStatus, CommunityRole } from './generated/patches/v1/communities.js';
import { FilterAction, FilterScope, FilterTermKind } from './generated/patches/v1/filters.js';
import { LabelAction } from './generated/patches/v1/labels.js';
import { MediaStatus } from './generated/patches/v1/media.js';
import { ConversationKind, MessageRequestStatus } from './generated/patches/v1/messages.js';
import {
  ModerationActionType,
  ModerationLogSubjectKind,
  ModerationReasonCategory,
  ReportReason,
} from './generated/patches/v1/moderation.js';
import {
  DomainPolicyAction,
  FederationStance,
  RegistrationMode,
} from './generated/patches/v1/node.js';
import { NotificationType } from './generated/patches/v1/notifications.js';
import {
  FilteredByProvenance,
  PostType,
  PostVisibility,
  QuotePolicy,
} from './generated/patches/v1/posts.js';
import { AccountExportStatus } from './generated/patches/v1/privacy.js';
import { FollowState } from './generated/patches/v1/social_graph.js';
import {
  ACCOUNT_EXPORT_STATUS,
  APPEAL_STATUS,
  COMMUNITY_INVITE_STATUS,
  COMMUNITY_ROLE,
  CONVERSATION_KIND,
  CREDENTIAL_TYPE,
  DOMAIN_POLICY_ACTION,
  FEDERATION_STANCE,
  FILTER_ACTION,
  FILTER_SCOPE,
  FILTER_TERM_KIND,
  FILTERED_BY_PROVENANCE,
  FOLLOW_STATE,
  GITHUB_LOGIN_STATUS,
  LABEL_ACTION,
  MEDIA_STATUS,
  MESSAGE_REQUEST_STATUS,
  MODERATION_ACTION_TYPE,
  MODERATION_LOG_SUBJECT_KIND,
  MODERATION_REASON_CATEGORY,
  NOTIFICATION_TYPE,
  POST_TYPE,
  POST_VISIBILITY,
  QUOTE_POLICY,
  REGISTRATION_MODE,
  REPORT_REASON,
} from './enums.js';

/**
 * `enums.ts` hand-mirrors these enum values so `index.ts` can export them as plain runtime
 * values without importing `@nestjs/microservices` (see the comment in `enums.ts`). This
 * test is what makes that safe: any `.proto` enum change that isn't reflected in the mirror
 * fails here instead of silently drifting.
 */
function generatedValues(enumObject: Record<string, string>): string[] {
  return Object.values(enumObject)
    .filter((value) => value !== 'UNRECOGNIZED')
    .sort();
}

describe('hand-mirrored enums stay in sync with the generated proto enums', () => {
  it('POST_TYPE matches PostType', () => {
    expect(Object.values(POST_TYPE).sort()).toEqual(generatedValues(PostType));
  });

  it('POST_VISIBILITY matches PostVisibility', () => {
    expect(Object.values(POST_VISIBILITY).sort()).toEqual(generatedValues(PostVisibility));
  });

  it('CREDENTIAL_TYPE matches CredentialType', () => {
    expect(Object.values(CREDENTIAL_TYPE).sort()).toEqual(generatedValues(CredentialType));
  });

  it('GITHUB_LOGIN_STATUS matches GitHubLoginStatus', () => {
    expect(Object.values(GITHUB_LOGIN_STATUS).sort()).toEqual(generatedValues(GitHubLoginStatus));
  });

  it('FOLLOW_STATE matches FollowState', () => {
    expect(Object.values(FOLLOW_STATE).sort()).toEqual(generatedValues(FollowState));
  });

  it('REGISTRATION_MODE matches RegistrationMode', () => {
    expect(Object.values(REGISTRATION_MODE).sort()).toEqual(generatedValues(RegistrationMode));
  });

  it('NOTIFICATION_TYPE matches NotificationType', () => {
    expect(Object.values(NOTIFICATION_TYPE).sort()).toEqual(generatedValues(NotificationType));
  });

  it('REPORT_REASON matches ReportReason', () => {
    expect(Object.values(REPORT_REASON).sort()).toEqual(generatedValues(ReportReason));
  });

  it('MEDIA_STATUS matches MediaStatus', () => {
    expect(Object.values(MEDIA_STATUS).sort()).toEqual(generatedValues(MediaStatus));
  });

  it('QUOTE_POLICY matches QuotePolicy', () => {
    expect(Object.values(QUOTE_POLICY).sort()).toEqual(generatedValues(QuotePolicy));
  });

  it('COMMUNITY_ROLE matches CommunityRole', () => {
    expect(Object.values(COMMUNITY_ROLE).sort()).toEqual(generatedValues(CommunityRole));
  });

  it('COMMUNITY_INVITE_STATUS matches CommunityInviteStatus', () => {
    expect(Object.values(COMMUNITY_INVITE_STATUS).sort()).toEqual(
      generatedValues(CommunityInviteStatus),
    );
  });

  it('CONVERSATION_KIND matches ConversationKind', () => {
    expect(Object.values(CONVERSATION_KIND).sort()).toEqual(generatedValues(ConversationKind));
  });

  it('MESSAGE_REQUEST_STATUS matches MessageRequestStatus', () => {
    expect(Object.values(MESSAGE_REQUEST_STATUS).sort()).toEqual(
      generatedValues(MessageRequestStatus),
    );
  });

  it('FILTER_TERM_KIND matches FilterTermKind', () => {
    expect(Object.values(FILTER_TERM_KIND).sort()).toEqual(generatedValues(FilterTermKind));
  });

  it('FILTER_SCOPE matches FilterScope', () => {
    expect(Object.values(FILTER_SCOPE).sort()).toEqual(generatedValues(FilterScope));
  });

  it('FILTER_ACTION matches FilterAction', () => {
    expect(Object.values(FILTER_ACTION).sort()).toEqual(generatedValues(FilterAction));
  });

  it('LABEL_ACTION matches LabelAction', () => {
    expect(Object.values(LABEL_ACTION).sort()).toEqual(generatedValues(LabelAction));
  });

  it('APPEAL_STATUS matches AppealStatus', () => {
    expect(Object.values(APPEAL_STATUS).sort()).toEqual(generatedValues(AppealStatus));
  });

  it('ACCOUNT_EXPORT_STATUS matches AccountExportStatus', () => {
    expect(Object.values(ACCOUNT_EXPORT_STATUS).sort()).toEqual(
      generatedValues(AccountExportStatus),
    );
  });

  it('FEDERATION_STANCE matches FederationStance', () => {
    expect(Object.values(FEDERATION_STANCE).sort()).toEqual(generatedValues(FederationStance));
  });

  it('DOMAIN_POLICY_ACTION matches DomainPolicyAction', () => {
    expect(Object.values(DOMAIN_POLICY_ACTION).sort()).toEqual(generatedValues(DomainPolicyAction));
  });

  it('MODERATION_REASON_CATEGORY matches ModerationReasonCategory', () => {
    expect(Object.values(MODERATION_REASON_CATEGORY).sort()).toEqual(
      generatedValues(ModerationReasonCategory),
    );
  });

  it('MODERATION_ACTION_TYPE matches ModerationActionType', () => {
    expect(Object.values(MODERATION_ACTION_TYPE).sort()).toEqual(
      generatedValues(ModerationActionType),
    );
  });

  it('MODERATION_LOG_SUBJECT_KIND matches ModerationLogSubjectKind', () => {
    expect(Object.values(MODERATION_LOG_SUBJECT_KIND).sort()).toEqual(
      generatedValues(ModerationLogSubjectKind),
    );
  });

  it('FILTERED_BY_PROVENANCE matches FilteredByProvenance', () => {
    expect(Object.values(FILTERED_BY_PROVENANCE).sort()).toEqual(
      generatedValues(FilteredByProvenance),
    );
  });
});
