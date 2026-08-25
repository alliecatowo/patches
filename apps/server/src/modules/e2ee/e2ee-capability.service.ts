import { Inject, Injectable } from '@nestjs/common';
import {
  E2EE_FRANKING_PROFILE_V1,
  E2EE_GROUP_MAX_MEMBERS,
  E2EE_MAILBOX_MAX_LATENCY_MS,
  E2EE_MAX_ACTIVE_DEVICES_PER_ACTOR,
  E2EE_MAX_ENVELOPE_BYTES,
  E2EE_ONE_TIME_PREKEY_REPLENISH_THRESHOLD,
  E2EE_ONE_TIME_PREKEY_TARGET,
  E2EE_PROTOCOL_V1,
  E2EE_REPORT_MAX_SURROUNDING_MESSAGES,
  E2EE_SIGNED_PREKEY_ROTATION_MS,
} from '@patches/domain';
import { E2eeCapabilityState, type GetE2eeCapabilityResponse } from '@patches/proto/nest';

import { NODE_FRANKING_KEY_RING } from './node-franking-key-ring.js';
import {
  E2EE_RUNTIME_APPROVAL_POLICY,
  type E2eeRuntimeApprovalPolicy,
} from './e2ee-runtime-approval-policy.js';
import { type NodeFrankingKeyRing } from './report-evidence.js';

/**
 * Computes E2EE rollout disclosure from the same runtime policy the fanout accept path uses.
 * Keeping this application decision out of the gRPC controller prevents a transport-specific
 * capability claim from drifting from the actual pre-write approval gate.
 */
@Injectable()
export class E2eeCapabilityService {
  constructor(
    @Inject(NODE_FRANKING_KEY_RING) private readonly keys: NodeFrankingKeyRing,
    @Inject(E2EE_RUNTIME_APPROVAL_POLICY)
    private readonly approvalPolicy: E2eeRuntimeApprovalPolicy,
  ) {}

  getCapability(): GetE2eeCapabilityResponse {
    const signingEra = this.keys.currentEra();
    const profileApproved = this.approvalPolicy.isProfileApproved(E2EE_FRANKING_PROFILE_V1);
    if (
      (profileApproved || this.approvalPolicy.isUnreviewedDevelopmentMode) &&
      signingEra !== undefined &&
      this.keys.keyForEra(signingEra) !== undefined
    ) {
      return {
        capability: {
          state: profileApproved
            ? E2eeCapabilityState.E2EE_CAPABILITY_STATE_EXPERIMENTAL_CANARY
            : E2eeCapabilityState.E2EE_CAPABILITY_STATE_ISOLATED_TEST_ONLY,
          supportedProtocolVersions: [E2EE_PROTOCOL_V1],
          maxActiveDevicesPerActor: E2EE_MAX_ACTIVE_DEVICES_PER_ACTOR,
          maxGroupMembers: E2EE_GROUP_MAX_MEMBERS,
          oneTimePrekeyTarget: E2EE_ONE_TIME_PREKEY_TARGET,
          oneTimePrekeyReplenishThreshold: E2EE_ONE_TIME_PREKEY_REPLENISH_THRESHOLD,
          signedPrekeyRotationSeconds: E2EE_SIGNED_PREKEY_ROTATION_MS / 1_000,
          mailboxMaxLatencySeconds: E2EE_MAILBOX_MAX_LATENCY_MS / 1_000,
          maxEnvelopeBytes: E2EE_MAX_ENVELOPE_BYTES,
          maxReportContextMessages: E2EE_REPORT_MAX_SURROUNDING_MESSAGES,
          frankingProfile: E2EE_FRANKING_PROFILE_V1,
          postQuantum: false,
        },
      };
    }

    return {
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
    };
  }
}
