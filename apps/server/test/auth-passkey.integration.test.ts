import { createServer as createFreePortProbe } from 'node:net';
import { createHash, randomUUID } from 'node:crypto';

import { credentials as grpcCredentials, status as GrpcStatus } from '@grpc/grpc-js';
import { type NestExpressApplication } from '@nestjs/platform-express';
import { type MicroserviceOptions } from '@nestjs/microservices';
import { Test } from '@nestjs/testing';
import { Notification } from '@patches/database';
import { createTestUser } from '@patches/testkit';
import {
  type AuthGrpcClient,
  type BeginPasskeyLoginRequest,
  type BeginPasskeyLoginResponse,
  type BeginPasskeyRegistrationRequest,
  type BeginPasskeyRegistrationResponse,
  type CompletePasskeyLoginRequest,
  type CompletePasskeyLoginResponse,
  type CompletePasskeyRegistrationRequest,
  type CompletePasskeyRegistrationResponse,
  createAuthClient,
  type ListCredentialsRequest,
  type ListCredentialsResponse,
  type RegisterRequest,
  type RegisterResponse,
  type RevokeCredentialRequest,
  type RevokeCredentialResponse,
} from '@patches/proto';
// Runtime enum value, not `@patches/proto`'s type-only re-export — see LEARNINGS:
// proto-nestjs-value-export-leak.
import { CredentialType } from '@patches/proto/nest';
import type {
  VerifiedAuthenticationResponse,
  VerifiedRegistrationResponse,
} from '@simplewebauthn/server';
import type { DataSource } from 'typeorm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { AppModule } from '../src/app.module.js';
import { createGrpcMicroservice } from '../src/grpc-options.js';
import { PasskeyVerifierService } from '../src/modules/auth/passkey-verifier.service.js';
import { ReadinessState } from '../src/modules/system/readiness-state.js';
import { createServerTestDataSource } from './support/database.js';
import { callUnary, expectRejection } from './support/test-server.js';

/**
 * Passkey/WebAuthn RPCs over real gRPC and real Postgres (P15-004, ADR 0022) — challenge
 * issuance/consumption (`PasskeyChallengeService`, real `webauthn_challenges` rows), rate
 * limiting, credential storage, `ListCredentials`/`RevokeCredential` interplay, and the
 * sign-count-regression → `SECURITY` notification path are all exercised for real.
 *
 * The one thing this suite does **not** exercise is actual WebAuthn cryptography: producing a
 * genuine attestation/assertion requires a real authenticator (hardware or platform), which
 * nothing in this process can be. `PasskeyVerifierService` — the seam ADR 0022 designed
 * specifically for this — is overridden with a stub whose `verifyRegistrationResponse`/
 * `verifyAuthenticationResponse` return a canned, caller-controlled result; every other method
 * (`decodeClientDataChallenge`, `readAuthenticatorCounter`, the two `generate*Options` calls)
 * is the real implementation, so the challenge plumbing and sign-count decoding are still real.
 */

class StubbedPasskeyVerifier extends PasskeyVerifierService {
  // Every credential id passed to `credentials.existsBy` must be unique while active (spec
  // §165: one credential authenticates at most one account), so each test — and each
  // registration within a test — gets its own, rather than one constant shared process-wide.
  registrationResult: VerifiedRegistrationResponse = successfulRegistration(randomUUID());
  authenticationResult: VerifiedAuthenticationResponse = successfulAuthentication(randomUUID());

  override verifyRegistrationResponse(): Promise<VerifiedRegistrationResponse> {
    return Promise.resolve(this.registrationResult);
  }

  override verifyAuthenticationResponse(): Promise<VerifiedAuthenticationResponse> {
    return Promise.resolve(this.authenticationResult);
  }
}

function successfulRegistration(credentialId: string): VerifiedRegistrationResponse {
  return {
    verified: true,
    registrationInfo: {
      fmt: 'none',
      aaguid: '00000000-0000-0000-0000-000000000000',
      credential: {
        id: credentialId,
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
  };
}

function successfulAuthentication(credentialId: string): VerifiedAuthenticationResponse {
  return {
    verified: true,
    authenticationInfo: {
      credentialID: credentialId,
      newCounter: 1,
      userVerified: true,
      credentialDeviceType: 'singleDevice',
      credentialBackedUp: false,
      origin: 'https://example.test',
      rpID: 'example.test',
    },
  };
}

/** A real, spec-shaped `authenticatorData` blob (32-byte rpIdHash + 1 flags byte + 4-byte
 * big-endian counter) — decoded for real by `PasskeyVerifierService.readAuthenticatorCounter`,
 * which is never stubbed (see the suite's own doc comment). */
function authenticatorDataBase64Url(counter: number): string {
  const buffer = Buffer.alloc(37);
  buffer[32] = 0x05; // UP + UV flags; unread by `parseAuthenticatorData`'s counter extraction.
  buffer.writeUInt32BE(counter, 33);
  return buffer.toString('base64url');
}

function clientDataJsonBase64Url(
  type: 'webauthn.create' | 'webauthn.get',
  challenge: string,
): string {
  return Buffer.from(
    JSON.stringify({ type, challenge, origin: 'https://example.test' }),
    'utf8',
  ).toString('base64url');
}

function registrationCredentialJson(credentialId: string, challenge: string): string {
  return JSON.stringify({
    id: credentialId,
    rawId: credentialId,
    response: {
      attestationObject: 'AA',
      clientDataJSON: clientDataJsonBase64Url('webauthn.create', challenge),
    },
    type: 'public-key',
    clientExtensionResults: {},
  });
}

function authenticationCredentialJson(
  credentialId: string,
  challenge: string,
  counter: number,
): string {
  return JSON.stringify({
    id: credentialId,
    rawId: credentialId,
    response: {
      authenticatorData: authenticatorDataBase64Url(counter),
      clientDataJSON: clientDataJsonBase64Url('webauthn.get', challenge),
      signature: 'AA',
    },
    type: 'public-key',
    clientExtensionResults: {},
  });
}

async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createFreePortProbe();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (address === null || typeof address === 'string') {
        server.close(() => {
          reject(new Error('could not determine a free port'));
        });
        return;
      }
      const { port } = address;
      server.close(() => {
        resolve(port);
      });
    });
  });
}

const testDatabaseUrl = process.env.TEST_DATABASE_URL;

describe.skipIf(testDatabaseUrl === undefined || testDatabaseUrl.length === 0)(
  'Passkey/WebAuthn RPCs over gRPC (integration)',
  () => {
    let dataSource: DataSource;
    let app: NestExpressApplication;
    let verifier: StubbedPasskeyVerifier;
    let url: string;
    let auth: AuthGrpcClient;

    beforeAll(async () => {
      dataSource = await createServerTestDataSource();

      const port = await freePort();
      url = `127.0.0.1:${String(port)}`;
      const { options: grpcOptions, health } = createGrpcMicroservice(url);

      const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
        .overrideProvider(PasskeyVerifierService)
        .useClass(StubbedPasskeyVerifier)
        .compile();

      app = moduleRef.createNestApplication<NestExpressApplication>({
        logger: false,
        bodyParser: false,
        abortOnError: false,
      });
      app.connectMicroservice<MicroserviceOptions>(grpcOptions, { inheritAppConfig: true });

      const readiness = app.get(ReadinessState);
      await app.startAllMicroservices();
      health.setStatus('SERVING');
      readiness.setServing(true);

      verifier = app.get(PasskeyVerifierService);
      auth = createAuthClient(url, grpcCredentials.createInsecure());
    }, 60_000);

    afterAll(async () => {
      auth.close();
      await app.close();
      await dataSource.destroy();
    });

    function suffix(): string {
      return randomUUID().replace(/-/g, '').slice(0, 10);
    }

    /** This node runs `INVITE_ONLY=true` in the test env (`support/env.ts`); only the very
     * first-ever account rides the bootstrap exception, so every `register()` call here mints
     * its own single-use invite, mirroring `auth-github.integration.test.ts`'s helper. */
    async function mintInvite(): Promise<string> {
      const { user: inviter } = await createTestUser(dataSource.manager, {
        handle: `inviter${suffix()}`,
      });
      const code = `invite-${randomUUID()}`;
      await dataSource.query(
        'INSERT INTO invites (code_hash, created_by_user_id, max_uses, uses) VALUES ($1, $2, 1, 0)',
        [createHash('sha256').update(code, 'utf8').digest('hex'), inviter.id],
      );
      return code;
    }

    async function register(): Promise<{ accessToken: string; actorId: string }> {
      const handle = `user${suffix()}`;
      const response = await callUnary<RegisterRequest, RegisterResponse>(
        auth.register.bind(auth),
        {
          handle,
          displayName: 'Passkey Tester',
          email: '',
          password: 'a-perfectly-fine-password',
          inviteCode: await mintInvite(),
          clientRequestId: randomUUID(),
          sshPublicKey: '',
          privacyNoticeVersionAcknowledged: 0,
        },
      );
      return {
        accessToken: response.session?.accessToken ?? '',
        actorId: response.session?.actor?.id ?? '',
      };
    }

    // ------------------------------------------------------------------ tests

    it('registers a passkey, lists it, and logs in with it end to end', async () => {
      const { accessToken, actorId } = await register();
      const credentialId = randomUUID();
      verifier.registrationResult = successfulRegistration(credentialId);
      verifier.authenticationResult = successfulAuthentication(credentialId);

      const begunRegistration = await callUnary<
        BeginPasskeyRegistrationRequest,
        BeginPasskeyRegistrationResponse
      >(auth.beginPasskeyRegistration.bind(auth), {}, { accessToken });
      const registrationOptions = JSON.parse(begunRegistration.optionsJson) as {
        challenge: string;
      };
      expect(registrationOptions.challenge.length).toBeGreaterThan(0);

      const completedRegistration = await callUnary<
        CompletePasskeyRegistrationRequest,
        CompletePasskeyRegistrationResponse
      >(
        auth.completePasskeyRegistration.bind(auth),
        {
          credentialJson: registrationCredentialJson(credentialId, registrationOptions.challenge),
          label: 'Test authenticator',
        },
        { accessToken },
      );
      expect(completedRegistration.credential?.type).toBe(CredentialType.CREDENTIAL_TYPE_PASSKEY);
      expect(completedRegistration.credential?.label).toBe('Test authenticator');

      const listed = await callUnary<ListCredentialsRequest, ListCredentialsResponse>(
        auth.listCredentials.bind(auth),
        {},
        { accessToken },
      );
      expect(
        listed.credentials.some((c) => c.type === CredentialType.CREDENTIAL_TYPE_PASSKEY),
      ).toBe(true);

      // A replayed registration challenge is rejected (single-use, real DB-backed consume()).
      await expect(
        callUnary<CompletePasskeyRegistrationRequest, CompletePasskeyRegistrationResponse>(
          auth.completePasskeyRegistration.bind(auth),
          {
            credentialJson: registrationCredentialJson(credentialId, registrationOptions.challenge),
            label: '',
          },
          { accessToken },
        ),
      ).rejects.toBeDefined();

      // ---- login with the newly enrolled passkey ----

      const begunLogin = await callUnary<BeginPasskeyLoginRequest, BeginPasskeyLoginResponse>(
        auth.beginPasskeyLogin.bind(auth),
        {},
      );
      const loginOptions = JSON.parse(begunLogin.optionsJson) as { challenge: string };

      const loggedIn = await callUnary<CompletePasskeyLoginRequest, CompletePasskeyLoginResponse>(
        auth.completePasskeyLogin.bind(auth),
        { credentialJson: authenticationCredentialJson(credentialId, loginOptions.challenge, 1) },
      );
      expect(loggedIn.session?.actor?.id).toBe(actorId);

      // A replayed login challenge is rejected too.
      const replayError = await expectRejection<
        CompletePasskeyLoginRequest,
        CompletePasskeyLoginResponse
      >(auth.completePasskeyLogin.bind(auth), {
        credentialJson: authenticationCredentialJson(credentialId, loginOptions.challenge, 2),
      });
      expect(replayError.code).toBe(GrpcStatus.UNAUTHENTICATED);

      // ---- the last-credential guard still holds across credential types ----

      const stillPassword = await callUnary<ListCredentialsRequest, ListCredentialsResponse>(
        auth.listCredentials.bind(auth),
        {},
        { accessToken },
      );
      const passwordCredential = stillPassword.credentials.find(
        (c) => c.type === CredentialType.CREDENTIAL_TYPE_PASSWORD,
      );
      const passkeyCredential = stillPassword.credentials.find(
        (c) => c.type === CredentialType.CREDENTIAL_TYPE_PASSKEY,
      );
      expect(passwordCredential).toBeDefined();
      expect(passkeyCredential).toBeDefined();

      // Revoking the password is fine — the passkey remains.
      await callUnary<RevokeCredentialRequest, RevokeCredentialResponse>(
        auth.revokeCredential.bind(auth),
        { id: passwordCredential?.id ?? '' },
        { accessToken },
      );

      // Revoking the passkey now would leave the account with none — refused.
      const guardError = await expectRejection<RevokeCredentialRequest, RevokeCredentialResponse>(
        auth.revokeCredential.bind(auth),
        { id: passkeyCredential?.id ?? '' },
        { accessToken },
      );
      expect(guardError.code).toBe(GrpcStatus.INVALID_ARGUMENT);
    });

    it('rejects a sign-count regression and writes a SECURITY notification', async () => {
      const { accessToken, actorId } = await register();
      const credentialId = randomUUID();
      verifier.registrationResult = successfulRegistration(credentialId);
      verifier.authenticationResult = successfulAuthentication(credentialId);

      const begunRegistration = await callUnary<
        BeginPasskeyRegistrationRequest,
        BeginPasskeyRegistrationResponse
      >(auth.beginPasskeyRegistration.bind(auth), {}, { accessToken });
      const registrationOptions = JSON.parse(begunRegistration.optionsJson) as {
        challenge: string;
      };
      await callUnary<CompletePasskeyRegistrationRequest, CompletePasskeyRegistrationResponse>(
        auth.completePasskeyRegistration.bind(auth),
        {
          credentialJson: registrationCredentialJson(credentialId, registrationOptions.challenge),
          label: '',
        },
        { accessToken },
      );

      // First login: counter 5, stored counter (from registration) is 0 — never flagged.
      const firstLoginBegin = await callUnary<BeginPasskeyLoginRequest, BeginPasskeyLoginResponse>(
        auth.beginPasskeyLogin.bind(auth),
        {},
      );
      const firstLoginOptions = JSON.parse(firstLoginBegin.optionsJson) as { challenge: string };
      await callUnary<CompletePasskeyLoginRequest, CompletePasskeyLoginResponse>(
        auth.completePasskeyLogin.bind(auth),
        {
          credentialJson: authenticationCredentialJson(
            credentialId,
            firstLoginOptions.challenge,
            5,
          ),
        },
      );

      // Second login: counter 5 again (not greater than the now-stored 5) — a clone signal.
      const secondLoginBegin = await callUnary<BeginPasskeyLoginRequest, BeginPasskeyLoginResponse>(
        auth.beginPasskeyLogin.bind(auth),
        {},
      );
      const secondLoginOptions = JSON.parse(secondLoginBegin.optionsJson) as { challenge: string };
      const error = await expectRejection<
        CompletePasskeyLoginRequest,
        CompletePasskeyLoginResponse
      >(auth.completePasskeyLogin.bind(auth), {
        credentialJson: authenticationCredentialJson(credentialId, secondLoginOptions.challenge, 5),
      });
      expect(error.code).toBe(GrpcStatus.UNAUTHENTICATED);

      const notifications = await dataSource
        .getRepository(Notification)
        .find({ where: { recipientActorId: actorId, type: 'SECURITY' } });
      expect(notifications.length).toBeGreaterThan(0);
    });

    it('rejects BeginPasskeyRegistration without a session', async () => {
      const error = await expectRejection<
        BeginPasskeyRegistrationRequest,
        BeginPasskeyRegistrationResponse
      >(auth.beginPasskeyRegistration.bind(auth), {});
      expect(error.code).toBe(GrpcStatus.UNAUTHENTICATED);
    });

    it('rejects an unparseable CompletePasskeyLogin payload uniformly', async () => {
      const error = await expectRejection<
        CompletePasskeyLoginRequest,
        CompletePasskeyLoginResponse
      >(auth.completePasskeyLogin.bind(auth), { credentialJson: 'not json' });
      expect(error.code).toBe(GrpcStatus.UNAUTHENTICATED);
    });
  },
);
