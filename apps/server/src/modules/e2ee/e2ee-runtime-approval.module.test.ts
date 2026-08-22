import { E2eeCapabilityState } from '@patches/proto/nest';
import { Test } from '@nestjs/testing';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { E2eeCapabilityService } from './e2ee-capability.service.js';
import { NODE_FRANKING_KEY_RING } from './node-franking-key-ring.js';
import {
  E2EE_RUNTIME_APPROVAL_POLICY,
  type E2eeRuntimeApprovalPolicy,
} from './e2ee-runtime-approval-policy.js';
import { type NodeFrankingKeyRing } from './report-evidence.js';

const signingKey = new Uint8Array(32).fill(4);
const signingKeyRing: NodeFrankingKeyRing = {
  currentEra: () => 7,
  keyForEra: (era) => (era === 7 ? signingKey : undefined),
  knownEras: () => [7],
};

describe('E2eeRuntimeApprovalModule', () => {
  let capability: E2eeCapabilityService;
  let policy: E2eeRuntimeApprovalPolicy;

  beforeAll(async () => {
    // NODE_ENV keeps normal deployment logging/optimization behavior; ADR 0027's explicit
    // owner opt-in, rather than NODE_ENV, authorizes this disposable node's isolated-test state.
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('E2EE_UNREVIEWED_DEV_MODE', 'true');
    vi.stubEnv('DATABASE_URL', 'postgres://patches:patches@127.0.0.1:5432/patches');
    vi.stubEnv(
      'JWT_PRIVATE_KEY',
      Buffer.from(
        '-----BEGIN PRIVATE KEY-----\nMC4CAQAwBQYDK2VwBCIEIA==\n-----END PRIVATE KEY-----\n',
      ).toString('base64'),
    );
    vi.stubEnv(
      'JWT_PUBLIC_KEY',
      Buffer.from(
        '-----BEGIN PUBLIC KEY-----\nMCowBQYDK2VwAyEA\n-----END PUBLIC KEY-----\n',
      ).toString('base64'),
    );
    vi.stubEnv(
      'AUTH_CODE_DELIVERY_KEYS',
      JSON.stringify({ test: Buffer.alloc(32, 9).toString('base64') }),
    );
    vi.stubEnv('AUTH_CODE_DELIVERY_ACTIVE_KEY_ID', 'test');

    // AppConfigModule evaluates ConfigModule.forRoot at import time, after the env is prepared.
    const { E2eeRuntimeApprovalModule } = await import('./e2ee-runtime-approval.module.js');
    const module = await Test.createTestingModule({
      imports: [E2eeRuntimeApprovalModule],
      providers: [
        E2eeCapabilityService,
        { provide: NODE_FRANKING_KEY_RING, useValue: signingKeyRing },
      ],
    }).compile();
    policy = module.get<E2eeRuntimeApprovalPolicy>(E2EE_RUNTIME_APPROVAL_POLICY);
    capability = module.get(E2eeCapabilityService);
  });

  afterAll(() => {
    vi.unstubAllEnvs();
  });

  it('uses the env-configured shared policy for both the capability and send approval gate', () => {
    expect(policy.isUnreviewedDevelopmentMode).toBe(true);
    expect(() => policy.assertProfileApproved('patches-franking-v1')).not.toThrow();
    expect(capability.getCapability().capability?.state).toBe(
      E2eeCapabilityState.E2EE_CAPABILITY_STATE_ISOLATED_TEST_ONLY,
    );
  });

  it('keeps capability disabled when the current era has no actual signing key', () => {
    const missingCurrentKey: NodeFrankingKeyRing = {
      currentEra: () => 7,
      keyForEra: () => undefined,
      knownEras: () => [],
    };
    const missingKeyCapability = new E2eeCapabilityService(missingCurrentKey, policy);

    expect(missingKeyCapability.getCapability().capability?.state).toBe(
      E2eeCapabilityState.E2EE_CAPABILITY_STATE_DISABLED,
    );
  });
});
