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
 * Reports whether this node can genuinely serve E2EE (ADR 0036 Amendment: owner override,
 * 2026-08-26 — E2EE is an always-on feature, not a staged rollout).
 *
 * `ENABLED` iff the node has a franking profile it's allowed to use and a signing key for its
 * current era; otherwise `DISABLED`. `ISOLATED_TEST_ONLY` and `EXPERIMENTAL_CANARY` are retained
 * in the proto enum (never reuse a field/enum number, spec §153) but are no longer produced —
 * see `packages/domain/src/e2ee/modes.ts`'s doc comment on `E2EE_CAPABILITY_STATES`.
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
    const canServe =
      this.approvalPolicy.isProfileApproved(E2EE_FRANKING_PROFILE_V1) &&
      signingEra !== undefined &&
      this.keys.keyForEra(signingEra) !== undefined;

    if (canServe) {
      return {
        capability: {
          state: E2eeCapabilityState.E2EE_CAPABILITY_STATE_ENABLED,
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
