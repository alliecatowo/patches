import { E2EE_FRANKING_PROFILE_V1 } from '@patches/domain';
import { describe, expect, it } from 'vitest';

import { E2eeRuntimeApprovalPolicy } from './e2ee-runtime-approval-policy.js';

describe('E2eeRuntimeApprovalPolicy', () => {
  it('fails closed by default', () => {
    const policy = new E2eeRuntimeApprovalPolicy(false);

    expect(policy.isUnreviewedDevelopmentMode).toBe(false);
    expect(() => policy.assertProfileApproved(E2EE_FRANKING_PROFILE_V1)).toThrow(
      'independent review',
    );
  });

  it('permits only the canonical unreviewed profile in the explicit development exception', () => {
    const policy = new E2eeRuntimeApprovalPolicy(true);

    expect(policy.isUnreviewedDevelopmentMode).toBe(true);
    expect(() => policy.assertProfileApproved(E2EE_FRANKING_PROFILE_V1)).not.toThrow();
    expect(() => policy.assertProfileApproved('patches-franking-v2')).toThrow('independent review');
  });
});
