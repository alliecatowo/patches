import { type Metadata } from '@grpc/grpc-js';
import { Controller, UseGuards } from '@nestjs/common';
import { Ctx, Payload } from '@nestjs/microservices';
import {
  E2eeCapabilityState,
  E2eeServiceControllerMethods,
  type AcknowledgeEnvelopesRequest,
  type AcknowledgeEnvelopesResponse,
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
  type ListMailboxEnvelopesRequest,
  type ListMailboxEnvelopesResponse,
  type PublishDeviceRosterRequest,
  type PublishDeviceRosterResponse,
  type PublishIdentityRootRequest,
  type PublishIdentityRootResponse,
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
import { E2eeDeviceRosterService } from './device-roster.service.js';
import { E2eeIdentityRootService } from './identity-root.service.js';
import { E2eePrekeyService } from './prekey.service.js';
import { E2eeReportEvidenceService } from './report-evidence.service.js';

function requireSession(session: AccessTokenClaims | undefined): AccessTokenClaims {
  if (session === undefined)
    throw new AppError('AUTH_INVALID_CREDENTIALS', 'Authentication required.');
  return session;
}

function notImplemented(rpc: string): never {
  throw new AppError('NOT_IMPLEMENTED', `${rpc} is not implemented on this node yet.`);
}

/**
 * Transport adapter for `patches.v1.E2eeService` (ADR 0020, P13-004/P13-005). Only the
 * account-root/certified-device lifecycle and the prekey service are implemented here — the
 * conversation/envelope/report RPCs (`CreateE2eeConversation`, `GetE2eeConversationState`,
 * `SendEnvelopes`, `ListMailboxEnvelopes`, `AcknowledgeEnvelopes`, `AttachReportEvidence`) are
 * separate, not-yet-implemented tasks and report `NOT_IMPLEMENTED`, exactly as the proto's own
 * "Status: schema-only" doc comment describes for a node that hasn't reached them yet.
 *
 * `GetE2eeCapability` always reports `E2EE_CAPABILITY_STATE_DISABLED`: enabling `E2EE_V1` is
 * gated on ADR 0020 §12's ship gates (including P13-014's independent-review gate) and must stay
 * off regardless of which lifecycle RPCs this node happens to implement.
 *
 * `AttachReportEvidence` (ADR 0020 §9, P13-009) is implemented alongside them for the same
 * reason: ADR 0020 §11's migration stage 3 ("node protocol behind a disabled capability") calls
 * for report ingestion and opaque storage to exist before any capability is enabled, not after.
 * Implementing it does not enable or advertise `E2EE_V1` — `getE2EeCapability` above is
 * unaffected, and `assertFrankingProfileApproved` (`@patches/domain`) still throws for every
 * profile, so no production conversation can ever generate real evidence for it to ingest.
 */
@Controller()
@UseGuards(AuthGuard)
@E2eeServiceControllerMethods()
export class E2eeController implements E2eeServiceController {
  constructor(
    private readonly identityRoots: E2eeIdentityRootService,
    private readonly deviceRosters: E2eeDeviceRosterService,
    private readonly prekeys: E2eePrekeyService,
    private readonly reportEvidence: E2eeReportEvidenceService,
  ) {}

  getE2EeCapability(
    @Payload() _request: GetE2eeCapabilityRequest,
  ): Promise<GetE2eeCapabilityResponse> {
    return Promise.resolve({
      capability: {
        state: E2eeCapabilityState.E2EE_CAPABILITY_STATE_DISABLED,
        supportedProtocolVersions: [],
        maxActiveDevicesPerActor: 0,
        maxGroupMembers: 0,
        oneTimePrekeyTarget: 0,
        oneTimePrekeyReplenishThreshold: 0,
        signedPrekeyRotationSeconds: 0,
        mailboxMaxLatencySeconds: 0,
        maxEnvelopeBytes: 0,
        maxReportContextMessages: 0,
        frankingProfile: '',
        postQuantum: false,
      },
    });
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

  createE2EeConversation(
    @Payload() _request: CreateE2eeConversationRequest,
  ): Promise<CreateE2eeConversationResponse> {
    notImplemented('CreateE2eeConversation');
  }

  getE2EeConversationState(
    @Payload() _request: GetE2eeConversationStateRequest,
  ): Promise<GetE2eeConversationStateResponse> {
    notImplemented('GetE2eeConversationState');
  }

  sendEnvelopes(@Payload() _request: SendEnvelopesRequest): Promise<SendEnvelopesResponse> {
    notImplemented('SendEnvelopes');
  }

  listMailboxEnvelopes(
    @Payload() _request: ListMailboxEnvelopesRequest,
  ): Promise<ListMailboxEnvelopesResponse> {
    notImplemented('ListMailboxEnvelopes');
  }

  acknowledgeEnvelopes(
    @Payload() _request: AcknowledgeEnvelopesRequest,
  ): Promise<AcknowledgeEnvelopesResponse> {
    notImplemented('AcknowledgeEnvelopes');
  }

  async attachReportEvidence(
    @Payload() request: AttachReportEvidenceRequest,
    @Ctx() _metadata?: Metadata,
    @CurrentSession() session?: AccessTokenClaims,
  ): Promise<AttachReportEvidenceResponse> {
    return this.reportEvidence.attachReportEvidence(requireSession(session).actorId, request);
  }
}
