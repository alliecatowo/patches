import { Actor, Credential, User, type WebauthnChallenge } from '@patches/database';
import type {
  AuthenticationResponseJSON,
  RegistrationResponseJSON,
  VerifiedAuthenticationResponse,
  VerifiedRegistrationResponse,
} from '@simplewebauthn/server';
import { describe, expect, it, vi } from 'vitest';

import { type AppConfigService } from '../../config/app-config.service.js';
import { AuthService } from './auth.service.js';
import { type PasskeyChallengeService } from './passkey-challenge.service.js';
import { PasskeyVerifierService } from './passkey-verifier.service.js';
import { type RateLimitService } from './rate-limit.service.js';
import { type AccessTokenClaims, type IssuedTokens, type TokenService } from './token.service.js';

/**
 * Unit coverage for the WebAuthn relying-party configuration overrides introduced for
 * issue #435 (`PASSKEY_RP_ID` / `PASSKEY_ORIGINS`).
 *
 * The actual "does this ceremony response's asserted origin match" decision is delegated to
 * `@simplewebauthn/server`, which accepts an `expectedOrigin` of `string | string[]` and matches
 * any member — so accepting the web origin (and rejecting a mismatched one) is the library's
 * behavior once our two call sites forward the full list. What this suite pins down is the
 * contract *our* code owns: `AuthService.rpId()` honors the override, and BOTH ceremony
 * verification sites forward the full accepted-origin list with the correct RP id. The real
 * library / real-Postgres paths are exercised separately in
 * `apps/server/test/auth-passkey.integration.test.ts`.
 *
 * A genuine WebAuthn ceremony needs a browser authenticator, which nothing here can produce, so
 * `PasskeyVerifierService` is replaced with a recording stub — the same seam ADR 0022 designed
 * for exactly this. The challenge/credential/user/actor lookups are handled by a focused fake
 * `DataSource`, since driving `completePasskeyRegistration`/`completePasskeyLogin` far enough to
 * reach the verify calls needs those rows to exist.
 */

// ------------------------------------------------------------------ fixtures

const CLAIMS: AccessTokenClaims = {
  userId: 'user-1',
  actorId: 'actor-1',
  sessionId: 'session-1',
  expiresAt: new Date(),
};

const PUBLIC_ORIGIN = 'https://patches-social.fly.dev';
const PASSKEY_RP_ID = 'patches-web.pages.dev';
const PASSKEY_ORIGINS = ['https://patches-web.pages.dev'];

class RecordingPasskeyVerifier extends PasskeyVerifierService {
  authenticationRpid: string | undefined;
  registrationRpid: string | undefined;
  registrationExpectedOrigin: string | string[] | undefined;
  authenticationExpectedOrigin: string | string[] | undefined;

  override generateAuthenticationOptions(input: {
    rpID: string;
  }): ReturnType<PasskeyVerifierService['generateAuthenticationOptions']> {
    this.authenticationRpid = input.rpID;
    return super.generateAuthenticationOptions(input);
  }

  override verifyRegistrationResponse(input: {
    response: RegistrationResponseJSON;
    expectedChallenge: string;
    expectedOrigin: string | string[];
    expectedRPID: string;
  }): Promise<VerifiedRegistrationResponse> {
    this.registrationExpectedOrigin = input.expectedOrigin;
    this.registrationRpid = input.expectedRPID;
    return Promise.resolve({
      verified: true,
      registrationInfo: {
        fmt: 'none',
        aaguid: '00000000-0000-0000-0000-000000000000',
        credential: {
          id: 'cred-1',
          publicKey: new Uint8Array([1, 2, 3, 4]),
          counter: 0,
          transports: ['internal'],
        },
        credentialType: 'public-key',
        attestationObject: new Uint8Array(),
        userVerified: true,
        credentialDeviceType: 'singleDevice',
        credentialBackedUp: false,
        origin: 'https://example.test',
      },
    });
  }

  override verifyAuthenticationResponse(input: {
    expectedOrigin: string | string[];
  }): Promise<VerifiedAuthenticationResponse> {
    this.authenticationExpectedOrigin = input.expectedOrigin;
    return Promise.resolve({
      verified: true,
      authenticationInfo: {
        credentialID: 'cred-1',
        newCounter: 1,
        userVerified: true,
        credentialDeviceType: 'singleDevice',
        credentialBackedUp: false,
        origin: 'https://example.test',
        rpID: 'example.test',
      },
    });
  }
}

function base64Url(value: string): string {
  return Buffer.from(value, 'utf8').toString('base64url');
}

function clientDataChallenge(type: 'webauthn.create' | 'webauthn.get', challenge: string): string {
  return base64Url(
    JSON.stringify({ type, challenge, origin: 'https://example.test', crossOrigin: false }),
  );
}

/** A register ceremony payload whose embedded challenge is `challenge`. */
function registrationCredentialJson(challenge: string): string {
  return JSON.stringify({
    id: 'cred-1',
    rawId: 'cred-1',
    response: {
      attestationObject: 'AA',
      clientDataJSON: clientDataChallenge('webauthn.create', challenge),
    },
    type: 'public-key',
    clientExtensionResults: {},
  });
}

/** A login ceremony payload (`authenticatorData` counter is unread here — stored counter 0 skips
 * the regression check). */
function authenticationCredentialJson(challenge: string): string {
  const authenticatorData = Buffer.alloc(37);
  authenticatorData[32] = 0x05;
  authenticatorData.writeUInt32BE(1, 33);
  return JSON.stringify({
    id: 'cred-1',
    rawId: 'cred-1',
    response: {
      authenticatorData: authenticatorData.toString('base64url'),
      clientDataJSON: clientDataChallenge('webauthn.get', challenge),
      signature: 'AA',
    },
    type: 'public-key',
    clientExtensionResults: {},
  });
}

interface BuildDeps {
  verifier: PasskeyVerifierService;
  challenges?: PasskeyChallengeService;
  tokens?: TokenService;
  dataSource?: unknown;
}

function buildAuthService(
  config: AppConfigService,
  deps: BuildDeps,
): { auth: AuthService; passkeyChallenges: PasskeyChallengeService } {
  const passkeyChallenges =
    deps.challenges ??
    ({
      issue: vi.fn().mockResolvedValue(undefined),
      consume: vi.fn().mockResolvedValue({
        challenge: 'challenge-1',
        purpose: 'REGISTRATION',
        boundUserId: CLAIMS.userId,
      } satisfies Partial<WebauthnChallenge>),
    });

  const tokens =
    deps.tokens ??
    ({
      issueSession: vi.fn().mockResolvedValue({
        accessToken: 'at',
        accessExpiresAt: new Date(),
        refreshToken: 'rt',
        refreshExpiresAt: new Date(),
        sessionId: 'session-1',
      } satisfies IssuedTokens),
    } as unknown as TokenService);

  const auth = new AuthService(
    deps.dataSource as never,
    config,
    {} as never,
    tokens,
    {} as never,
    {
      consumePeer: vi.fn(),
      consumeDistributedPeer: vi.fn(),
      consume: vi.fn(),
      consumeDistributed: vi.fn().mockResolvedValue(undefined),
    } as unknown as RateLimitService,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    passkeyChallenges,
    deps.verifier,
  );

  return { auth, passkeyChallenges };
}

/**
 * A `DataSource` fake that answers the queries the two `completePasskey*` ceremonies make
 * (`dataSource.getRepository` + `manager.getRepository(Credential)` for the transaction, and the
 * `User`/`Actor` lookups login performs), running `transaction(cb)` as `cb(fakeManager)` so the
 * in-transaction writes actually execute. Rows are resolved from per-entity stubs keyed by the
 * TypeORM entity class.
 */
function fakeDataSource(): {
  dataSource: {
    manager: unknown;
    getRepository: (entity: unknown) => unknown;
    transaction: (cb: (manager: unknown) => unknown) => Promise<unknown>;
  };
} {
  const savedCredential = {
    id: 'cred-1',
    type: 'PASSKEY',
    label: 'Test',
    identifier: 'cred-1',
    createdAt: new Date(),
    lastUsedAt: null,
  };
  const actor = {
    id: CLAIMS.actorId,
    handle: 'tester',
    displayName: 'Tester',
    bio: null,
    locationText: null,
    websiteUrl: null,
    isLocal: true,
    createdAt: new Date(),
    homeServer: null,
    nameplate: null,
  };
  const rows = new Map<unknown, Record<string, unknown>>([
    [
      Credential,
      {
        findOne: vi.fn().mockResolvedValue({
          ...savedCredential,
          userId: CLAIMS.userId,
          publicMaterial: Buffer.from([1, 2, 3, 4]).toString('base64'),
          metadata: { counter: 0 },
        }),
        existsBy: vi.fn().mockResolvedValue(false),
        create: vi.fn((data: never) => data),
        save: vi.fn().mockResolvedValue(savedCredential),
        update: vi.fn().mockResolvedValue({ affected: 1 }),
      },
    ],
    [
      User,
      {
        findOne: vi.fn().mockResolvedValue({
          id: CLAIMS.userId,
          actorId: CLAIMS.actorId,
          deletedAt: null,
          status: 'ACTIVE',
          emailVerifiedAt: new Date(),
        }),
      },
    ],
    [
      Actor,
      {
        findOne: vi.fn().mockResolvedValue(actor),
      },
    ],
  ]);
  const manager = {
    getRepository: (entity: unknown) => rows.get(entity),
  };
  return {
    dataSource: {
      manager: manager,
      getRepository: (entity: unknown) => rows.get(entity),
      transaction: (cb: (manager: unknown) => unknown) => Promise.resolve(cb(manager)),
    },
  };
}

function fakeConfig(overrides: Partial<AppConfigService>): AppConfigService {
  return {
    publicOrigin: PUBLIC_ORIGIN,
    nodeDomain: 'patches-social.fly.dev',
    instanceName: 'patches-dev',
    ...overrides,
  } as unknown as AppConfigService;
}

// ------------------------------------------------------------------ tests

describe('AuthService passkey RP configuration (issue #435)', () => {
  it('uses PASSKEY_RP_ID for the login ceremony RP id when configured', async () => {
    const verifier = new RecordingPasskeyVerifier();
    const { auth } = buildAuthService(
      fakeConfig({ passkeyRpId: PASSKEY_RP_ID, passkeyOrigins: PASSKEY_ORIGINS }),
      { verifier, dataSource: fakeDataSource().dataSource },
    );

    await auth.beginPasskeyLogin();

    expect(verifier.authenticationRpid).toBe(PASSKEY_RP_ID);
  });

  it('falls back to the PUBLIC_ORIGIN hostname for the RP id when no override is set', async () => {
    const verifier = new RecordingPasskeyVerifier();
    const { auth } = buildAuthService(fakeConfig({}), {
      verifier,
      dataSource: fakeDataSource().dataSource,
    });

    await auth.beginPasskeyLogin();

    expect(verifier.authenticationRpid).toBe('patches-social.fly.dev');
  });

  it('passes the full accepted-origin list to registration verification, with the override RP id', async () => {
    const verifier = new RecordingPasskeyVerifier();
    const { auth } = buildAuthService(
      fakeConfig({ passkeyRpId: PASSKEY_RP_ID, passkeyOrigins: PASSKEY_ORIGINS }),
      { verifier, dataSource: fakeDataSource().dataSource },
    );

    await auth.completePasskeyRegistration(CLAIMS, {
      credentialJson: registrationCredentialJson('challenge-1'),
      label: 'Test',
    });

    expect(verifier.registrationExpectedOrigin).toEqual(PASSKEY_ORIGINS);
    expect(verifier.registrationRpid).toBe(PASSKEY_RP_ID);
  });

  it('passes the full accepted-origin list to login verification, with the override RP id', async () => {
    const verifier = new RecordingPasskeyVerifier();
    const { auth } = buildAuthService(
      fakeConfig({ passkeyRpId: PASSKEY_RP_ID, passkeyOrigins: PASSKEY_ORIGINS }),
      { verifier, dataSource: fakeDataSource().dataSource },
    );

    await auth.completePasskeyLogin({
      credentialJson: authenticationCredentialJson('challenge-1'),
    });

    expect(verifier.authenticationExpectedOrigin).toEqual(PASSKEY_ORIGINS);
  });

  it('defaults (no override): both ceremonies verify against [PUBLIC_ORIGIN] with its hostname', async () => {
    const verifier = new RecordingPasskeyVerifier();
    const { auth } = buildAuthService(fakeConfig({}), {
      verifier,
      dataSource: fakeDataSource().dataSource,
    });

    await auth.completePasskeyRegistration(CLAIMS, {
      credentialJson: registrationCredentialJson('challenge-1'),
    });
    await auth.completePasskeyLogin({
      credentialJson: authenticationCredentialJson('challenge-1'),
    });

    expect(verifier.registrationExpectedOrigin).toEqual([PUBLIC_ORIGIN]);
    expect(verifier.authenticationExpectedOrigin).toEqual([PUBLIC_ORIGIN]);
  });
});
