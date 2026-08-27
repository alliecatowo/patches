import { E2EE_FRANKING_PROFILE_V1 } from '@patches/domain';
import { describe, expect, it } from 'vitest';

import { E2eeRuntimeApprovalPolicy } from './e2ee-runtime-approval-policy.js';

describe('E2eeRuntimeApprovalPolicy', () => {
  it('approves the domain-approved profile with no env narrowing', () => {
    const policy = new E2eeRuntimeApprovalPolicy();

    expect(policy.isProfileApproved(E2EE_FRANKING_PROFILE_V1)).toBe(true);
    expect(() => policy.assertProfileApproved(E2EE_FRANKING_PROFILE_V1)).not.toThrow();
  });

  it('rejects a profile the domain constant has never approved, regardless of env', () => {
    const policy = new E2eeRuntimeApprovalPolicy(['patches-franking-v2']);

    expect(() => policy.assertProfileApproved('patches-franking-v2')).toThrow('independent review');
  });

  it('lets an env narrowing exclude a profile the domain constant otherwise approves', () => {
    const policy = new E2eeRuntimeApprovalPolicy(['some-other-domain-approved-profile']);

    expect(policy.isProfileApproved(E2EE_FRANKING_PROFILE_V1)).toBe(false);
    expect(() => policy.assertProfileApproved(E2EE_FRANKING_PROFILE_V1)).toThrow('excluded by');
  });

  it('approves a narrowed-to subset that includes the profile', () => {
    const policy = new E2eeRuntimeApprovalPolicy([E2EE_FRANKING_PROFILE_V1]);

    expect(() => policy.assertProfileApproved(E2EE_FRANKING_PROFILE_V1)).not.toThrow();
  });
});
