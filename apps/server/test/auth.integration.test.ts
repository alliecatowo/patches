import { createHash, generateKeyPairSync, randomUUID, sign as cryptoSign } from 'node:crypto';

import { credentials as grpcCredentials, status as GrpcStatus } from '@grpc/grpc-js';
import { Credential, OutboxJob, RefreshToken, User } from '@patches/database';
import {
  type AddCredentialRequest,
  type AddCredentialResponse,
  type AuthGrpcClient,
  type BeginSshLoginRequest,
  type BeginSshLoginResponse,
  type CompleteSshLoginRequest,
  type CompleteSshLoginResponse,
  createAuthClient,
  type GetCurrentSessionRequest,
  type GetCurrentSessionResponse,
  type ListCredentialsRequest,
  type ListCredentialsResponse,
  type LoginRequest,
  type LoginResponse,
  type LogoutAllSessionsRequest,
  type LogoutAllSessionsResponse,
  type LogoutRequest,
  type LogoutResponse,
  type RefreshSessionRequest,
  type RefreshSessionResponse,
  type RegisterRequest,
  type RegisterResponse,
  type RequestPasswordResetRequest,
  type RequestPasswordResetResponse,
  type ResetPasswordRequest,
  type ResetPasswordResponse,
  type RevokeCredentialRequest,
  type RevokeCredentialResponse,
  timestampToDate,
  type VerifyEmailRequest,
  type VerifyEmailResponse,
} from '@patches/proto';
import { CredentialType } from '@patches/proto/nest';
import { createTestUser } from '@patches/testkit';
import { Not, type DataSource } from 'typeorm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { buildSshChallengeBlob } from '../src/modules/auth/ssh/challenge-blob.js';
import { encodeSshStrings } from '../src/modules/auth/ssh/wire.js';
import { createServerTestDataSource } from './support/database.js';
import {
  callUnary,
  expectRejection,
  startTestServer,
  TEST_NODE_DOMAIN,
  type TestServer,
} from './support/test-server.js';

/**
 * End-to-end auth over real gRPC against real PostgreSQL (spec §118–§119): register →
 * verify → login → refresh → reuse-revokes → logout, plus SSH login, invite gating, the
 * last-credential rule and rate limiting.
 *
 * Nothing here reaches into the service layer; every assertion is made through the wire
 * contract, which is the only thing a client actually has.
 */

let dataSource: DataSource;
let server: TestServer;
let auth: AuthGrpcClient;
/** A bootstrap account, because `invites.created_by_user_id` is NOT NULL (§66). */
let inviterUserId: string;

beforeAll(async () => {
  dataSource = await createServerTestDataSource();
  const { user } = await createTestUser(dataSource.manager, { handle: `inviter${suffix()}` });
  inviterUserId = user.id;

  server = await startTestServer();
  auth = createAuthClient(server.url, grpcCredentials.createInsecure());
}, 60_000);

afterAll(async () => {
  auth.close();
  await server.close();
  await dataSource.destroy();
});

// ------------------------------------------------------------------ helpers

/** Distinct handles/emails per test, so one test's rate-limit budget is never another's. */
function suffix(): string {
  return randomUUID().replace(/-/g, '').slice(0, 10);
}

function sha256Hex(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

/** Mints a usable invite code and stores only its hash, exactly as `patches-admin` would. */
async function mintInvite(maxUses = 1): Promise<string> {
  const code = `invite-${randomUUID()}`;
  await dataSource.query(
    'INSERT INTO invites (code_hash, created_by_user_id, max_uses, uses) VALUES ($1, $2, $3, 0)',
    [sha256Hex(code), inviterUserId, maxUses],
  );
  return code;
}

async function register(overrides: Partial<RegisterRequest> = {}): Promise<RegisterResponse> {
  const handle = overrides.handle ?? `user${suffix()}`;
  return callUnary<RegisterRequest, RegisterResponse>(auth.register.bind(auth), {
    handle,
    displayName: overrides.displayName ?? 'Test Person',
    email: overrides.email ?? `${handle}@example.test`,
    password: overrides.password ?? 'a-perfectly-fine-password',
    inviteCode: overrides.inviteCode ?? (await mintInvite()),
    clientRequestId: overrides.clientRequestId ?? randomUUID(),
    sshPublicKey: overrides.sshPublicKey ?? '',
  });
}

/** Reads the code out of the outbox job written in the same transaction as the account. */
async function latestEmailedCode(userId: string, type: string): Promise<string> {
  const job = await dataSource
    .getRepository(OutboxJob)
    .createQueryBuilder('job')
    .where('job.type = :type', { type })
    .andWhere("job.payload->>'userId' = :userId", { userId })
    .orderBy('job.id', 'DESC')
    .getOne();
  const code = job?.payload['code'];
  if (typeof code !== 'string') throw new Error(`no ${type} job for user ${userId}`);
  return code;
}

async function userIdForHandle(handle: string): Promise<string> {
  const rows: { id: string }[] = await dataSource.query(
    'SELECT u.id FROM users u JOIN actors a ON a.id = u.actor_id WHERE a.handle_normalized = $1',
    [handle.toLowerCase()],
  );
  const id = rows[0]?.id;
  if (id === undefined) throw new Error(`no user for handle ${handle}`);
  return id;
}

/** Reads the `session_id` claim straight off the access token — no verification needed, the
 * test only wants to know which token family the server put the client in. */
function sessionIdOf(accessToken: string): string {
  const payload = accessToken.split('.')[1] ?? '';
  const claims: unknown = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
  const sessionId = (claims as { session_id?: unknown }).session_id;
  if (typeof sessionId !== 'string') throw new Error('access token has no session_id claim');
  return sessionId;
}

/** An ed25519 identity built with node:crypto alone — no ssh-keygen, no agent. */
function sshIdentity(): { publicKeyLine: string; sign: (data: Buffer) => Buffer } {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const spki = publicKey.export({ format: 'der', type: 'spki' });
  const blob = encodeSshStrings(['ssh-ed25519', spki.subarray(spki.length - 32)]);
  return {
    publicKeyLine: `ssh-ed25519 ${blob.toString('base64')} integration@patches`,
    sign: (data) => encodeSshStrings(['ssh-ed25519', cryptoSign(null, data, privateKey)]),
  };
}

// ------------------------------------------------------------------ tests

describe('Register', () => {
  it('refuses to register without an invite while the node is invite-only (§33)', async () => {
    const error = await expectRejection<RegisterRequest, RegisterResponse>(
      auth.register.bind(auth),
      {
        handle: `noinvite${suffix()}`,
        displayName: '',
        email: '',
        password: 'a-perfectly-fine-password',
        inviteCode: '',
        clientRequestId: randomUUID(),
        sshPublicKey: '',
      },
    );
    expect(error.code).toBe(GrpcStatus.INVALID_ARGUMENT);
  });

  it('refuses an invite code that was already spent', async () => {
    const inviteCode = await mintInvite();
    await register({ inviteCode });

    const error = await expectRejection<RegisterRequest, RegisterResponse>(
      auth.register.bind(auth),
      {
        handle: `second${suffix()}`,
        displayName: '',
        email: '',
        password: 'a-perfectly-fine-password',
        inviteCode,
        clientRequestId: randomUUID(),
        sshPublicKey: '',
      },
    );
    expect(error.code).toBe(GrpcStatus.INVALID_ARGUMENT);
  });

  it('issues a session bound to this node, with the email not yet verified', async () => {
    const handle = `alice${suffix()}`;
    const { session } = await register({ handle });

    expect(session?.actor?.handle).toBe(handle);
    expect(session?.node).toBe(TEST_NODE_DOMAIN);
    expect(session?.emailVerified).toBe(false);
    expect(session?.accessToken).toMatch(/^[\w-]+\.[\w-]+\.[\w-]+$/);
    // 32 bytes base64url — opaque, never a JWT (§36).
    expect(session?.refreshToken).toMatch(/^[\w-]{43}$/);
    expect(timestampToDate(session?.accessExpiresAt)?.getTime()).toBeGreaterThan(Date.now());
  });

  it('rejects a handle that is already taken with ALREADY_EXISTS', async () => {
    const handle = `taken${suffix()}`;
    await register({ handle });

    const error = await expectRejection<RegisterRequest, RegisterResponse>(
      auth.register.bind(auth),
      {
        handle: handle.toUpperCase(),
        displayName: '',
        email: '',
        password: 'a-perfectly-fine-password',
        inviteCode: await mintInvite(),
        clientRequestId: randomUUID(),
        sshPublicKey: '',
      },
    );
    expect(error.code).toBe(GrpcStatus.ALREADY_EXISTS);
  });

  it('stores an Argon2id hash and never the password', async () => {
    const handle = `hashed${suffix()}`;
    await register({ handle, password: 'a-very-memorable-password' });

    const userId = await userIdForHandle(handle);
    const credential = await dataSource
      .getRepository(Credential)
      .findOneByOrFail({ userId, type: 'PASSWORD' });
    expect(credential.secretHash).toMatch(/^\$argon2id\$/);
    expect(credential.secretHash).not.toContain('a-very-memorable-password');
    expect(credential.identifier).toBeNull();
  });

  it('writes the verification code and its outbox job in one transaction (§12)', async () => {
    const handle = `verifier${suffix()}`;
    await register({ handle });
    const userId = await userIdForHandle(handle);

    const codes: { count: string }[] = await dataSource.query(
      "SELECT count(*)::text AS count FROM auth_codes WHERE user_id = $1 AND purpose = 'VERIFY_EMAIL'",
      [userId],
    );
    expect(codes[0]?.count).toBe('1');
    await expect(latestEmailedCode(userId, 'SEND_VERIFICATION_EMAIL')).resolves.toBeTypeOf(
      'string',
    );
  });

  it('rejects a password shorter than the node policy', async () => {
    const error = await expectRejection<RegisterRequest, RegisterResponse>(
      auth.register.bind(auth),
      {
        handle: `short${suffix()}`,
        displayName: '',
        email: '',
        password: 'short',
        inviteCode: await mintInvite(),
        clientRequestId: randomUUID(),
        sshPublicKey: '',
      },
    );
    expect(error.code).toBe(GrpcStatus.INVALID_ARGUMENT);
  });
});

describe('the register → verify → login → refresh → logout journey', () => {
  it('carries one account all the way through', async () => {
    const handle = `journey${suffix()}`;
    const password = 'the-journey-password';
    const { session: registered } = await register({ handle, password });
    const userId = await userIdForHandle(handle);

    // --- verify email
    const code = await latestEmailedCode(userId, 'SEND_VERIFICATION_EMAIL');
    const verified = await callUnary<VerifyEmailRequest, VerifyEmailResponse>(
      auth.verifyEmail.bind(auth),
      { code },
    );
    expect(verified.emailVerified).toBe(true);
    expect(
      (await dataSource.getRepository(User).findOneByOrFail({ id: userId })).emailVerifiedAt,
    ).not.toBeNull();

    // A verification code is single use.
    const replay = await expectRejection<VerifyEmailRequest, VerifyEmailResponse>(
      auth.verifyEmail.bind(auth),
      { code },
    );
    expect(replay.code).toBe(GrpcStatus.INVALID_ARGUMENT);

    // --- login
    const { session: loggedIn } = await callUnary<LoginRequest, LoginResponse>(
      auth.login.bind(auth),
      { emailOrHandle: handle, password },
    );
    expect(loggedIn?.emailVerified).toBe(true);
    expect(loggedIn?.actor?.id).toBe(registered?.actor?.id);

    // --- the access token authenticates GetCurrentSession
    const current = await callUnary<GetCurrentSessionRequest, GetCurrentSessionResponse>(
      auth.getCurrentSession.bind(auth),
      {},
      { accessToken: loggedIn?.accessToken ?? '' },
    );
    expect(current.userId).toBe(userId);
    expect(current.actor?.handle).toBe(handle);
    expect(current.node).toBe(TEST_NODE_DOMAIN);

    // --- refresh rotates the token
    const firstRefreshToken = loggedIn?.refreshToken ?? '';
    const { session: refreshed } = await callUnary<RefreshSessionRequest, RefreshSessionResponse>(
      auth.refreshSession.bind(auth),
      { refreshToken: firstRefreshToken },
    );
    expect(refreshed?.refreshToken).not.toBe(firstRefreshToken);
    expect(refreshed?.accessToken).not.toBe(loggedIn?.accessToken);

    // --- reusing the rotated token revokes the whole family (§36)
    const reuse = await expectRejection<RefreshSessionRequest, RefreshSessionResponse>(
      auth.refreshSession.bind(auth),
      { refreshToken: firstRefreshToken },
    );
    expect(reuse.code).toBe(GrpcStatus.UNAUTHENTICATED);

    const afterReuse = await expectRejection<RefreshSessionRequest, RefreshSessionResponse>(
      auth.refreshSession.bind(auth),
      { refreshToken: refreshed?.refreshToken ?? '' },
    );
    expect(afterReuse.code).toBe(GrpcStatus.UNAUTHENTICATED);

    // Only *this* family: the account also holds the session registration issued, and reuse
    // detection is explicitly family-scoped rather than account-wide (§36).
    const sessionId = sessionIdOf(loggedIn?.accessToken ?? '');
    const family = await dataSource.getRepository(RefreshToken).findBy({ userId, sessionId });
    expect(family.length).toBeGreaterThan(1);
    expect(family.every((token) => token.revokedAt !== null)).toBe(true);
    const otherFamilies = await dataSource
      .getRepository(RefreshToken)
      .findBy({ userId, sessionId: Not(sessionId) });
    expect(otherFamilies.some((token) => token.revokedAt === null)).toBe(true);

    // --- logout is idempotent and ends the session it is given
    const { session: freshSession } = await callUnary<LoginRequest, LoginResponse>(
      auth.login.bind(auth),
      { emailOrHandle: handle, password },
    );
    await callUnary<LogoutRequest, LogoutResponse>(auth.logout.bind(auth), {
      refreshToken: freshSession?.refreshToken ?? '',
    });
    const afterLogout = await expectRejection<RefreshSessionRequest, RefreshSessionResponse>(
      auth.refreshSession.bind(auth),
      { refreshToken: freshSession?.refreshToken ?? '' },
    );
    expect(afterLogout.code).toBe(GrpcStatus.UNAUTHENTICATED);

    // An unknown token is not an error — logout must not be an oracle.
    await callUnary<LogoutRequest, LogoutResponse>(auth.logout.bind(auth), {
      refreshToken: 'a'.repeat(43),
    });
  });
});

describe('Login', () => {
  it('accepts the recovery email as well as the handle', async () => {
    const handle = `byemail${suffix()}`;
    const email = `${handle}@example.test`;
    await register({ handle, email, password: 'login-by-email-please' });

    const { session } = await callUnary<LoginRequest, LoginResponse>(auth.login.bind(auth), {
      emailOrHandle: email.toUpperCase(),
      password: 'login-by-email-please',
    });
    expect(session?.actor?.handle).toBe(handle);
  });

  it('answers a wrong password and an unknown account identically', async () => {
    const handle = `wrongpw${suffix()}`;
    await register({ handle, password: 'the-right-password' });

    const wrongPassword = await expectRejection<LoginRequest, LoginResponse>(
      auth.login.bind(auth),
      { emailOrHandle: handle, password: 'the-wrong-password' },
    );
    const noSuchUser = await expectRejection<LoginRequest, LoginResponse>(auth.login.bind(auth), {
      emailOrHandle: `ghost${suffix()}`,
      password: 'the-wrong-password',
    });

    expect(wrongPassword.code).toBe(GrpcStatus.UNAUTHENTICATED);
    expect(noSuchUser.code).toBe(GrpcStatus.UNAUTHENTICATED);
    expect(wrongPassword.details).toBe(noSuchUser.details);
  });

  it('refuses further attempts once the login budget is spent (§102)', async () => {
    const handle = `flood${suffix()}`;
    await register({ handle, password: 'the-right-password' });

    let lastCode = GrpcStatus.OK;
    for (let attempt = 0; attempt < 12; attempt += 1) {
      const error = await expectRejection<LoginRequest, LoginResponse>(auth.login.bind(auth), {
        emailOrHandle: handle,
        password: 'not-the-right-password',
      });
      lastCode = error.code;
    }
    expect(lastCode).toBe(GrpcStatus.RESOURCE_EXHAUSTED);
  });
});

describe('AuthGuard', () => {
  it('rejects a call with no authorization metadata', async () => {
    const error = await expectRejection<GetCurrentSessionRequest, GetCurrentSessionResponse>(
      auth.getCurrentSession.bind(auth),
      {},
    );
    expect(error.code).toBe(GrpcStatus.UNAUTHENTICATED);
  });

  it('rejects a garbage bearer token', async () => {
    const error = await expectRejection<GetCurrentSessionRequest, GetCurrentSessionResponse>(
      auth.getCurrentSession.bind(auth),
      {},
      { accessToken: 'not.a.jwt' },
    );
    expect(error.code).toBe(GrpcStatus.UNAUTHENTICATED);
  });

  it('ends every session on LogoutAllSessions', async () => {
    const handle = `logoutall${suffix()}`;
    const password = 'logout-everything-now';
    await register({ handle, password });

    const first = await callUnary<LoginRequest, LoginResponse>(auth.login.bind(auth), {
      emailOrHandle: handle,
      password,
    });
    const second = await callUnary<LoginRequest, LoginResponse>(auth.login.bind(auth), {
      emailOrHandle: handle,
      password,
    });

    await callUnary<LogoutAllSessionsRequest, LogoutAllSessionsResponse>(
      auth.logoutAllSessions.bind(auth),
      {},
      { accessToken: first.session?.accessToken ?? '' },
    );

    for (const session of [first.session, second.session]) {
      const error = await expectRejection<RefreshSessionRequest, RefreshSessionResponse>(
        auth.refreshSession.bind(auth),
        { refreshToken: session?.refreshToken ?? '' },
      );
      expect(error.code).toBe(GrpcStatus.UNAUTHENTICATED);
    }
  });
});

describe('SSH login (§166)', () => {
  it('registers with a key and then logs in by signing a challenge', async () => {
    const identity = sshIdentity();
    const handle = `sshuser${suffix()}`;
    await register({ handle, sshPublicKey: identity.publicKeyLine, password: '' });

    const challenge = await callUnary<BeginSshLoginRequest, BeginSshLoginResponse>(
      auth.beginSshLogin.bind(auth),
      { publicKeyOpenssh: identity.publicKeyLine, fingerprint: '' },
    );
    expect(challenge.nonce.length).toBeGreaterThanOrEqual(32);
    const expiresAt = timestampToDate(challenge.expiresAt);
    expect((expiresAt?.getTime() ?? 0) - Date.now()).toBeLessThanOrEqual(120_000);

    const credential = await dataSource
      .getRepository(Credential)
      .findOneByOrFail({ userId: await userIdForHandle(handle), type: 'SSH_PUBLIC_KEY' });

    const blob = buildSshChallengeBlob({
      nodeDomain: TEST_NODE_DOMAIN,
      challengeId: challenge.challengeId,
      nonce: Buffer.from(challenge.nonce),
      fingerprint: credential.identifier ?? '',
      expiresAt: expiresAt ?? new Date(0),
    });

    const { session } = await callUnary<CompleteSshLoginRequest, CompleteSshLoginResponse>(
      auth.completeSshLogin.bind(auth),
      {
        challengeId: challenge.challengeId,
        publicKeyOpenssh: identity.publicKeyLine,
        signature: identity.sign(blob),
        signatureFormat: 'ssh-ed25519',
      },
    );
    expect(session?.actor?.handle).toBe(handle);

    // Single use: the same signature replayed finds the challenge already consumed.
    const replay = await expectRejection<CompleteSshLoginRequest, CompleteSshLoginResponse>(
      auth.completeSshLogin.bind(auth),
      {
        challengeId: challenge.challengeId,
        publicKeyOpenssh: identity.publicKeyLine,
        signature: identity.sign(blob),
        signatureFormat: 'ssh-ed25519',
      },
    );
    expect(replay.code).toBe(GrpcStatus.UNAUTHENTICATED);
  });

  it('issues a challenge for a key nobody has enrolled, and fails it identically', async () => {
    const stranger = sshIdentity();

    const challenge = await callUnary<BeginSshLoginRequest, BeginSshLoginResponse>(
      auth.beginSshLogin.bind(auth),
      { publicKeyOpenssh: stranger.publicKeyLine, fingerprint: '' },
    );
    expect(challenge.challengeId).toMatch(/^[0-9a-f-]{36}$/);

    const blob = buildSshChallengeBlob({
      nodeDomain: TEST_NODE_DOMAIN,
      challengeId: challenge.challengeId,
      nonce: Buffer.from(challenge.nonce),
      fingerprint: `SHA256:${createHash('sha256')
        .update(Buffer.from(stranger.publicKeyLine.split(' ')[1] ?? '', 'base64'))
        .digest('base64')
        .replace(/=+$/, '')}`,
      expiresAt: timestampToDate(challenge.expiresAt) ?? new Date(0),
    });

    const error = await expectRejection<CompleteSshLoginRequest, CompleteSshLoginResponse>(
      auth.completeSshLogin.bind(auth),
      {
        challengeId: challenge.challengeId,
        publicKeyOpenssh: stranger.publicKeyLine,
        signature: stranger.sign(blob),
        signatureFormat: 'ssh-ed25519',
      },
    );
    // An enrolled key with a bad signature and an unenrolled key with a good one are the
    // same answer — that is the no-enumeration requirement.
    expect(error.code).toBe(GrpcStatus.UNAUTHENTICATED);
    expect(error.details).toBe('SSH authentication failed.');
  });
});

describe('credential management (§165)', () => {
  it('lists credentials without any secret material', async () => {
    const handle = `creds${suffix()}`;
    const { session } = await register({ handle });

    const { credentials } = await callUnary<ListCredentialsRequest, ListCredentialsResponse>(
      auth.listCredentials.bind(auth),
      {},
      { accessToken: session?.accessToken ?? '' },
    );

    expect(credentials).toHaveLength(1);
    expect(credentials[0]?.type).toBe(CredentialType.CREDENTIAL_TYPE_PASSWORD);
    expect(JSON.stringify(credentials)).not.toContain('argon2');
    expect(Object.keys(credentials[0] ?? {})).not.toContain('secretHash');
  });

  it('adds an SSH key and refuses to revoke the last remaining credential', async () => {
    const handle = `lastcred${suffix()}`;
    const { session } = await register({ handle });
    const accessToken = session?.accessToken ?? '';
    const identity = sshIdentity();

    const added = await callUnary<AddCredentialRequest, AddCredentialResponse>(
      auth.addCredential.bind(auth),
      {
        type: CredentialType.CREDENTIAL_TYPE_SSH_PUBLIC_KEY,
        secret: identity.publicKeyLine,
        label: 'laptop',
      },
      { accessToken },
    );
    expect(added.credential?.identifier).toMatch(/^SHA256:/);
    expect(added.credential?.label).toBe('laptop');

    const listed = await callUnary<ListCredentialsRequest, ListCredentialsResponse>(
      auth.listCredentials.bind(auth),
      {},
      { accessToken },
    );
    expect(listed.credentials).toHaveLength(2);

    // Revoking down to one is allowed...
    await callUnary<RevokeCredentialRequest, RevokeCredentialResponse>(
      auth.revokeCredential.bind(auth),
      { id: added.credential?.id ?? '' },
      { accessToken },
    );

    // ...revoking the last one is not: an account must always retain a way in.
    const remaining = await callUnary<ListCredentialsRequest, ListCredentialsResponse>(
      auth.listCredentials.bind(auth),
      {},
      { accessToken },
    );
    const error = await expectRejection<RevokeCredentialRequest, RevokeCredentialResponse>(
      auth.revokeCredential.bind(auth),
      { id: remaining.credentials[0]?.id ?? '' },
      { accessToken },
    );
    expect(error.code).toBe(GrpcStatus.INVALID_ARGUMENT);
  });
});

describe('password reset (§39)', () => {
  it('resets through an emailed code and ends every existing session', async () => {
    const handle = `resetme${suffix()}`;
    const email = `${handle}@example.test`;
    const { session } = await register({ handle, email, password: 'the-old-password' });
    const userId = await userIdForHandle(handle);

    // A reset needs a *verified* recovery email (§165).
    await callUnary<VerifyEmailRequest, VerifyEmailResponse>(auth.verifyEmail.bind(auth), {
      code: await latestEmailedCode(userId, 'SEND_VERIFICATION_EMAIL'),
    });

    await callUnary<RequestPasswordResetRequest, RequestPasswordResetResponse>(
      auth.requestPasswordReset.bind(auth),
      { email },
    );
    const code = await latestEmailedCode(userId, 'SEND_PASSWORD_RESET_EMAIL');

    await callUnary<ResetPasswordRequest, ResetPasswordResponse>(auth.resetPassword.bind(auth), {
      code,
      newPassword: 'the-brand-new-password',
    });

    // Old password gone, new password works, old session dead.
    const oldPassword = await expectRejection<LoginRequest, LoginResponse>(auth.login.bind(auth), {
      emailOrHandle: handle,
      password: 'the-old-password',
    });
    expect(oldPassword.code).toBe(GrpcStatus.UNAUTHENTICATED);

    const { session: reborn } = await callUnary<LoginRequest, LoginResponse>(
      auth.login.bind(auth),
      { emailOrHandle: handle, password: 'the-brand-new-password' },
    );
    expect(reborn?.actor?.handle).toBe(handle);

    const staleRefresh = await expectRejection<RefreshSessionRequest, RefreshSessionResponse>(
      auth.refreshSession.bind(auth),
      { refreshToken: session?.refreshToken ?? '' },
    );
    expect(staleRefresh.code).toBe(GrpcStatus.UNAUTHENTICATED);
  });

  it('reports success for an address that has no account (§177)', async () => {
    await callUnary<RequestPasswordResetRequest, RequestPasswordResetResponse>(
      auth.requestPasswordReset.bind(auth),
      { email: `nobody-${suffix()}@example.test` },
    );
  });
});

describe('GitHub login', () => {
  it('answers UNIMPLEMENTED until Phase 6 (§176)', async () => {
    const error = await expectRejection(auth.beginGitHubLogin.bind(auth), {});
    expect(error.code).toBe(GrpcStatus.UNIMPLEMENTED);
  });
});
