import { createHash, randomBytes } from 'node:crypto';

import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import {
  Actor,
  AuthCode,
  Credential,
  Invite,
  OutboxJob,
  RefreshToken,
  User,
  type AuthCodePurpose,
} from '@patches/database';
import { DataSource, IsNull, MoreThan, type EntityManager } from 'typeorm';

import { AppError } from '../../common/errors/app-error.js';
import { AppConfigService } from '../../config/app-config.service.js';
import {
  type CredentialSummary,
  type CurrentSessionSummary,
  type SessionEnvelope,
  toActorSummary,
  toCredentialSummary,
} from './auth.dto.js';
import { PasswordHasher } from './password-hasher.service.js';
import { RateLimitService } from './rate-limit.service.js';
import {
  type IssuedSshChallenge,
  SshChallengeService,
  sshAuthenticationFailed,
} from './ssh-challenge.service.js';
import { parseOpenSshPublicKey } from './ssh/openssh.js';
import { type AccessTokenClaims, TokenService } from './token.service.js';
import {
  addCredentialInputSchema,
  codeInputSchema,
  loginInputSchema,
  normalizeEmail,
  normalizeHandle,
  parseInput,
  refreshTokenInputSchema,
  registerInputSchema,
  requestPasswordResetInputSchema,
  resetPasswordInputSchema,
  uuidInputSchema,
} from './validation.js';

/**
 * The application service behind `patches.v1.AuthService` (spec §33–§39, §165–§168).
 *
 * Everything transport-shaped stops at `AuthController`; everything persistence-shaped stops
 * at the repositories used here. What lives in this file is the part that is neither: the
 * rules about what a credential is allowed to do.
 */

/** Verification codes stay valid for a day; reset codes for an hour (a reset is urgent). */
const VERIFY_EMAIL_TTL_MS = 24 * 60 * 60 * 1000;
const RESET_PASSWORD_TTL_MS = 60 * 60 * 1000;

/**
 * 32 bytes, not the six digits `auth_codes` was originally sketched with: `VerifyEmail` and
 * `ResetPassword` carry a code and nothing else, so the lookup is global across every account
 * on the node. A six-digit space is ~10^6 wide and would be brute-forceable in aggregate no
 * matter how tightly one code's `attempts` are throttled.
 */
const AUTH_CODE_BYTES = 32;

export interface RegisterInput {
  handle: string;
  displayName: string;
  email?: string;
  password?: string;
  inviteCode?: string;
  sshPublicKey?: string;
}

export interface LoginInput {
  emailOrHandle: string;
  password: string;
}

export interface CompleteSshLoginInput {
  challengeId: string;
  publicKeyOpenssh: string;
  signature: Buffer;
  signatureFormat: string;
}

export interface AddCredentialInput {
  type: 'PASSWORD' | 'SSH_PUBLIC_KEY';
  secret: string;
  label?: string;
}

@Injectable()
export class AuthService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly config: AppConfigService,
    private readonly hasher: PasswordHasher,
    private readonly tokens: TokenService,
    private readonly sshChallenges: SshChallengeService,
    private readonly rateLimit: RateLimitService,
  ) {}

  // ---------------------------------------------------------------- registration

  /**
   * Creates an account with at least one credential (§165, §168) and returns a session.
   *
   * The whole thing is one transaction: an account that exists without its credential, or
   * with a verification code but no outbox job to deliver it, is worse than a failed
   * registration the user can simply retry.
   */
  async register(input: RegisterInput): Promise<SessionEnvelope> {
    const parsed = parseInput(registerInputSchema, input);
    const handleNormalized = normalizeHandle(parsed.handle);
    this.rateLimit.consume('register', handleNormalized);

    if (parsed.password === undefined && parsed.sshPublicKey === undefined) {
      throw AppError.validation(
        'Set a password or enrol an SSH public key — an account needs at least one way in.',
      );
    }

    if (this.config.inviteOnly && parsed.inviteCode === undefined) {
      throw AppError.validation('This node is invite-only: an invite code is required.');
    }

    // Parsed before the transaction opens: rejecting malformed key material is not worth a
    // database round trip, and Argon2id (below) is far too slow to hold a transaction across.
    const sshKey =
      parsed.sshPublicKey === undefined
        ? undefined
        : parseSshPublicKeyForEnrollment(parsed.sshPublicKey);
    const passwordHash =
      parsed.password === undefined ? null : await this.hasher.hash(parsed.password);

    const emailNormalized = parsed.email === undefined ? null : normalizeEmail(parsed.email);

    return this.dataSource.transaction(async (manager) => {
      if (this.config.inviteOnly && parsed.inviteCode !== undefined) {
        await consumeInvite(manager, parsed.inviteCode);
      }

      if (await manager.getRepository(Actor).existsBy({ handleNormalized })) {
        throw new AppError('HANDLE_TAKEN', 'That handle is already taken.');
      }

      const actor = await createActorAndUser(manager, {
        handle: parsed.handle,
        handleNormalized,
        displayName: parsed.displayName.length === 0 ? null : parsed.displayName,
        email: parsed.email ?? null,
        emailNormalized,
      });

      const credentials = manager.getRepository(Credential);
      if (passwordHash !== null) {
        await credentials.save(
          credentials.create({
            userId: actor.userId ?? '',
            type: 'PASSWORD',
            identifier: null,
            secretHash: passwordHash,
          }),
        );
      }
      if (sshKey !== undefined) {
        await credentials.save(
          credentials.create({
            userId: actor.userId ?? '',
            type: 'SSH_PUBLIC_KEY',
            identifier: sshKey.fingerprint,
            publicMaterial: sshKey.line,
            label: sshKey.comment ?? null,
            metadata: { algorithm: sshKey.algorithm },
          }),
        );
      }

      if (parsed.email !== undefined) {
        await this.issueEmailCode(manager, {
          userId: actor.userId ?? '',
          email: parsed.email,
          purpose: 'VERIFY_EMAIL',
        });
      }

      const tokens = await this.tokens.issueSession(manager, {
        userId: actor.userId ?? '',
        actorId: actor.id,
      });

      return this.envelope(tokens, actor, false);
    });
  }

  // ---------------------------------------------------------------- email codes

  /** Consumes a `VERIFY_EMAIL` code and marks the account's recovery email verified (§38). */
  async verifyEmail(rawCode: string): Promise<boolean> {
    const { code } = parseInput(codeInputSchema, { code: rawCode });
    this.rateLimit.consume('verify_email', hashCode(code).slice(0, 16));

    return this.dataSource.transaction(async (manager) => {
      const authCode = await this.consumeAuthCode(manager, code, 'VERIFY_EMAIL');
      await manager
        .getRepository(User)
        .update({ id: authCode.userId }, { emailVerifiedAt: new Date() });
      return true;
    });
  }

  /**
   * Re-sends the verification code for the *authenticated caller* only. There is no
   * unauthenticated resend by design: one that took an email address would confirm whether
   * that address has an account here (§177).
   */
  async resendVerification(claims: AccessTokenClaims): Promise<void> {
    this.rateLimit.consume('resend_verification', claims.userId);

    await this.dataSource.transaction(async (manager) => {
      const user = await manager.getRepository(User).findOne({ where: { id: claims.userId } });
      if (user === null || user.deletedAt !== null) throw sessionGone();
      if (user.recoveryEmail === null) {
        throw AppError.validation('This account has no recovery email address to verify.');
      }
      if (user.emailVerifiedAt !== null) return;

      await this.issueEmailCode(manager, {
        userId: user.id,
        email: user.recoveryEmail,
        purpose: 'VERIFY_EMAIL',
      });
    });
  }

  // ---------------------------------------------------------------- password login

  /** Password login (§33–§34, §168): handle or verified recovery email, plus a password. */
  async login(input: LoginInput): Promise<SessionEnvelope> {
    const parsed = parseInput(loginInputSchema, input);
    // Both a handle and an email address normalize by lowercasing, so one key covers both.
    const subject = normalizeEmail(parsed.emailOrHandle);
    this.rateLimit.consume('login', subject);

    return this.dataSource.transaction(async (manager) => {
      const user = await findUserByHandleOrEmail(manager, subject);
      const credential =
        user === null
          ? null
          : await manager.getRepository(Credential).findOne({
              where: { userId: user.id, type: 'PASSWORD', revokedAt: IsNull() },
            });

      // Always runs, even with no user and no credential: `verify(null, ...)` spends the same
      // Argon2id time as a real check, so response timing does not answer "does this account
      // exist?" (§166's uniform-response rule, applied to password login).
      const passwordMatches = await this.hasher.verify(credential?.secretHash, parsed.password);

      if (user === null || credential === null || !passwordMatches) throw invalidCredentials();
      if (user.deletedAt !== null || user.status !== 'ACTIVE') throw invalidCredentials();

      const actor = await requireActor(manager, user.actorId);
      await manager
        .getRepository(Credential)
        .update({ id: credential.id }, { lastUsedAt: new Date() });

      const tokens = await this.tokens.issueSession(manager, {
        userId: user.id,
        actorId: actor.id,
      });
      this.rateLimit.reset('login', subject);
      return this.envelope(tokens, actor, user.emailVerifiedAt !== null);
    });
  }

  // ---------------------------------------------------------------- sessions

  /** Rotates a refresh token (§36); reuse detection lives in `TokenService`. */
  async refreshSession(rawToken: string): Promise<SessionEnvelope> {
    const { refreshToken } = parseInput(refreshTokenInputSchema, { refreshToken: rawToken });

    return this.dataSource.transaction(async (manager) => {
      const { userId, sessionId } = await this.tokens.consumeRefreshToken(manager, refreshToken);

      const user = await manager.getRepository(User).findOne({ where: { id: userId } });
      if (user === null || user.deletedAt !== null || user.status !== 'ACTIVE') {
        // The account went away or was suspended while the session was alive: end the family
        // rather than handing out a fresh token for it.
        await this.tokens.revokeSession(manager, sessionId);
        throw sessionGone();
      }

      const actor = await requireActor(manager, user.actorId);
      const tokens = await this.tokens.issueSession(manager, {
        userId: user.id,
        actorId: actor.id,
        sessionId,
      });
      return this.envelope(tokens, actor, user.emailVerifiedAt !== null);
    });
  }

  /**
   * Revokes the family the given refresh token belongs to. An unknown token is *not* an
   * error: logout is idempotent, and reporting "no such token" would make this endpoint a
   * cheap oracle for testing stolen strings.
   */
  async logout(rawToken: string): Promise<void> {
    const { refreshToken } = parseInput(refreshTokenInputSchema, { refreshToken: rawToken });

    await this.dataSource.transaction(async (manager) => {
      const row = await manager
        .getRepository(RefreshToken)
        .findOne({ where: { tokenHash: hashCode(refreshToken) } });
      if (row === null) return;
      await this.tokens.revokeSession(manager, row.sessionId);
    });
  }

  async logoutAllSessions(claims: AccessTokenClaims): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      await this.tokens.revokeAllForUser(manager, claims.userId);
    });
  }

  async getCurrentSession(claims: AccessTokenClaims): Promise<CurrentSessionSummary> {
    const user = await this.dataSource
      .getRepository(User)
      .findOne({ where: { id: claims.userId } });
    if (user === null || user.deletedAt !== null) throw sessionGone();

    const actor = await requireActor(this.dataSource.manager, user.actorId);
    return {
      userId: user.id,
      sessionId: claims.sessionId,
      actor: toActorSummary(actor),
      expiresAt: claims.expiresAt,
      emailVerified: user.emailVerifiedAt !== null,
      node: this.config.nodeDomain,
    };
  }

  // ---------------------------------------------------------------- password reset

  /**
   * Requires a *verified* recovery email (§165): an account without one has no reset channel
   * by design. Always completes successfully — whether the address is registered is exactly
   * what this endpoint must not reveal.
   */
  async requestPasswordReset(rawEmail: string): Promise<void> {
    const parsed = requestPasswordResetInputSchema.safeParse({ email: rawEmail });
    if (!parsed.success) return;

    const emailNormalized = normalizeEmail(parsed.data.email);
    this.rateLimit.consume('password_reset', emailNormalized);

    await this.dataSource.transaction(async (manager) => {
      const user = await manager.getRepository(User).findOne({
        where: { recoveryEmailNormalized: emailNormalized, deletedAt: IsNull() },
      });
      if (user === null || user.emailVerifiedAt === null || user.recoveryEmail === null) return;

      await this.issueEmailCode(manager, {
        userId: user.id,
        email: user.recoveryEmail,
        purpose: 'RESET_PASSWORD',
      });
    });
  }

  /** Consumes a reset code, replaces the password credential, and ends every live session. */
  async resetPassword(rawCode: string, newPassword: string): Promise<void> {
    const parsed = parseInput(resetPasswordInputSchema, { code: rawCode, newPassword });
    // Hashed outside the transaction: Argon2id takes ~100ms by design and a transaction held
    // open across it would hold its row locks for the same duration.
    const secretHash = await this.hasher.hash(parsed.newPassword);

    await this.dataSource.transaction(async (manager) => {
      const authCode = await this.consumeAuthCode(manager, parsed.code, 'RESET_PASSWORD');
      const credentials = manager.getRepository(Credential);

      // Revoke-then-insert rather than update-in-place: the old hash stays as an audit record,
      // and the partial unique index on (user_id) where type='PASSWORD' and revoked_at is null
      // is what guarantees only one of them is live.
      await credentials.update(
        { userId: authCode.userId, type: 'PASSWORD', revokedAt: IsNull() },
        { revokedAt: new Date() },
      );
      await credentials.save(
        credentials.create({
          userId: authCode.userId,
          type: 'PASSWORD',
          identifier: null,
          secretHash,
        }),
      );

      // A password reset is the standard response to "my account was compromised", so every
      // existing session dies with it (§36).
      await this.tokens.revokeAllForUser(manager, authCode.userId);
    });
  }

  // ---------------------------------------------------------------- ssh login

  /** Always issues a challenge, enrolled key or not (§166's no-enumeration rule). */
  async beginSshLogin(fingerprintHint: string | undefined): Promise<IssuedSshChallenge> {
    this.rateLimit.consume('ssh_challenge', fingerprintHint ?? 'anonymous');
    return this.sshChallenges.begin(this.dataSource.manager);
  }

  async completeSshLogin(input: CompleteSshLoginInput): Promise<SessionEnvelope> {
    this.rateLimit.consume('ssh_complete', input.challengeId);

    // Consumed outside the transaction below, on purpose: if it were inside, a challenge whose
    // signature then failed to verify would have its `consumed_at` rolled back with the rest of
    // the transaction, and the challenge would be replayable — the exact property §166 requires
    // it not to have.
    const challenge = await this.sshChallenges.consume(this.dataSource.manager, input.challengeId);
    const key = this.sshChallenges.verifySignature({
      challenge,
      publicKeyOpenssh: input.publicKeyOpenssh,
      signature: input.signature,
      signatureFormat: input.signatureFormat,
    });

    return this.dataSource.transaction(async (manager) => {
      const credential = await manager.getRepository(Credential).findOne({
        where: { type: 'SSH_PUBLIC_KEY', identifier: key.fingerprint, revokedAt: IsNull() },
      });
      if (credential === null) throw sshAuthenticationFailed();

      const user = await manager.getRepository(User).findOne({ where: { id: credential.userId } });
      if (user === null || user.deletedAt !== null || user.status !== 'ACTIVE') {
        throw sshAuthenticationFailed();
      }

      const actor = await requireActor(manager, user.actorId);
      await manager
        .getRepository(Credential)
        .update({ id: credential.id }, { lastUsedAt: new Date() });

      const tokens = await this.tokens.issueSession(manager, {
        userId: user.id,
        actorId: actor.id,
      });
      return this.envelope(tokens, actor, user.emailVerifiedAt !== null);
    });
  }

  // ---------------------------------------------------------------- credentials

  async listCredentials(claims: AccessTokenClaims): Promise<CredentialSummary[]> {
    const credentials = await this.dataSource.getRepository(Credential).find({
      where: { userId: claims.userId, revokedAt: IsNull() },
      order: { createdAt: 'ASC' },
    });
    return credentials.map(toCredentialSummary);
  }

  /** Adds a credential to the *authenticated caller's* account (§165). */
  async addCredential(
    claims: AccessTokenClaims,
    input: AddCredentialInput,
  ): Promise<CredentialSummary> {
    const parsed = parseInput(addCredentialInputSchema, {
      secret: input.secret,
      ...(input.label === undefined ? {} : { label: input.label }),
    });

    if (input.type === 'PASSWORD') {
      const password = parseInput(resetPasswordInputSchema.shape.newPassword, parsed.secret);
      const secretHash = await this.hasher.hash(password);

      return this.dataSource.transaction(async (manager) => {
        const credentials = manager.getRepository(Credential);
        const existing = await credentials.existsBy({
          userId: claims.userId,
          type: 'PASSWORD',
          revokedAt: IsNull(),
        });
        if (existing) {
          throw AppError.validation(
            'This account already has a password. Change it with a password reset instead.',
          );
        }
        const saved = await credentials.save(
          credentials.create({
            userId: claims.userId,
            type: 'PASSWORD',
            identifier: null,
            secretHash,
            label: parsed.label ?? null,
          }),
        );
        return toCredentialSummary(saved);
      });
    }

    const key = parseSshPublicKeyForEnrollment(parsed.secret);
    const credentials = this.dataSource.getRepository(Credential);
    const alreadyEnrolled = await credentials.existsBy({
      type: 'SSH_PUBLIC_KEY',
      identifier: key.fingerprint,
      revokedAt: IsNull(),
    });
    if (alreadyEnrolled) {
      // §166's no-enumeration rule governs *unauthenticated* endpoints; here the caller is
      // authenticated and needs to be told why their key was refused. One key still
      // authenticates at most one account per node (§165).
      throw AppError.validation('That SSH key is already enrolled on this node.');
    }

    const saved = await credentials.save(
      credentials.create({
        userId: claims.userId,
        type: 'SSH_PUBLIC_KEY',
        identifier: key.fingerprint,
        publicMaterial: key.line,
        label: parsed.label ?? key.comment ?? null,
        metadata: { algorithm: key.algorithm },
      }),
    );
    return toCredentialSummary(saved);
  }

  /** Revoking the last active credential must fail — an account always retains a way in (§165). */
  async revokeCredential(claims: AccessTokenClaims, credentialId: string): Promise<void> {
    const id = parseInput(uuidInputSchema, credentialId);

    await this.dataSource.transaction(async (manager) => {
      const credentials = manager.getRepository(Credential);
      const credential = await credentials.findOne({
        where: { id, userId: claims.userId, revokedAt: IsNull() },
      });
      if (credential === null) throw AppError.validation('No such credential on this account.');

      const activeCount = await credentials.countBy({
        userId: claims.userId,
        revokedAt: IsNull(),
      });
      if (activeCount <= 1) {
        throw AppError.validation(
          'This is your only way to sign in. Add another credential before revoking this one.',
        );
      }

      await credentials.update({ id: credential.id }, { revokedAt: new Date() });
    });
  }

  // ---------------------------------------------------------------- internals

  private envelope(
    tokens: SessionEnvelope['tokens'],
    actor: Actor,
    emailVerified: boolean,
  ): SessionEnvelope {
    return { tokens, actor: toActorSummary(actor), emailVerified, node: this.config.nodeDomain };
  }

  /**
   * Writes a single-use code and the outbox job that delivers it **in the same transaction**
   * (§12–13): that is what makes "the code exists but the email was never queued" impossible.
   */
  private async issueEmailCode(
    manager: EntityManager,
    input: { userId: string; email: string; purpose: AuthCodePurpose },
  ): Promise<void> {
    const code = randomBytes(AUTH_CODE_BYTES).toString('base64url');
    const ttl = input.purpose === 'VERIFY_EMAIL' ? VERIFY_EMAIL_TTL_MS : RESET_PASSWORD_TTL_MS;

    const codes = manager.getRepository(AuthCode);
    const saved = await codes.save(
      codes.create({
        userId: input.userId,
        purpose: input.purpose,
        codeHash: hashCode(code),
        expiresAt: new Date(Date.now() + ttl),
      }),
    );

    const jobs = manager.getRepository(OutboxJob);
    await jobs.save(
      jobs.create({
        type:
          input.purpose === 'VERIFY_EMAIL'
            ? 'SEND_VERIFICATION_EMAIL'
            : 'SEND_PASSWORD_RESET_EMAIL',
        // The plaintext code lives here and nowhere else on the server — `auth_codes` stores
        // only its hash, so the worker cannot recover it from there. The job row is the
        // delivery vehicle; sweeping completed job payloads is `CLEAN_EXPIRED_TOKENS`' problem.
        payload: { userId: input.userId, authCodeId: saved.id, email: input.email, code },
        // One send per code row (`docs/architecture/jobs.md` §7).
        idempotencyKey: `${input.purpose}:${saved.id}`,
      }),
    );
  }

  /** Finds and atomically consumes an unexpired, unused code of the given purpose. */
  private async consumeAuthCode(
    manager: EntityManager,
    code: string,
    purpose: AuthCodePurpose,
  ): Promise<AuthCode> {
    const codes = manager.getRepository(AuthCode);
    const now = new Date();
    const row = await codes.findOne({ where: { codeHash: hashCode(code), purpose } });
    if (row === null) throw invalidCode();

    const result = await codes.update(
      { id: row.id, consumedAt: IsNull(), expiresAt: MoreThan(now) },
      { consumedAt: now },
    );
    // Zero rows means it was already consumed, or it expired — one message for both, since a
    // client can do the same thing about either.
    if (result.affected !== 1) throw invalidCode();
    return row;
  }
}

// -------------------------------------------------------------------- helpers

/** SHA-256 hex. Used for refresh tokens, auth codes and invite codes — all high-entropy
 * strings, for which a slow KDF adds latency and no security (unlike a user's password). */
function hashCode(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

interface EnrollableSshKey {
  fingerprint: string;
  algorithm: string;
  comment: string | undefined;
  /** Canonical `<algorithm> <base64>` line, without the comment. */
  line: string;
}

function parseSshPublicKeyForEnrollment(text: string): EnrollableSshKey {
  let key;
  try {
    key = parseOpenSshPublicKey(text);
  } catch (error) {
    throw AppError.validation(
      'That does not look like an OpenSSH public key (expected e.g. "ssh-ed25519 AAAA...").',
      { cause: error },
    );
  }
  return {
    fingerprint: key.fingerprint,
    algorithm: key.algorithm,
    comment: key.comment,
    // Stored without the comment so the same key enrolled from two machines is byte-identical.
    line: `${key.algorithm} ${key.blob.toString('base64')}`,
  };
}

/**
 * `users.actor_id` and `actors.user_id` point at each other and neither FK is deferrable, so
 * the actor is inserted with a null `user_id`, then the user, then the actor is back-filled —
 * the same three steps `@patches/testkit`'s factory uses.
 */
async function createActorAndUser(
  manager: EntityManager,
  input: {
    handle: string;
    handleNormalized: string;
    displayName: string | null;
    email: string | null;
    emailNormalized: string | null;
  },
): Promise<Actor> {
  const actors = manager.getRepository(Actor);
  const actor = await actors.save(
    actors.create({
      handle: input.handle,
      handleNormalized: input.handleNormalized,
      displayName: input.displayName,
      isLocal: true,
      userId: null,
    }),
  );

  const users = manager.getRepository(User);
  const user = await users.save(
    users.create({
      recoveryEmail: input.email,
      recoveryEmailNormalized: input.emailNormalized,
      emailVerifiedAt: null,
      status: 'ACTIVE',
      actorId: actor.id,
    }),
  );

  await actors.update({ id: actor.id }, { userId: user.id });
  actor.userId = user.id;
  return actor;
}

/** Claims one use of an invite code (§38), or rejects it. */
async function consumeInvite(manager: EntityManager, code: string): Promise<void> {
  const invites = manager.getRepository(Invite);
  const invite = await invites.findOne({ where: { codeHash: hashCode(code) } });
  const now = new Date();

  if (
    invite === null ||
    invite.revokedAt !== null ||
    (invite.expiresAt !== null && invite.expiresAt.getTime() <= now.getTime())
  ) {
    throw AppError.validation('That invite code is not valid.');
  }

  // Conditional increment rather than read-modify-write: two registrations racing the last
  // use of a shared invite must not both succeed.
  const result = await invites
    .createQueryBuilder()
    .update(Invite)
    .set({ uses: () => '"uses" + 1' })
    .where('id = :id', { id: invite.id })
    .andWhere('uses < max_uses')
    .andWhere('revoked_at IS NULL')
    .execute();

  if (result.affected !== 1) throw AppError.validation('That invite code has already been used.');
}

async function findUserByHandleOrEmail(
  manager: EntityManager,
  subject: string,
): Promise<User | null> {
  const byEmail = await manager
    .getRepository(User)
    .findOne({ where: { recoveryEmailNormalized: subject, deletedAt: IsNull() } });
  if (byEmail !== null) return byEmail;

  const actor = await manager
    .getRepository(Actor)
    .findOne({ where: { handleNormalized: subject, deletedAt: IsNull() } });
  if (actor === null || actor.userId === null) return null;

  return manager.getRepository(User).findOne({ where: { id: actor.userId, deletedAt: IsNull() } });
}

async function requireActor(manager: EntityManager, actorId: string): Promise<Actor> {
  const actor = await manager.getRepository(Actor).findOne({ where: { id: actorId } });
  if (actor === null) {
    // `users.actor_id` is NOT NULL with ON DELETE RESTRICT, so this is unreachable short of
    // manual database surgery — reported as an internal error rather than papered over.
    throw AppError.internal();
  }
  return actor;
}

function invalidCredentials(): AppError {
  return new AppError('AUTH_INVALID_CREDENTIALS', 'Incorrect handle, email address or password.');
}

function invalidCode(): AppError {
  return AppError.validation('That code is invalid or has expired.');
}

function sessionGone(): AppError {
  return new AppError(
    'AUTH_SESSION_EXPIRED',
    'Your session is no longer valid. Please sign in again.',
  );
}
