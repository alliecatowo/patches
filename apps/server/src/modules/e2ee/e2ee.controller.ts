import { type Metadata } from '@grpc/grpc-js';
import { Controller, UseGuards } from '@nestjs/common';
import { Ctx, Payload } from '@nestjs/microservices';
import {
  E2eeServiceControllerMethods,
  type AcknowledgeEnvelopesRequest,
  type AcknowledgeEnvelopesResponse,
  type AddE2eeMemberRequest,
  type AddE2eeMemberResponse,
  type AttachReportEvidenceRequest,
  type AttachReportEvidenceResponse,
  type ClaimPrekeyBundlesRequest,
  type ClaimPrekeyBundlesResponse,
  type CreateE2eeConversationRequest,
  type CreateE2eeConversationResponse,
  type E2eeServiceController,
  type EnrollDeviceRequest,
  type EnrollDeviceResponse,
  type GetDeviceRosterRequest,
  type GetDeviceRosterResponse,
  type GetE2eeCapabilityRequest,
  type GetE2eeCapabilityResponse,
  type GetE2eeConversationStateRequest,
  type GetE2eeConversationStateResponse,
  type GetIdentityRootRequest,
  type GetIdentityRootResponse,
  type GetPrekeyInventoryRequest,
  type GetPrekeyInventoryResponse,
  type ListDeviceRostersRequest,
  type ListDeviceRostersResponse,
  type ListE2eeGroupControlEventsRequest,
  type ListE2eeGroupControlEventsResponse,
  type ListMailboxEnvelopesRequest,
  type ListMailboxEnvelopesResponse,
  type PublishDeviceRosterRequest,
  type PublishDeviceRosterResponse,
  type PublishIdentityRootRequest,
  type PublishIdentityRootResponse,
  type RemoveE2eeMemberRequest,
  type RemoveE2eeMemberResponse,
  type RevokeDeviceRequest,
  type RevokeDeviceResponse,
  type SendEnvelopesRequest,
  type SendEnvelopesResponse,
  type UploadPrekeysRequest,
  type UploadPrekeysResponse,
} from '@patches/proto/nest';

import { AppError } from '../../common/errors/app-error.js';
import { AuthGuard } from '../auth/auth.guard.js';
import { CurrentSession } from '../auth/session-context.js';
import { type AccessTokenClaims } from '../auth/token.service.js';
import { E2eeConversationService } from './e2ee-conversation.service.js';
import { E2eeCapabilityService } from './e2ee-capability.service.js';
import { E2eeDeviceRosterService } from './device-roster.service.js';
import { E2eeGroupService } from './group-control.service.js';
import { E2eeIdentityRootService } from './identity-root.service.js';
import { E2eePrekeyService } from './prekey.service.js';
import { E2eeReportEvidenceService } from './report-evidence.service.js';

function requireSession(session: AccessTokenClaims | undefined): AccessTokenClaims {
  if (session === undefined)
    throw new AppError('AUTH_INVALID_CREDENTIALS', 'Authentication required.');
  return session;
}

/**
 * Transport adapter for `patches.v1.E2eeService` (ADR 0020, P13-004/005/007/009). The
 * account-root/certified-device lifecycle, prekeys, conversation/envelope fanout, and report
 * evidence are all implemented — every RPC in the schema now has a node behind it.
 *
 * `E2eeCapabilityService` makes the ADR 0027 rollout decision from the same policy the fanout
 * accepts with; the controller only maps the gRPC call to that application service.
 */
@Controller()
@UseGuards(AuthGuard)
@E2eeServiceControllerMethods()
export class E2eeController implements E2eeServiceController {
  constructor(
    private readonly identityRoots: E2eeIdentityRootService,
    private readonly deviceRosters: E2eeDeviceRosterService,
    private readonly prekeys: E2eePrekeyService,
    private readonly conversations: E2eeConversationService,
    private readonly groups: E2eeGroupService,
    private readonly reportEvidence: E2eeReportEvidenceService,
    private readonly capability: E2eeCapabilityService,
  ) {}

  getE2EeCapability(
    @Payload() _request: GetE2eeCapabilityRequest,
  ): Promise<GetE2eeCapabilityResponse> {
    return Promise.resolve(this.capability.getCapability());
  }

  async publishIdentityRoot(
    @Payload() request: PublishIdentityRootRequest,
    @Ctx() _metadata?: Metadata,
    @CurrentSession() session?: AccessTokenClaims,
  ): Promise<PublishIdentityRootResponse> {
    return this.identityRoots.publishIdentityRoot(requireSession(session).actorId, request);
  }

  async getIdentityRoot(
    @Payload() request: GetIdentityRootRequest,
  ): Promise<GetIdentityRootResponse> {
    return this.identityRoots.getIdentityRoot(request);
  }

  async enrollDevice(
    @Payload() request: EnrollDeviceRequest,
    @Ctx() _metadata?: Metadata,
    @CurrentSession() session?: AccessTokenClaims,
  ): Promise<EnrollDeviceResponse> {
    return this.deviceRosters.enrollDevice(requireSession(session).actorId, request);
  }

  async revokeDevice(
    @Payload() request: RevokeDeviceRequest,
    @Ctx() _metadata?: Metadata,
    @CurrentSession() session?: AccessTokenClaims,
  ): Promise<RevokeDeviceResponse> {
    return this.deviceRosters.revokeDevice(requireSession(session).actorId, request);
  }

  async publishDeviceRoster(
    @Payload() request: PublishDeviceRosterRequest,
    @Ctx() _metadata?: Metadata,
    @CurrentSession() session?: AccessTokenClaims,
  ): Promise<PublishDeviceRosterResponse> {
    return this.deviceRosters.publishDeviceRoster(requireSession(session).actorId, request);
  }

  async getDeviceRoster(
    @Payload() request: GetDeviceRosterRequest,
  ): Promise<GetDeviceRosterResponse> {
    return this.deviceRosters.getDeviceRoster(request);
  }

  async listDeviceRosters(
    @Payload() request: ListDeviceRostersRequest,
  ): Promise<ListDeviceRostersResponse> {
    return this.deviceRosters.listDeviceRosters(request);
  }

  async uploadPrekeys(
    @Payload() request: UploadPrekeysRequest,
    @Ctx() _metadata?: Metadata,
    @CurrentSession() session?: AccessTokenClaims,
  ): Promise<UploadPrekeysResponse> {
    return this.prekeys.uploadPrekeys(requireSession(session).actorId, request);
  }

  async getPrekeyInventory(
    @Payload() request: GetPrekeyInventoryRequest,
    @Ctx() _metadata?: Metadata,
    @CurrentSession() session?: AccessTokenClaims,
  ): Promise<GetPrekeyInventoryResponse> {
    return this.prekeys.getPrekeyInventory(requireSession(session).actorId, request);
  }

  async claimPrekeyBundles(
    @Payload() request: ClaimPrekeyBundlesRequest,
    @Ctx() _metadata?: Metadata,
    @CurrentSession() session?: AccessTokenClaims,
  ): Promise<ClaimPrekeyBundlesResponse> {
    return this.prekeys.claimPrekeyBundles(requireSession(session).actorId, request);
  }

  async createE2EeConversation(
    @Payload() request: CreateE2eeConversationRequest,
    @Ctx() _metadata?: Metadata,
    @CurrentSession() session?: AccessTokenClaims,
  ): Promise<CreateE2eeConversationResponse> {
    return this.conversations.createE2eeConversation(requireSession(session).actorId, request);
  }

  async getE2EeConversationState(
    @Payload() request: GetE2eeConversationStateRequest,
    @Ctx() _metadata?: Metadata,
    @CurrentSession() session?: AccessTokenClaims,
  ): Promise<GetE2eeConversationStateResponse> {
    return this.conversations.getE2eeConversationState(requireSession(session).actorId, request);
  }

  async addE2EeMember(
    @Payload() request: AddE2eeMemberRequest,
    @Ctx() _metadata?: Metadata,
    @CurrentSession() session?: AccessTokenClaims,
  ): Promise<AddE2eeMemberResponse> {
    return this.groups.addE2eeMember(requireSession(session).actorId, request);
  }

  async removeE2EeMember(
    @Payload() request: RemoveE2eeMemberRequest,
    @Ctx() _metadata?: Metadata,
    @CurrentSession() session?: AccessTokenClaims,
  ): Promise<RemoveE2eeMemberResponse> {
    return this.groups.removeE2eeMember(requireSession(session).actorId, request);
  }

  async listE2EeGroupControlEvents(
    @Payload() request: ListE2eeGroupControlEventsRequest,
    @Ctx() _metadata?: Metadata,
    @CurrentSession() session?: AccessTokenClaims,
  ): Promise<ListE2eeGroupControlEventsResponse> {
    return this.groups.listGroupControlEvents(requireSession(session).actorId, request);
  }

  async sendEnvelopes(
    @Payload() request: SendEnvelopesRequest,
    @Ctx() _metadata?: Metadata,
    @CurrentSession() session?: AccessTokenClaims,
  ): Promise<SendEnvelopesResponse> {
    return this.conversations.sendEnvelopes(requireSession(session).actorId, request);
  }

  async listMailboxEnvelopes(
    @Payload() request: ListMailboxEnvelopesRequest,
    @Ctx() _metadata?: Metadata,
    @CurrentSession() session?: AccessTokenClaims,
  ): Promise<ListMailboxEnvelopesResponse> {
    return this.conversations.listMailboxEnvelopes(requireSession(session).actorId, request);
  }

  async acknowledgeEnvelopes(
    @Payload() request: AcknowledgeEnvelopesRequest,
    @Ctx() _metadata?: Metadata,
    @CurrentSession() session?: AccessTokenClaims,
  ): Promise<AcknowledgeEnvelopesResponse> {
    return this.conversations.acknowledgeEnvelopes(requireSession(session).actorId, request);
  }

  async attachReportEvidence(
    @Payload() request: AttachReportEvidenceRequest,
    @Ctx() _metadata?: Metadata,
    @CurrentSession() session?: AccessTokenClaims,
  ): Promise<AttachReportEvidenceResponse> {
    return this.reportEvidence.attachReportEvidence(requireSession(session).actorId, request);
  }
}
