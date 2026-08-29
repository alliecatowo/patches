/**
 * Wire type seam (ADR 0023 slice 3, flipped in slice 7/P10-013).
 *
 * The single place `apps/tui/src` names generated protobuf **types**. Every consumer
 * imports message/request/response types from here instead of from `@patches/proto/es`
 * directly, so a future dissolution of this seam (ADR 0023's "Consequences") is a
 * one-file edit instead of a ~100-file edit.
 *
 * Message/request/response *names* are identical between the ts-proto and protobuf-es
 * families (both generated from the same `.proto` sources) — only the shapes behind
 * those names differ (`$typeName`, optional-vs-required fields, enum/timestamp
 * representation). `Timestamp` comes from `@bufbuild/protobuf/wkt` rather than
 * `@patches/proto/es`, which never re-exports it (only imports it as a field type).
 *
 * The ~130 message types that are an RPC's outer *request* parameter (matching
 * `api/client.ts`'s `buildMethods` table 1:1) are exported through `WireInit<T>`
 * below rather than as the raw decoded type: a decoded protobuf-es `Message<T>`
 * requires `$typeName` on itself and every nested message field, which every one of
 * ~15 call sites across `auth/`, `cli/` and `app/` that build a request as a plain
 * object literal (`{ refreshToken }`, `{ communityId }`, …) does not set — exactly the
 * shape `@connectrpc/connect`'s own generated clients already accept
 * (`MessageInitShape`, normally derived from a message's *schema*; `WireInit<T>`
 * mirrors the same relaxation directly from the decoded *type*, since this seam names
 * types, not schemas). Every other export here (response/domain data actually decoded
 * off the wire — `Actor`, `Post`, `FollowRequest`, …) stays the strict decoded type,
 * since fixtures and render props genuinely carry `$typeName` at runtime.
 *
 * The ts-proto family's grpc-js client/controller types (`*GrpcClient`,
 * `*ServiceClient`, `*ServiceController`, `GrpcUnaryCall`) have no protobuf-es
 * equivalent and are not part of this seam — `client.ts` no longer needs them now that
 * it is built on `@patches/client`'s `Client<DescService>` instead of hand-rolled
 * grpc-js clients.
 *
 * Enum *values* and timestamp helpers are not part of this seam — see `wire/enums.ts`
 * and `wire/time.ts`.
 */

import type * as Proto from '@patches/proto/es';
export type { Timestamp } from '@bufbuild/protobuf/wkt';

/**
 * The lenient "init" shape of a decoded protobuf-es message `T`: every field optional,
 * `$typeName`/`$unknown` dropped, nested message fields recursively lenient too — a
 * union with `T` itself so an already-decoded value (e.g. a fixture from
 * `test/wire-fixtures.ts`) is still accepted. Faithfully mirrors
 * `@bufbuild/protobuf`'s own `MessageInit<T>`/`FieldInit<F>` (private to that
 * package, not exported, verified by reading `dist/commonjs/types.d.ts`), applied
 * directly to a decoded type instead of a schema.
 */
type WireInit<T> = T extends { readonly $typeName: string }
  ? T | { [P in keyof T as P extends '$typeName' | '$unknown' ? never : P]?: WireInitField<T[P]> }
  : T;
type WireInitField<F> = F extends Date | Uint8Array | bigint | boolean | string | number
  ? F
  : F extends ReadonlyArray<infer U>
    ? // Mutable, matching `@bufbuild/protobuf`'s own `FieldInit<F>` exactly — a `readonly`
      // array here would reject the common `mediaIds: string[]` build-then-send pattern.
      WireInitField<U>[]
    : F extends { readonly $typeName: string }
      ? WireInit<F>
      : F;

export type AcceptFollowRequestRequest = WireInit<Proto.AcceptFollowRequestRequest>;
export type AcceptFollowRequestResponse = Proto.AcceptFollowRequestResponse;
export type AccountDeletionStatus = Proto.AccountDeletionStatus;
export type AccountExport = Proto.AccountExport;
export type AccountExportStatus = Proto.AccountExportStatus;
export type AcknowledgeEnvelopesRequest = Proto.AcknowledgeEnvelopesRequest;
export type AcknowledgeEnvelopesResponse = Proto.AcknowledgeEnvelopesResponse;
export type AcknowledgePrivacyNoticeRequest = WireInit<Proto.AcknowledgePrivacyNoticeRequest>;
export type AcknowledgePrivacyNoticeResponse = Proto.AcknowledgePrivacyNoticeResponse;
export type Actor = Proto.Actor;
export type ActorCounts = Proto.ActorCounts;
export type ActorFlair = Proto.ActorFlair;
export type AddCredentialRequest = WireInit<Proto.AddCredentialRequest>;
export type AddCredentialResponse = Proto.AddCredentialResponse;
export type AddE2eeMemberRequest = Proto.AddE2eeMemberRequest;
export type AddE2eeMemberResponse = Proto.AddE2eeMemberResponse;
export type Appeal = Proto.Appeal;
export type ApplyLabelRequest = WireInit<Proto.ApplyLabelRequest>;
export type ApplyLabelResponse = Proto.ApplyLabelResponse;
export type AttachReportEvidenceRequest = Proto.AttachReportEvidenceRequest;
export type AttachReportEvidenceResponse = Proto.AttachReportEvidenceResponse;
export type BanFromCommunityRequest = WireInit<Proto.BanFromCommunityRequest>;
export type BanFromCommunityResponse = Proto.BanFromCommunityResponse;
export type BeginGitHubLoginRequest = Proto.BeginGitHubLoginRequest;
export type BeginGitHubLoginResponse = Proto.BeginGitHubLoginResponse;
export type BeginMediaUploadRequest = WireInit<Proto.BeginMediaUploadRequest>;
export type BeginMediaUploadResponse = Proto.BeginMediaUploadResponse;
export type BeginOidcLoginRequest = Proto.BeginOidcLoginRequest;
export type BeginOidcLoginResponse = Proto.BeginOidcLoginResponse;
export type BeginPasskeyLoginRequest = Proto.BeginPasskeyLoginRequest;
export type BeginPasskeyLoginResponse = Proto.BeginPasskeyLoginResponse;
export type BeginPasskeyRegistrationRequest = Proto.BeginPasskeyRegistrationRequest;
export type BeginPasskeyRegistrationResponse = Proto.BeginPasskeyRegistrationResponse;
export type BeginSshEnrollmentRequest = WireInit<Proto.BeginSshEnrollmentRequest>;
export type BeginSshEnrollmentResponse = Proto.BeginSshEnrollmentResponse;
export type BeginSshLoginRequest = WireInit<Proto.BeginSshLoginRequest>;
export type BeginSshLoginResponse = Proto.BeginSshLoginResponse;
export type BlockActorRequest = WireInit<Proto.BlockActorRequest>;
export type BlockActorResponse = Proto.BlockActorResponse;
export type BookmarkPostRequest = WireInit<Proto.BookmarkPostRequest>;
export type BookmarkPostResponse = Proto.BookmarkPostResponse;
export type CancelAccountDeletionRequest = WireInit<Proto.CancelAccountDeletionRequest>;
export type CancelAccountDeletionResponse = Proto.CancelAccountDeletionResponse;
export type ClaimPrekeyBundlesRequest = Proto.ClaimPrekeyBundlesRequest;
export type ClaimPrekeyBundlesResponse = Proto.ClaimPrekeyBundlesResponse;
export type Community = Proto.Community;
export type CommunityCounts = Proto.CommunityCounts;
export type CommunityInvite = Proto.CommunityInvite;
export type CommunityInviteStatus = Proto.CommunityInviteStatus;
export type CommunityMember = Proto.CommunityMember;
export type CommunityRole = Proto.CommunityRole;
export type CompletePasskeyLoginRequest = Proto.CompletePasskeyLoginRequest;
export type CompletePasskeyLoginResponse = Proto.CompletePasskeyLoginResponse;
export type CompletePasskeyRegistrationRequest = Proto.CompletePasskeyRegistrationRequest;
export type CompletePasskeyRegistrationResponse = Proto.CompletePasskeyRegistrationResponse;
export type CompleteSshLoginRequest = WireInit<Proto.CompleteSshLoginRequest>;
export type CompleteSshLoginResponse = Proto.CompleteSshLoginResponse;
export type Conversation = Proto.Conversation;
export type ConversationKind = Proto.ConversationKind;
export type ConversationMember = Proto.ConversationMember;
export type ConversationSecurityMode = Proto.ConversationSecurityMode;
export type CreateAppealRequest = WireInit<Proto.CreateAppealRequest>;
export type CreateAppealResponse = Proto.CreateAppealResponse;
export type CreateCommunityRequest = WireInit<Proto.CreateCommunityRequest>;
export type CreateCommunityResponse = Proto.CreateCommunityResponse;
export type CreateE2eeConversationRequest = Proto.CreateE2eeConversationRequest;
export type CreateE2eeConversationResponse = Proto.CreateE2eeConversationResponse;
export type CreateFilterRequest = WireInit<Proto.CreateFilterRequest>;
export type CreateFilterResponse = Proto.CreateFilterResponse;
export type CreateLabelerRequest = WireInit<Proto.CreateLabelerRequest>;
export type CreateLabelerResponse = Proto.CreateLabelerResponse;
export type CreatePostRequest = WireInit<Proto.CreatePostRequest>;
export type CreatePostResponse = Proto.CreatePostResponse;
export type Credential = Proto.Credential;
export type CredentialType = Proto.CredentialType;
export type DeleteFilterListRequest = WireInit<Proto.DeleteFilterListRequest>;
export type DeleteFilterListResponse = Proto.DeleteFilterListResponse;
export type DeleteFilterRequest = WireInit<Proto.DeleteFilterRequest>;
export type DeleteFilterResponse = Proto.DeleteFilterResponse;
export type DeletePostRequest = WireInit<Proto.DeletePostRequest>;
export type DeletePostResponse = Proto.DeletePostResponse;
export type DomainPolicyAction = Proto.DomainPolicyAction;
export type DomainPolicyEntry = Proto.DomainPolicyEntry;
export type E2eeCapability = Proto.E2eeCapability;
export type E2eeCapabilityState = Proto.E2eeCapabilityState;
export type E2eeConversationMemberState = Proto.E2eeConversationMemberState;
export type E2eeDeviceCertificate = Proto.E2eeDeviceCertificate;
export type E2eeDeviceEnvelope = Proto.E2eeDeviceEnvelope;
export type E2eeDeviceRoster = Proto.E2eeDeviceRoster;
export type E2eeDeviceStatus = Proto.E2eeDeviceStatus;
export type E2eeEvidenceVerificationStatus = Proto.E2eeEvidenceVerificationStatus;
export type E2eeFrankingTag = Proto.E2eeFrankingTag;
export type E2eeGroupControlEvent = Proto.E2eeGroupControlEvent;
export type E2eeIdentityRoot = Proto.E2eeIdentityRoot;
export type E2eeLogicalMessage = Proto.E2eeLogicalMessage;
export type E2eeMailboxEnvelope = Proto.E2eeMailboxEnvelope;
export type E2eeOneTimePrekey = Proto.E2eeOneTimePrekey;
export type E2eePrekeyBundle = Proto.E2eePrekeyBundle;
export type E2eeReportEvidenceItem = Proto.E2eeReportEvidenceItem;
export type E2eeRosterEntry = Proto.E2eeRosterEntry;
export type E2eeSignedPrekey = Proto.E2eeSignedPrekey;
export type EditPostRequest = WireInit<Proto.EditPostRequest>;
export type EditPostResponse = Proto.EditPostResponse;
export type EnrollDeviceRequest = Proto.EnrollDeviceRequest;
export type EnrollDeviceResponse = Proto.EnrollDeviceResponse;
export type ExportAccountRequest = WireInit<Proto.ExportAccountRequest>;
export type ExportAccountResponse = Proto.ExportAccountResponse;
export type ExportFiltersRequest = Proto.ExportFiltersRequest;
export type ExportFiltersResponse = Proto.ExportFiltersResponse;
export type FeatureFlag = Proto.FeatureFlag;
export type FeatureFlagKind = Proto.FeatureFlagKind;
export type FederationStance = Proto.FederationStance;
export type Filter = Proto.Filter;
export type FilterAction = Proto.FilterAction;
export type FilterList = Proto.FilterList;
export type FilterListEntry = Proto.FilterListEntry;
export type FilterListSubscription = Proto.FilterListSubscription;
export type FilterScope = Proto.FilterScope;
export type FilterTerm = Proto.FilterTerm;
// Write-only: appears only nested inside CreateFilterRequest/UpdateFilterRequest, never in
// a response — always hand-built by a caller, so it gets the same WireInit treatment as a
// top-level RPC request (ADR 0023).
export type FilterTermInput = WireInit<Proto.FilterTermInput>;
export type FilterTermKind = Proto.FilterTermKind;
export type FilteredByHint = Proto.FilteredByHint;
export type FilteredByProvenance = Proto.FilteredByProvenance;
export type FinalizeMediaUploadRequest = WireInit<Proto.FinalizeMediaUploadRequest>;
export type FinalizeMediaUploadResponse = Proto.FinalizeMediaUploadResponse;
export type FollowActorRequest = WireInit<Proto.FollowActorRequest>;
export type FollowActorResponse = Proto.FollowActorResponse;
export type FollowRequest = Proto.FollowRequest;
export type FollowState = Proto.FollowState;
export type GenerateRecoveryCodesRequest = Proto.GenerateRecoveryCodesRequest;
export type GenerateRecoveryCodesResponse = Proto.GenerateRecoveryCodesResponse;
export type GetActorByHandleRequest = WireInit<Proto.GetActorByHandleRequest>;
export type GetActorByHandleResponse = Proto.GetActorByHandleResponse;
export type GetActorRequest = WireInit<Proto.GetActorRequest>;
export type GetActorResponse = Proto.GetActorResponse;
export type GetAppealRequest = WireInit<Proto.GetAppealRequest>;
export type GetAppealResponse = Proto.GetAppealResponse;
export type GetAuthPolicyRequest = Proto.GetAuthPolicyRequest;
export type GetAuthPolicyResponse = Proto.GetAuthPolicyResponse;
export type GetCommunityRequest = WireInit<Proto.GetCommunityRequest>;
export type GetCommunityResponse = Proto.GetCommunityResponse;
export type GetConversationRequest = WireInit<Proto.GetConversationRequest>;
export type GetConversationResponse = Proto.GetConversationResponse;
export type GetCurrentSessionRequest = Proto.GetCurrentSessionRequest;
export type GetCurrentSessionResponse = Proto.GetCurrentSessionResponse;
export type GetDeletionStatusRequest = WireInit<Proto.GetDeletionStatusRequest>;
export type GetDeletionStatusResponse = Proto.GetDeletionStatusResponse;
export type GetDeviceRosterRequest = Proto.GetDeviceRosterRequest;
export type GetDeviceRosterResponse = Proto.GetDeviceRosterResponse;
export type GetE2eeCapabilityRequest = Proto.GetE2eeCapabilityRequest;
export type GetE2eeCapabilityResponse = Proto.GetE2eeCapabilityResponse;
export type GetE2eeConversationStateRequest = Proto.GetE2eeConversationStateRequest;
export type GetE2eeConversationStateResponse = Proto.GetE2eeConversationStateResponse;
export type GetExportStatusRequest = WireInit<Proto.GetExportStatusRequest>;
export type GetExportStatusResponse = Proto.GetExportStatusResponse;
export type GetFilterListRequest = WireInit<Proto.GetFilterListRequest>;
export type GetFilterListResponse = Proto.GetFilterListResponse;
export type GetIdentityRootRequest = Proto.GetIdentityRootRequest;
export type GetIdentityRootResponse = Proto.GetIdentityRootResponse;
export type GetLabelerRequest = WireInit<Proto.GetLabelerRequest>;
export type GetLabelerResponse = Proto.GetLabelerResponse;
export type GetMediaDownloadRequest = WireInit<Proto.GetMediaDownloadRequest>;
export type GetMediaDownloadResponse = Proto.GetMediaDownloadResponse;
export type GetNodeInfoRequest = Proto.GetNodeInfoRequest;
export type GetNodeInfoResponse = Proto.GetNodeInfoResponse;
export type GetNodePolicyRequest = Proto.GetNodePolicyRequest;
export type GetNodePolicyResponse = Proto.GetNodePolicyResponse;
export type GetPageRequest = WireInit<Proto.GetPageRequest>;
export type GetPageResponse = Proto.GetPageResponse;
export type GetPostRequest = WireInit<Proto.GetPostRequest>;
export type GetPostResponse = Proto.GetPostResponse;
export type GetPrekeyInventoryRequest = Proto.GetPrekeyInventoryRequest;
export type GetPrekeyInventoryResponse = Proto.GetPrekeyInventoryResponse;
export type GetPrivacyPrefsRequest = WireInit<Proto.GetPrivacyPrefsRequest>;
export type GetPrivacyPrefsResponse = Proto.GetPrivacyPrefsResponse;
export type GetRelationshipRequest = WireInit<Proto.GetRelationshipRequest>;
export type GetRelationshipResponse = Proto.GetRelationshipResponse;
export type GetServerInfoRequest = Proto.GetServerInfoRequest;
export type GetServerInfoResponse = Proto.GetServerInfoResponse;
export type GetUnreadCountRequest = WireInit<Proto.GetUnreadCountRequest>;
export type GetUnreadCountResponse = Proto.GetUnreadCountResponse;
export type GitHubLoginStatus = Proto.GitHubLoginStatus;
export type GuestbookEntry = Proto.GuestbookEntry;
export type ImportFiltersRequest = WireInit<Proto.ImportFiltersRequest>;
export type ImportFiltersResponse = Proto.ImportFiltersResponse;
export type InviteToCommunityRequest = WireInit<Proto.InviteToCommunityRequest>;
export type InviteToCommunityResponse = Proto.InviteToCommunityResponse;
export type JoinCommunityRequest = WireInit<Proto.JoinCommunityRequest>;
export type JoinCommunityResponse = Proto.JoinCommunityResponse;
export type Label = Proto.Label;
export type LabelAction = Proto.LabelAction;
export type LabelVocabularyEntry = Proto.LabelVocabularyEntry;
export type Labeler = Proto.Labeler;
export type LeaveCommunityRequest = WireInit<Proto.LeaveCommunityRequest>;
export type LeaveCommunityResponse = Proto.LeaveCommunityResponse;
export type LeaveConversationRequest = WireInit<Proto.LeaveConversationRequest>;
export type LeaveConversationResponse = Proto.LeaveConversationResponse;
export type LikePostRequest = WireInit<Proto.LikePostRequest>;
export type LikePostResponse = Proto.LikePostResponse;
export type ListActorPostsRequest = WireInit<Proto.ListActorPostsRequest>;
export type ListActorPostsResponse = Proto.ListActorPostsResponse;
export type ListBlocksRequest = WireInit<Proto.ListBlocksRequest>;
export type ListBlocksResponse = Proto.ListBlocksResponse;
export type ListBookmarksRequest = WireInit<Proto.ListBookmarksRequest>;
export type ListBookmarksResponse = Proto.ListBookmarksResponse;
export type ListCommunitiesRequest = WireInit<Proto.ListCommunitiesRequest>;
export type ListCommunitiesResponse = Proto.ListCommunitiesResponse;
export type ListCommunityFeedRequest = WireInit<Proto.ListCommunityFeedRequest>;
export type ListCommunityFeedResponse = Proto.ListCommunityFeedResponse;
export type ListCommunityMembersRequest = WireInit<Proto.ListCommunityMembersRequest>;
export type ListCommunityMembersResponse = Proto.ListCommunityMembersResponse;
export type ListConversationsRequest = WireInit<Proto.ListConversationsRequest>;
export type ListConversationsResponse = Proto.ListConversationsResponse;
export type ListCredentialsRequest = Proto.ListCredentialsRequest;
export type ListCredentialsResponse = Proto.ListCredentialsResponse;
export type ListDeviceRostersRequest = Proto.ListDeviceRostersRequest;
export type ListDeviceRostersResponse = Proto.ListDeviceRostersResponse;
export type ListFilterListEntriesRequest = WireInit<Proto.ListFilterListEntriesRequest>;
export type ListFilterListEntriesResponse = Proto.ListFilterListEntriesResponse;
export type ListFilterListSubscriptionsRequest = WireInit<Proto.ListFilterListSubscriptionsRequest>;
export type ListFilterListSubscriptionsResponse = Proto.ListFilterListSubscriptionsResponse;
export type ListFilterListsRequest = WireInit<Proto.ListFilterListsRequest>;
export type ListFilterListsResponse = Proto.ListFilterListsResponse;
export type ListFiltersRequest = WireInit<Proto.ListFiltersRequest>;
export type ListFiltersResponse = Proto.ListFiltersResponse;
export type ListFollowRequestsRequest = WireInit<Proto.ListFollowRequestsRequest>;
export type ListFollowRequestsResponse = Proto.ListFollowRequestsResponse;
export type ListFollowersRequest = Proto.ListFollowersRequest;
export type ListFollowersResponse = Proto.ListFollowersResponse;
export type ListFollowingRequest = Proto.ListFollowingRequest;
export type ListFollowingResponse = Proto.ListFollowingResponse;
export type ListE2eeGroupControlEventsRequest = Proto.ListE2eeGroupControlEventsRequest;
export type ListE2eeGroupControlEventsResponse = Proto.ListE2eeGroupControlEventsResponse;
export type ListGuestbookRequest = WireInit<Proto.ListGuestbookRequest>;
export type ListGuestbookResponse = Proto.ListGuestbookResponse;
export type ListHomeFeedRequest = WireInit<Proto.ListHomeFeedRequest>;
export type ListHomeFeedResponse = Proto.ListHomeFeedResponse;
export type ListLabelersRequest = WireInit<Proto.ListLabelersRequest>;
export type ListLabelersResponse = Proto.ListLabelersResponse;
export type ListLabelsOnSubjectRequest = WireInit<Proto.ListLabelsOnSubjectRequest>;
export type ListLabelsOnSubjectResponse = Proto.ListLabelsOnSubjectResponse;
export type ListLocalFeedRequest = WireInit<Proto.ListLocalFeedRequest>;
export type ListLocalFeedResponse = Proto.ListLocalFeedResponse;
export type ListMailboxEnvelopesRequest = Proto.ListMailboxEnvelopesRequest;
export type ListMailboxEnvelopesResponse = Proto.ListMailboxEnvelopesResponse;
export type ListModerationLogRequest = WireInit<Proto.ListModerationLogRequest>;
export type ListModerationLogResponse = Proto.ListModerationLogResponse;
export type ListMutedTagsRequest = WireInit<Proto.ListMutedTagsRequest>;
export type ListMutedTagsResponse = Proto.ListMutedTagsResponse;
export type ListMutesRequest = WireInit<Proto.ListMutesRequest>;
export type ListMutesResponse = Proto.ListMutesResponse;
export type ListMutualFollowsRequest = WireInit<Proto.ListMutualFollowsRequest>;
export type ListMutualFollowsResponse = Proto.ListMutualFollowsResponse;
export type ListMyAppealsRequest = WireInit<Proto.ListMyAppealsRequest>;
export type ListMyAppealsResponse = Proto.ListMyAppealsResponse;
export type ListMyModerationNoticesRequest = WireInit<Proto.ListMyModerationNoticesRequest>;
export type ListMyModerationNoticesResponse = Proto.ListMyModerationNoticesResponse;
export type ListNotificationsRequest = WireInit<Proto.ListNotificationsRequest>;
export type ListNotificationsResponse = Proto.ListNotificationsResponse;
export type ListPageRevisionsRequest = WireInit<Proto.ListPageRevisionsRequest>;
export type ListPageRevisionsResponse = Proto.ListPageRevisionsResponse;
export type ListPostEditsRequest = WireInit<Proto.ListPostEditsRequest>;
export type ListPostEditsResponse = Proto.ListPostEditsResponse;
export type ListPostLikersRequest = WireInit<Proto.ListPostLikersRequest>;
export type ListPostLikersResponse = Proto.ListPostLikersResponse;
export type ListPostRepostersRequest = Proto.ListPostRepostersRequest;
export type ListPostRepostersResponse = Proto.ListPostRepostersResponse;
export type ListRepliesRequest = WireInit<Proto.ListRepliesRequest>;
export type ListRepliesResponse = Proto.ListRepliesResponse;
export type ListTagFeedRequest = WireInit<Proto.ListTagFeedRequest>;
export type ListTagFeedResponse = Proto.ListTagFeedResponse;
export type LoginRequest = WireInit<Proto.LoginRequest>;
export type LoginResponse = Proto.LoginResponse;
export type LogoutAllSessionsRequest = Proto.LogoutAllSessionsRequest;
export type LogoutAllSessionsResponse = Proto.LogoutAllSessionsResponse;
export type LogoutRequest = WireInit<Proto.LogoutRequest>;
export type LogoutResponse = Proto.LogoutResponse;
export type MarkConversationReadRequest = WireInit<Proto.MarkConversationReadRequest>;
export type MarkConversationReadResponse = Proto.MarkConversationReadResponse;
export type MarkNotificationsReadRequest = WireInit<Proto.MarkNotificationsReadRequest>;
export type MarkNotificationsReadResponse = Proto.MarkNotificationsReadResponse;
export type MediaAttachment = Proto.MediaAttachment;
export type MediaRef = Proto.MediaRef;
export type MediaStatus = Proto.MediaStatus;
export type ModerationActionType = Proto.ModerationActionType;
export type ModerationLogEntry = Proto.ModerationLogEntry;
export type ModerationLogSubjectKind = Proto.ModerationLogSubjectKind;
export type ModerationNotice = Proto.ModerationNotice;
export type ModerationReasonCategory = Proto.ModerationReasonCategory;
export type MuteActorRequest = WireInit<Proto.MuteActorRequest>;
export type MuteActorResponse = Proto.MuteActorResponse;
export type MuteTagRequest = WireInit<Proto.MuteTagRequest>;
export type MuteTagResponse = Proto.MuteTagResponse;
export type Nameplate = Proto.Nameplate;
export type NodeLimits = Proto.NodeLimits;
export type NodePolicy = Proto.NodePolicy;
export type Notification = Proto.Notification;
export type NotificationType = Proto.NotificationType;
export type OidcLoginStatus = Proto.OidcLoginStatus;
export type OidcProviderInfo = Proto.OidcProviderInfo;
export type PageInfo = Proto.PageInfo;
export type PageRevisionSummary = Proto.PageRevisionSummary;
export type PageTheme = Proto.PageTheme;
export type PasswordAuthMode = Proto.PasswordAuthMode;
export type PinPostRequest = WireInit<Proto.PinPostRequest>;
export type PinPostResponse = Proto.PinPostResponse;
export type PingRequest = Proto.PingRequest;
export type PingResponse = Proto.PingResponse;
export type PollGitHubLoginRequest = Proto.PollGitHubLoginRequest;
export type PollGitHubLoginResponse = Proto.PollGitHubLoginResponse;
export type PollOidcLoginRequest = Proto.PollOidcLoginRequest;
export type PollOidcLoginResponse = Proto.PollOidcLoginResponse;
export type Post = Proto.Post;
export type PostCounts = Proto.PostCounts;
export type PostEdit = Proto.PostEdit;
export type PostType = Proto.PostType;
export type PostViewerState = Proto.PostViewerState;
export type PostVisibility = Proto.PostVisibility;
export type PrivacyPrefs = Proto.PrivacyPrefs;
export type PublishDeviceRosterRequest = Proto.PublishDeviceRosterRequest;
export type PublishDeviceRosterResponse = Proto.PublishDeviceRosterResponse;
export type PublishFilterListRequest = WireInit<Proto.PublishFilterListRequest>;
export type PublishFilterListResponse = Proto.PublishFilterListResponse;
export type PublishIdentityRootRequest = Proto.PublishIdentityRootRequest;
export type PublishIdentityRootResponse = Proto.PublishIdentityRootResponse;
export type QuotePolicy = Proto.QuotePolicy;
export type RecoveryLoginRequest = WireInit<Proto.RecoveryLoginRequest>;
export type RecoveryLoginResponse = Proto.RecoveryLoginResponse;
export type RefreshSessionRequest = WireInit<Proto.RefreshSessionRequest>;
export type RefreshSessionResponse = Proto.RefreshSessionResponse;
export type RegisterRequest = WireInit<Proto.RegisterRequest>;
export type RegisterResponse = Proto.RegisterResponse;
export type RegistrationMode = Proto.RegistrationMode;
export type RejectFollowRequestRequest = WireInit<Proto.RejectFollowRequestRequest>;
export type RejectFollowRequestResponse = Proto.RejectFollowRequestResponse;
export type Relationship = Proto.Relationship;
export type RemoveGuestbookEntryRequest = WireInit<Proto.RemoveGuestbookEntryRequest>;
export type RemoveGuestbookEntryResponse = Proto.RemoveGuestbookEntryResponse;
export type RemovePostFromCommunityRequest = WireInit<Proto.RemovePostFromCommunityRequest>;
export type RemovePostFromCommunityResponse = Proto.RemovePostFromCommunityResponse;
export type ReportActorRequest = WireInit<Proto.ReportActorRequest>;
export type ReportActorResponse = Proto.ReportActorResponse;
export type ReportGuestbookEntryRequest = WireInit<Proto.ReportGuestbookEntryRequest>;
export type ReportGuestbookEntryResponse = Proto.ReportGuestbookEntryResponse;
export type ReportPostRequest = WireInit<Proto.ReportPostRequest>;
export type ReportPostResponse = Proto.ReportPostResponse;
export type ReportReason = Proto.ReportReason;
export type RepostPostRequest = WireInit<Proto.RepostPostRequest>;
export type RepostPostResponse = Proto.RepostPostResponse;
export type RequestAccountDeletionRequest = WireInit<Proto.RequestAccountDeletionRequest>;
export type RequestAccountDeletionResponse = Proto.RequestAccountDeletionResponse;
export type RequestPasswordResetRequest = Proto.RequestPasswordResetRequest;
export type RequestPasswordResetResponse = Proto.RequestPasswordResetResponse;
export type ResendVerificationRequest = Proto.ResendVerificationRequest;
export type ResendVerificationResponse = Proto.ResendVerificationResponse;
export type ResetPasswordRequest = Proto.ResetPasswordRequest;
export type ResetPasswordResponse = Proto.ResetPasswordResponse;
export type ResolveActorRequest = WireInit<Proto.ResolveActorRequest>;
export type ResolveActorResponse = Proto.ResolveActorResponse;
export type RespondToCommunityInviteRequest = WireInit<Proto.RespondToCommunityInviteRequest>;
export type RespondToCommunityInviteResponse = Proto.RespondToCommunityInviteResponse;
export type RetentionWindows = Proto.RetentionWindows;
export type RetractLabelRequest = WireInit<Proto.RetractLabelRequest>;
export type RetractLabelResponse = Proto.RetractLabelResponse;
export type RevokeCredentialRequest = WireInit<Proto.RevokeCredentialRequest>;
export type RevokeCredentialResponse = Proto.RevokeCredentialResponse;
export type RevokeDeviceRequest = Proto.RevokeDeviceRequest;
export type RevokeDeviceResponse = Proto.RevokeDeviceResponse;
export type RemoveE2eeMemberRequest = Proto.RemoveE2eeMemberRequest;
export type RemoveE2eeMemberResponse = Proto.RemoveE2eeMemberResponse;
export type SearchActorsRequest = WireInit<Proto.SearchActorsRequest>;
export type SearchActorsResponse = Proto.SearchActorsResponse;
export type SearchPostsRequest = WireInit<Proto.SearchPostsRequest>;
export type SearchPostsResponse = Proto.SearchPostsResponse;
export type SearchTagsRequest = WireInit<Proto.SearchTagsRequest>;
export type SearchTagsResponse = Proto.SearchTagsResponse;
export type SendEnvelopesRequest = Proto.SendEnvelopesRequest;
export type SendEnvelopesResponse = Proto.SendEnvelopesResponse;
export type Session = Proto.Session;
export type SetCommunityRoleRequest = WireInit<Proto.SetCommunityRoleRequest>;
export type SetCommunityRoleResponse = Proto.SetCommunityRoleResponse;
export type SetFilterListEntryExceptionRequest = WireInit<Proto.SetFilterListEntryExceptionRequest>;
export type SetFilterListEntryExceptionResponse = Proto.SetFilterListEntryExceptionResponse;
export type SetLabelerSubscriptionActionRequest =
  WireInit<Proto.SetLabelerSubscriptionActionRequest>;
export type SetLabelerSubscriptionActionResponse = Proto.SetLabelerSubscriptionActionResponse;
export type SignGuestbookRequest = WireInit<Proto.SignGuestbookRequest>;
export type SignGuestbookResponse = Proto.SignGuestbookResponse;
export type SocialCapabilities = Proto.SocialCapabilities;
export type SshEnrollmentProof = Proto.SshEnrollmentProof;
export type SubscribeFilterListRequest = WireInit<Proto.SubscribeFilterListRequest>;
export type SubscribeFilterListResponse = Proto.SubscribeFilterListResponse;
export type SubscribeLabelerRequest = WireInit<Proto.SubscribeLabelerRequest>;
export type SubscribeLabelerResponse = Proto.SubscribeLabelerResponse;
export type Tag = Proto.Tag;
export type UnblockActorRequest = WireInit<Proto.UnblockActorRequest>;
export type UnblockActorResponse = Proto.UnblockActorResponse;
export type UnbookmarkPostRequest = WireInit<Proto.UnbookmarkPostRequest>;
export type UnbookmarkPostResponse = Proto.UnbookmarkPostResponse;
export type UnfollowActorRequest = WireInit<Proto.UnfollowActorRequest>;
export type UnfollowActorResponse = Proto.UnfollowActorResponse;
export type UnlikePostRequest = WireInit<Proto.UnlikePostRequest>;
export type UnlikePostResponse = Proto.UnlikePostResponse;
export type UnmuteActorRequest = WireInit<Proto.UnmuteActorRequest>;
export type UnmuteActorResponse = Proto.UnmuteActorResponse;
export type UnmuteTagRequest = WireInit<Proto.UnmuteTagRequest>;
export type UnmuteTagResponse = Proto.UnmuteTagResponse;
export type UnpinPostRequest = WireInit<Proto.UnpinPostRequest>;
export type UnpinPostResponse = Proto.UnpinPostResponse;
export type UnrepostPostRequest = WireInit<Proto.UnrepostPostRequest>;
export type UnrepostPostResponse = Proto.UnrepostPostResponse;
export type UnsubscribeFilterListRequest = WireInit<Proto.UnsubscribeFilterListRequest>;
export type UnsubscribeFilterListResponse = Proto.UnsubscribeFilterListResponse;
export type UnsubscribeLabelerRequest = WireInit<Proto.UnsubscribeLabelerRequest>;
export type UnsubscribeLabelerResponse = Proto.UnsubscribeLabelerResponse;
export type UpdateCommunityRequest = WireInit<Proto.UpdateCommunityRequest>;
export type UpdateCommunityResponse = Proto.UpdateCommunityResponse;
export type UpdateFilterListRequest = WireInit<Proto.UpdateFilterListRequest>;
export type UpdateFilterListResponse = Proto.UpdateFilterListResponse;
export type UpdateFilterRequest = WireInit<Proto.UpdateFilterRequest>;
export type UpdateFilterResponse = Proto.UpdateFilterResponse;
export type UpdatePageRequest = WireInit<Proto.UpdatePageRequest>;
export type UpdatePageResponse = Proto.UpdatePageResponse;
export type UpdatePrivacyPrefsRequest = WireInit<Proto.UpdatePrivacyPrefsRequest>;
export type UpdatePrivacyPrefsResponse = Proto.UpdatePrivacyPrefsResponse;
export type UpdateProfileRequest = WireInit<Proto.UpdateProfileRequest>;
export type UpdateProfileResponse = Proto.UpdateProfileResponse;
export type UploadPrekeysRequest = Proto.UploadPrekeysRequest;
export type UploadPrekeysResponse = Proto.UploadPrekeysResponse;
export type VerifyEmailRequest = WireInit<Proto.VerifyEmailRequest>;
export type VerifyEmailResponse = Proto.VerifyEmailResponse;
