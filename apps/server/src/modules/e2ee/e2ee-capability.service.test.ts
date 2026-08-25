import { E2eeCapabilityState } from '@patches/proto/nest';
import { Test } from '@nestjs/testing';
import { afterAll, describe, expect, it, vi } from 'vitest';

import { E2eeCapabilityService } from './e2ee-capability.service.js';
import { E2eeRuntimeApprovalPolicy } from './e2ee-runtime-approval-policy.js';
import { NODE_FRANKING_KEY_RING } from './node-franking-key-ring.js';
import { type NodeFrankingKeyRing } from './report-evidence.js';

const signingKey = new Uint8Array(32).fill(4);
const signingKeyRing: NodeFrankingKeyRing = {
  currentEra: () => 7,
  keyForEra: (era) => (era === 7 ? signingKey : undefined),
  knownEras: () => [7],
};

const approvedPolicy = new E2eeRuntimeApprovalPolicy(false, ['patches-franking-v1']);
const unreviewedPolicy = new E2eeRuntimeApprovalPolicy(true);

describe('E2eeCapabilityService B-108 rollout disclosure', () => {
  afterAll(() => {
    vi.unstubAllEnvs();
  });

  it('reports ENABLED through DI when the profile is env-approved, the key ring can sign, and E2EE_V1_ENABLED is set', async () => {
    // Production env shape minus the operator exception: an approved franking profile (the
    // canary configuration) plus the B-108 final gate flipped on.
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('E2EE_APPROVED_FRANKING_PROFILES', 'patches-franking-v1');
    vi.stubEnv('E2EE_V1_ENABLED', 'true');
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
    const capability = module.get(E2eeCapabilityService);

    const { capability: reported } = capability.getCapability();
    expect(reported?.state).toBe(E2eeCapabilityState.E2EE_CAPABILITY_STATE_ENABLED);
    expect(reported?.frankingProfile).toBe('patches-franking-v1');
    expect(reported?.supportedProtocolVersions).toContain('patches-e2ee-v1');

    await module.close();
  });

  it('stays at EXPERIMENTAL_CANARY with an approved profile when the final gate is off', () => {
    const capability = new E2eeCapabilityService(signingKeyRing, approvedPolicy, {
      e2eeV1Enabled: false,
    });

    expect(capability.getCapability().capability?.state).toBe(
      E2eeCapabilityState.E2EE_CAPABILITY_STATE_EXPERIMENTAL_CANARY,
    );
  });

  it('never lets the flag upgrade an unreviewed node past ISOLATED_TEST_ONLY', () => {
    const capability = new E2eeCapabilityService(signingKeyRing, unreviewedPolicy, {
      e2eeV1Enabled: true,
    });

    expect(capability.getCapability().capability?.state).toBe(
      E2eeCapabilityState.E2EE_CAPABILITY_STATE_ISOLATED_TEST_ONLY,
    );
  });

  it('stays DISABLED when the flag is on but the current era has no signing key', () => {
    const missingCurrentKey: NodeFrankingKeyRing = {
      currentEra: () => 7,
      keyForEra: () => undefined,
      knownEras: () => [],
    };
    const capability = new E2eeCapabilityService(missingCurrentKey, approvedPolicy, {
      e2eeV1Enabled: true,
    });

    expect(capability.getCapability().capability?.state).toBe(
      E2eeCapabilityState.E2EE_CAPABILITY_STATE_DISABLED,
    );
  });

  it('fails closed to canary when constructed without a config (pre-B-108 direct construction)', () => {
    const capability = new E2eeCapabilityService(signingKeyRing, approvedPolicy);

    expect(capability.getCapability().capability?.state).toBe(
      E2eeCapabilityState.E2EE_CAPABILITY_STATE_EXPERIMENTAL_CANARY,
    );
  });
});
