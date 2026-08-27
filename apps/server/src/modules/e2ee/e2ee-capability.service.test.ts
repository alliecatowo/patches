import { E2eeCapabilityState } from '@patches/proto/nest';
import { describe, expect, it } from 'vitest';

import { E2eeCapabilityService } from './e2ee-capability.service.js';
import { E2eeRuntimeApprovalPolicy } from './e2ee-runtime-approval-policy.js';
import { type NodeFrankingKeyRing } from './report-evidence.js';

const signingKey = new Uint8Array(32).fill(4);
const signingKeyRing: NodeFrankingKeyRing = {
  currentEra: () => 7,
  keyForEra: (era) => (era === 7 ? signingKey : undefined),
  knownEras: () => [7],
};

const approvedPolicy = new E2eeRuntimeApprovalPolicy();

describe('E2eeCapabilityService', () => {
  it('reports ENABLED when the profile is approved and the key ring can sign', () => {
    const capability = new E2eeCapabilityService(signingKeyRing, approvedPolicy);

    const { capability: reported } = capability.getCapability();
    expect(reported?.state).toBe(E2eeCapabilityState.E2EE_CAPABILITY_STATE_ENABLED);
    expect(reported?.frankingProfile).toBe('patches-franking-v1');
    expect(reported?.supportedProtocolVersions).toContain('patches-e2ee-v1');
  });

  it('stays DISABLED when the current era has no signing key', () => {
    const missingCurrentKey: NodeFrankingKeyRing = {
      currentEra: () => 7,
      keyForEra: () => undefined,
      knownEras: () => [],
    };
    const capability = new E2eeCapabilityService(missingCurrentKey, approvedPolicy);

    expect(capability.getCapability().capability?.state).toBe(
      E2eeCapabilityState.E2EE_CAPABILITY_STATE_DISABLED,
    );
  });

  it('stays DISABLED when the operator narrows the approval list to exclude the profile', () => {
    const narrowedPolicy = new E2eeRuntimeApprovalPolicy(['some-other-domain-approved-profile']);
    const capability = new E2eeCapabilityService(signingKeyRing, narrowedPolicy);

    expect(capability.getCapability().capability?.state).toBe(
      E2eeCapabilityState.E2EE_CAPABILITY_STATE_DISABLED,
    );
  });
});
