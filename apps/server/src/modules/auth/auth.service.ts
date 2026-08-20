import { randomBytes } from 'node:crypto';

import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import {
  Actor,
  ActorPrivacyPrefs,
  AuthCode,
  Credential,
  Invite,
  Notification,
  OutboxJob,
  RefreshToken,
  User,
  type AuthCodePurpose,
} from '@patches/database';
import type {
  AuthenticationResponseJSON,
  RegistrationResponseJSON,
  VerifiedAuthenticationResponse,
  VerifiedRegistrationResponse,
} from '@simplewebauthn/server';
import { DataSource, IsNull, MoreThan, type EntityManager } from 'typeorm';

import { getRequestContext } from '../../common/context/request-context.js';
import { AppError } from '../../common/errors/app-error.js';
import { AppConfigService } from '../../config/app-config.service.js';
import {
  type CredentialSummary,
  type CurrentSessionSummary,
  type SessionEnvelope,
  toActorSummary,
  toCredentialSummary,
} from './auth.dto.js';
import { GitHubDeviceFlowService } from './github-device-flow.service.js';
import { GitHubLoginAttemptsService } from './github-login-attempts.service.js';
import { PasskeyChallengeService } from './passkey-challenge.service.js';
import { PasskeyVerifierService } from './passkey-verifier.service.js';
import { PasswordHasher } from './password-hasher.service.js';
import { RateLimitService } from './rate-limit.service.js';
import {
  type IssuedSshChallenge,
  SshChallengeService,
  sshAuthenticationFailed,
  sshEnrollmentProofRequired,
} from './ssh-challenge.service.js';
import { parseOpenSshPublicKey } from './ssh/openssh.js';
import {
  type AccessTokenClaims,
  hashRefreshToken,
  reuseSessionIdFrom,
  TokenService,
} from './token.service.js';
import {
  addCredentialInputSchema,
  codeInputSchema,
  completePasskeyLoginInputSchema,
  completePasskeyRegistrationInputSchema,
  loginInputSchema,
  normalizeEmail,
  normalizeHandle,
  opaqueCodeSchema,
  parseInput,
  recoveryLoginInputSchema,
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

/** P15-003: 10 codes minted together by `GenerateRecoveryCodes`, matching the proto RPC's own
 * documented count. */
const RECOVERY_CODE_COUNT = 10;

/** 20 base32 characters (Crockford alphabet, no padding) = 100 bits of entropy, grouped
 * `XXXXX-XXXXX-XXXXX-XXXXX` for human transcription — plenty under Argon2id verification
 * (which is what actually rate-limits guessing, same as a password), short enough to type
 * from a printed backup. Excludes visually ambiguous characters (`I`, `L`, `O`, `U`), which
 * the Crockford alphabet already drops. 13 random bytes (104 bits) comfortably covers the 100
 * bits consumed below; the leftover 4 bits are simply never read. */
const RECOVERY_CODE_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const RECOVERY_CODE_CHAR_COUNT = 20;
const RECOVERY_CODE_ENTROPY_BYTES = 13;

function generateRecoveryCode(): string {
  const bytes = randomBytes(RECOVERY_CODE_ENTROPY_BYTES);
  let bits = 0n;
  for (const byte of bytes) bits = (bits << 8n) | BigInt(byte);

  let chars = '';
  for (let i = 0; i < RECOVERY_CODE_CHAR_COUNT; i += 1) {
    chars = RECOVERY_CODE_ALPHABET[Number(bits & 0x1fn)] + chars;
    bits >>= 5n;
  }
  return chars.match(/.{1,5}/g)?.join('-') ?? chars;
}

/**
 * `pg_advisory_xact_lock` key for serialising the invite-only bootstrap decision below
 * (A-040). Arbitrary but fixed for the life of the schema — advisory locks are keyed by a
 * bare `bigint` with no namespace of their own, so this just needs to not collide with any
 * other advisory lock this codebase takes (there are none today; grep for
 * `pg_advisory` before reusing it for something else).
 */
const BOOTSTRAP_LOCK_KEY = 7461001;

/**
 * P14-010/P14-025 (spec §197.1, §204.2): the privacy notice version stamped for a registration
 * that carries no (or a zero/default) `privacyNoticeVersionAcknowledged` — i.e. every node
 * whose `REQUIRE_PRIVACY_ACK` policy is off, and any pre-P14-025 client. Spec §197.1 requires
 * the client to show the notice summary *before the account exists*, so even without an
 * explicit field the notice at whatever version this node currently publishes has necessarily
 * already been shown; this is the fallback that keeps that implicit acknowledgement honest.
 * When `REQUIRE_PRIVACY_ACK=true`, `register()` instead requires and stamps the caller's real
 * `privacyNoticeVersionAcknowledged`, validated against `AppConfigService.privacyNoticeVersion`
 * — see the check in `register()` below.
 */
const REGISTRATION_PRIVACY_NOTICE_VERSION = 0;

export interface RegisterInput {
  handle: string;
  displayName: string;
  email?: string;
  password?: string;
  inviteCode?: string;
  sshPublicKey?: string;
  /** §204.2. `0`/omitted means "not acknowledged" — see `REGISTRATION_PRIVACY_NOTICE_VERSION`
   * for what gets stamped in that case. */
  privacyNoticeVersionAcknowledged?: number;
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

export interface BeginGitHubLoginResult {
  deviceCode: string;
  userCode: string;
  verificationUri: string;
  interval: number;
  expiresAt: Date;
}

export type GitHubLoginPollResult =
  | { status: 'PENDING' }
  | { status: 'SLOW_DOWN' }
  | { status: 'EXPIRED' }
  | { status: 'DENIED' }
  | { status: 'COMPLETE'; session: SessionEnvelope };

/** Possession proof from a prior `beginSshEnrollment` call (B-021). Required when `type ===
 * 'SSH_PUBLIC_KEY'`; ignored for `PASSWORD`. */
export interface SshEnrollmentProofInput {
  challengeId: string;
  signature: Buffer;
  signatureFormat: string;
}

export interface AddCredentialInput {
  type: 'PASSWORD' | 'SSH_PUBLIC_KEY';
  secret: string;
  label?: string;
  sshProof?: SshEnrollmentProofInput;
}

/** P15-002: what `AuthService.GetAuthPolicy` (proto) publishes. */
export interface AuthPolicy {
  passwordAuthMode: 'off' | 'optional' | 'required';
}

/** P15-003: the plaintext codes are returned exactly once, here — nothing after this call ever
 * has them again, only their Argon2id hashes. */
export interface RecoveryCodesResult {
  codes: readonly string[];
  generatedAt: Date;
}

export interface RecoveryLoginInput {
  emailOrHandle: string;
  code: string;
}

/** P15-004: `CompletePasskeyRegistration`'s own vocabulary — `label` mirrors
 * `AddCredentialInput.label`. */
export interface CompletePasskeyRegistrationInput {
  credentialJson: string;
  label?: string;
}

export interface CompletePasskeyLoginInput {
  credentialJson: string;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly config: AppConfigService,
    private readonly hasher: PasswordHasher,
    private readonly tokens: TokenService,
    private readonly sshChallenges: SshChallengeService,
    private readonly rateLimit: RateLimitService,
    private readonly githubFlow: GitHubDeviceFlowService,
    private readonly githubAttempts: GitHubLoginAttemptsService,
    private readonly passkeyChallenges: PasskeyChallengeService,
    private readonly passkeyVerifier: PasskeyVerifierService,
  ) {}

  // ---------------------------------------------------------------- policy

  /** Always unauthenticated, always cheap (P15-002) — see the RPC's own doc comment in
   * `auth.proto` for why clients must call this before rendering password UI. */
  getAuthPolicy(): AuthPolicy {
    return { passwordAuthMode: this.config.passwordAuthMode };
  }

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
    // `handleNormalized` is chosen by the caller — a fresh one every attempt never re-hits the
    // same bucket — so the peer budget is what actually bounds unthrottled Argon2id CPU below
    // (spec §102 review finding).
    this.rateLimit.consumePeer('register', getRequestContext()?.peer);
    this.rateLimit.consume('register', handleNormalized);
    await this.rateLimit.consumeDistributed('register', handleNormalized);

    if (parsed.password === undefined && parsed.sshPublicKey === undefined) {
      throw AppError.validation(
        'Set a password or enrol an SSH public key — an account needs at least one way in.',
      );
    }

    // P15-002: a node with PASSWORD_AUTH=off refuses the credential type entirely, not just a
    // particular password — checked before the (expensive) Argon2id hash below.
    if (parsed.password !== undefined && this.config.passwordAuthMode === 'off') {
      throw passwordAuthDisabled();
    }

    // §204.2: when this node requires an explicit privacy-notice acknowledgement, Register
    // itself enforces it (rather than only gating *later* writes, like `RequirePrivacyAckGuard`
    // does) — an account that exists but can never post because it registered against a stale
    // notice version is a worse experience than a clear rejection up front.
    if (
      this.config.requirePrivacyAck &&
      parsed.privacyNoticeVersionAcknowledged !== this.config.privacyNoticeVersion
    ) {
      throw new AppError(
        'PRIVACY_NOTICE_NOT_ACKNOWLEDGED',
        'You must acknowledge this node’s current privacy notice to register.',
      );
    }
    // Stamped as the account's initial acknowledgement below — the real client-sent version
    // once one is present, else the implicit-acknowledgement fallback (see the constant's doc).
    const privacyNoticeVersionAcknowledged =
      parsed.privacyNoticeVersionAcknowledged > 0
        ? parsed.privacyNoticeVersionAcknowledged
        : REGISTRATION_PRIVACY_NOTICE_VERSION;

    // The invite-only/no-code combination is either an error or bootstrap registration
    // (P1-013, below) — which one it is depends on whether any account exists yet, so it
    // can't be decided until inside the transaction.

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
      const existingActor = await manager
        .getRepository(Actor)
        .findOne({ where: { handleNormalized } });
      if (existingActor !== null) {
        // §45 idempotency: a retry of the *same* registration (same handle, same
        // client_request_id) that also proves it holds the credential it enrolled gets a
        // fresh session instead of HANDLE_TAKEN. Anything else is just a taken handle —
        // the request id alone must never unlock an account (unauthenticated caller).
        const replay = await this.matchesCompletedRegistration(manager, existingActor, {
          clientRequestId: parsed.clientRequestId,
          password: parsed.password,
          sshFingerprint: sshKey?.fingerprint,
        });
        if (replay === null) throw new AppError('HANDLE_TAKEN', 'That handle is already taken.');
        const tokens = await this.tokens.issueSession(manager, {
          userId: replay.userId,
          actorId: existingActor.id,
        });
        return this.envelope(tokens, existingActor, false);
      }

      // Invite handling comes after the §45 replay check above: a retried registration
      // re-sends an invite that was consumed by the first attempt.
      if (this.config.inviteOnly) {
        if (parsed.inviteCode !== undefined) {
          await consumeInvite(manager, parsed.inviteCode);
        } else {
          // Bootstrap (P1-013): an invite-only node has no invite-minting admin until its
          // first account exists, so the very first registration is let through without one.
          // A plain `COUNT` inside a READ COMMITTED transaction takes no row lock at all — two
          // concurrent invite-less registrations on a fresh node would each read 0 and both
          // bypass the invite requirement (A-040). The `pg_advisory_xact_lock` below forces
          // them to run one at a time: the first to acquire it sees the pre-lock state (no
          // accounts) and proceeds; the second blocks until the first's transaction commits or
          // rolls back, then sees the first account and is correctly rejected. The lock is
          // released automatically at transaction end (`_xact_` variant), so nothing here needs
          // an explicit unlock.
          await manager.query('SELECT pg_advisory_xact_lock($1)', [BOOTSTRAP_LOCK_KEY]);
          const hasAnyAccount = (await manager.getRepository(User).count()) > 0;
          if (hasAnyAccount) {
            throw AppError.validation('This node is invite-only: an invite code is required.');
          }
          this.logger.warn(
            `bootstrap registration: allowing handle "${handleNormalized}" to register without ` +
              'an invite because this node has no accounts yet.',
          );
        }
      }

      const actor = await createActorAndUser(manager, {
        handle: parsed.handle,
        handleNormalized,
        displayName: parsed.displayName.length === 0 ? null : parsed.displayName,
        email: parsed.email ?? null,
        emailNormalized,
        clientRequestId: parsed.clientRequestId ?? null,
        privacyNoticeVersionAcknowledged,
      });
      // `createActorAndUser` always back-fills `actor.userId` before returning — `?? ''` here
      // would silently write an empty-string `userId` instead of failing loudly if that ever
      // stopped being true.
      const userId = requireUserId(actor);

      const credentials = manager.getRepository(Credential);
      if (passwordHash !== null) {
        await credentials.save(
          credentials.create({
            userId,
            type: 'PASSWORD',
            identifier: null,
            secretHash: passwordHash,
          }),
        );
      }
      if (sshKey !== undefined) {
        await credentials.save(
          credentials.create({
            userId,
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
          userId,
          email: parsed.email,
          purpose: 'VERIFY_EMAIL',
        });
      }

      const tokens = await this.tokens.issueSession(manager, {
        userId,
        actorId: actor.id,
      });

      return this.envelope(tokens, actor, false);
    });
  }

  /**
   * Returns the user id when `actor` is the result of this very registration being retried
   * (matching `client_request_id`) AND the caller can present the credential enrolled by it;
   * `null` otherwise. Argon2id runs at most once here (same cost as a login attempt).
   */
  private async matchesCompletedRegistration(
    manager: EntityManager,
    actor: Actor,
    proof: {
      clientRequestId: string | undefined;
      password: string | undefined;
      sshFingerprint: string | undefined;
    },
  ): Promise<{ userId: string } | null> {
    if (
      proof.clientRequestId === undefined ||
      actor.clientRequestId === null ||
      actor.clientRequestId !== proof.clientRequestId ||
      actor.userId === null ||
      actor.deletedAt !== null
    ) {
      return null;
    }
    const credentials = manager.getRepository(Credential);
    if (proof.password !== undefined) {
      const credential = await credentials.findOne({
        where: { userId: actor.userId, type: 'PASSWORD', revokedAt: IsNull() },
      });
      if (await this.hasher.verify(credential?.secretHash, proof.password)) {
        return { userId: actor.userId };
      }
      return null;
    }
    if (proof.sshFingerprint !== undefined) {
      const enrolled = await credentials.existsBy({
        userId: actor.userId,
        type: 'SSH_PUBLIC_KEY',
        identifier: proof.sshFingerprint,
        revokedAt: IsNull(),
      });
      return enrolled ? { userId: actor.userId } : null;
    }
    return null;
  }

  // ---------------------------------------------------------------- email codes

  /** Consumes a `VERIFY_EMAIL` code and marks the account's recovery email verified (§38). */
  async verifyEmail(rawCode: string): Promise<boolean> {
    const { code } = parseInput(codeInputSchema, { code: rawCode });
    this.rateLimit.consume('verify_email', hashCode(code).slice(0, 16));
    await this.rateLimit.consumeDistributed('verify_email', hashCode(code).slice(0, 16));

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
    await this.rateLimit.consumeDistributed('resend_verification', claims.userId);

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
    // P15-002: `Login` is entirely the password credential — a node with PASSWORD_AUTH=off
    // rejects it outright, before even parsing. Clients must have hidden the password field
    // already (`GetAuthPolicy`); reaching this is a client bug or a stale cache, not a
    // legitimate attempt.
    if (this.config.passwordAuthMode === 'off') throw passwordAuthDisabled();

    const parsed = parseInput(loginInputSchema, input);
    // Both a handle and an email address normalize by lowercasing, so one key covers both.
    const subject = normalizeEmail(parsed.emailOrHandle);
    this.rateLimit.consumePeer('login', getRequestContext()?.peer);
    this.rateLimit.consume('login', subject);
    await this.rateLimit.consumeDistributed('login', subject);

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
      return this.envelope(tokens, actor, user.emailVerifiedAt !== null);
    });
  }

  // ---------------------------------------------------------------- sessions

  /** Rotates a refresh token (§36); reuse detection lives in `TokenService`. */
  async refreshSession(rawToken: string): Promise<SessionEnvelope> {
    const { refreshToken } = parseInput(refreshTokenInputSchema, { refreshToken: rawToken });

    try {
      return await this.dataSource.transaction(async (manager) => {
        const { userId, sessionId } = await this.tokens.consumeRefreshToken(manager, refreshToken);

        const user = await manager.getRepository(User).findOne({ where: { id: userId } });
        if (user === null || user.deletedAt !== null || user.status !== 'ACTIVE') {
          // The account went away or was suspended while the session was alive: end the
          // family rather than handing out a fresh token for it.
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
    } catch (error) {
      const reuseSessionId = reuseSessionIdFrom(error);
      if (reuseSessionId !== undefined) {
        // Only safe to run now that the transaction above has actually rolled back: see the
        // comment on `TokenService.consumeRefreshToken`'s reuse branch for why running this
        // *inside* that transaction would self-deadlock across two connections.
        await this.dataSource.transaction((manager) =>
          this.tokens.revokeSession(manager, reuseSessionId),
        );
      }
      throw error;
    }
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
    this.rateLimit.consumePeer('password_reset', getRequestContext()?.peer);
    this.rateLimit.consume('password_reset', emailNormalized);
    await this.rateLimit.consumeDistributed('password_reset', emailNormalized);

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

  /**
   * Consumes a reset code, replaces the password credential, and ends every live session.
   *
   * The code is validated **before** anything is hashed (spec §102 review finding): an
   * unauthenticated caller who could make this method spend ~100ms of Argon2id CPU on a
   * garbage code, with no throttle ahead of it, would have a cheap CPU-exhaustion lever. Now
   * it is both throttled and ordered so a bad code never reaches the hasher at all.
   */
  async resetPassword(rawCode: string, newPassword: string): Promise<void> {
    const parsed = parseInput(resetPasswordInputSchema, { code: rawCode, newPassword });
    this.rateLimit.consumePeer('password_reset', getRequestContext()?.peer);
    // The code itself is high-entropy and single-use, so this budget is not really about
    // guessing it — it bounds how many times one peer can make this endpoint touch the
    // database at all before Argon2id ever runs.
    this.rateLimit.consume('password_reset', `code:${hashCode(parsed.code).slice(0, 16)}`);
    await this.rateLimit.consumeDistributed(
      'password_reset',
      `code:${hashCode(parsed.code).slice(0, 16)}`,
    );

    const userId = await this.dataSource.transaction(async (manager) => {
      const authCode = await this.consumeAuthCode(manager, parsed.code, 'RESET_PASSWORD');
      return authCode.userId;
    });

    // Hashed only once the code is confirmed valid, and outside any transaction: Argon2id
    // takes ~100ms by design and a transaction held open across it would hold its row locks
    // for the same duration. The trade-off is that a crash between here and the write below
    // leaves the code consumed with no password change applied — recoverable by requesting a
    // fresh code, and strictly better than spending Argon2id time on an unvalidated request.
    const secretHash = await this.hasher.hash(parsed.newPassword);

    await this.dataSource.transaction(async (manager) => {
      const credentials = manager.getRepository(Credential);

      // Revoke-then-insert rather than update-in-place: the old hash stays as an audit record,
      // and the partial unique index on (user_id) where type='PASSWORD' and revoked_at is null
      // is what guarantees only one of them is live.
      await credentials.update(
        { userId, type: 'PASSWORD', revokedAt: IsNull() },
        { revokedAt: new Date() },
      );
      await credentials.save(
        credentials.create({
          userId,
          type: 'PASSWORD',
          identifier: null,
          secretHash,
        }),
      );

      // A password reset is the standard response to "my account was compromised", so every
      // existing session dies with it (§36).
      await this.tokens.revokeAllForUser(manager, userId);
    });
  }

  // ---------------------------------------------------------------- ssh login

  /**
   * Always issues a challenge, enrolled key or not (§166's no-enumeration rule).
   *
   * Rate-limited on peer only: the request carries nothing else trustworthy to key on — a
   * caller-supplied fingerprint is exactly the kind of attacker-chosen value spec §102's
   * review flagged as a limiter that would never actually fire (a fresh fingerprint every
   * attempt never re-hits the same bucket).
   */
  async beginSshLogin(): Promise<IssuedSshChallenge> {
    this.rateLimit.consumePeer('ssh_challenge', getRequestContext()?.peer);
    await this.rateLimit.consumeDistributedPeer('ssh_challenge', getRequestContext()?.peer);
    return this.sshChallenges.begin(this.dataSource.manager);
  }

  /**
   * Rate-limited on peer only, not `challengeId` — a challenge is single-use by construction,
   * so a per-challenge-id bucket can never see a second attempt and never fires (spec §102
   * review finding).
   */
  async completeSshLogin(input: CompleteSshLoginInput): Promise<SessionEnvelope> {
    this.rateLimit.consumePeer('ssh_complete', getRequestContext()?.peer);

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

  /**
   * Issues an SSH credential-enrollment challenge (B-021), bound to the *authenticated*
   * caller and the fingerprint of the key they intend to enroll — unlike `beginSshLogin`,
   * enumeration is not a concern here (the caller already proved who they are), so the
   * challenge is bound up front rather than re-derived at completion.
   *
   * Rate-limited on both peer and subject (the caller's own `userId`) — this endpoint carries
   * a trustworthy subject, unlike anonymous `beginSshLogin` (see its own doc comment).
   */
  async beginSshEnrollment(
    claims: AccessTokenClaims,
    publicKeyOpenssh: string,
  ): Promise<IssuedSshChallenge> {
    this.rateLimit.consumePeer('ssh_challenge', getRequestContext()?.peer);
    await this.rateLimit.consumeDistributedPeer('ssh_challenge', getRequestContext()?.peer);
    this.rateLimit.consume('ssh_challenge', `enroll:${claims.userId}`);
    await this.rateLimit.consumeDistributed('ssh_challenge', `enroll:${claims.userId}`);

    const key = parseSshPublicKeyForEnrollment(publicKeyOpenssh);
    return this.sshChallenges.beginEnrollment(this.dataSource.manager, {
      userId: claims.userId,
      fingerprint: key.fingerprint,
    });
  }

  // ---------------------------------------------------------------- GitHub device flow

  /**
   * Starts GitHub's OAuth device flow (spec §167, §176). `callerUserId` is set only when the
   * request carried a valid access token — an authenticated caller is *linking* GitHub to
   * their own account; an anonymous caller can only log in with an already-linked one (see
   * {@link completeGitHubLogin}). Schema-only until a `GITHUB_CLIENT_ID` is configured.
   */
  async beginGitHubLogin(callerUserId: string | undefined): Promise<BeginGitHubLoginResult> {
    this.rateLimit.consumePeer('github_begin_login', getRequestContext()?.peer);
    const clientId = this.config.githubClientId;
    if (clientId === undefined) throw gitHubNotConfigured();

    const issued = await this.githubFlow.beginDeviceFlow(clientId);
    this.githubAttempts.begin({
      deviceCode: issued.deviceCode,
      expiresAt: issued.expiresAt,
      intervalMs: issued.intervalSeconds * 1000,
      callerUserId: callerUserId ?? null,
    });

    return {
      deviceCode: issued.deviceCode,
      userCode: issued.userCode,
      verificationUri: issued.verificationUri,
      interval: issued.intervalSeconds,
      expiresAt: issued.expiresAt,
    };
  }

  /**
   * Polls GitHub for a completed device-flow login. Honors both GitHub's own `interval`
   * (tracked in {@link GitHubLoginAttemptsService}, extended further on a `slow_down`
   * response) and this node's per-peer poll budget.
   */
  async pollGitHubLogin(rawDeviceCode: string): Promise<GitHubLoginPollResult> {
    this.rateLimit.consumePeer('github_poll_login', getRequestContext()?.peer);
    const clientId = this.config.githubClientId;
    if (clientId === undefined) throw gitHubNotConfigured();

    const deviceCode = parseInput(opaqueCodeSchema, rawDeviceCode);
    const attempt = this.githubAttempts.get(deviceCode);
    if (attempt === undefined) return { status: 'EXPIRED' };

    if (!this.githubAttempts.tryConsumePoll(deviceCode)) return { status: 'SLOW_DOWN' };

    const result = await this.githubFlow.pollAccessToken(clientId, deviceCode);
    switch (result.kind) {
      case 'PENDING':
        return { status: 'PENDING' };
      case 'SLOW_DOWN':
        // GitHub's own convention: back off by another 5 seconds on every slow_down.
        this.githubAttempts.extendInterval(deviceCode, 5_000);
        return { status: 'SLOW_DOWN' };
      case 'EXPIRED':
        this.githubAttempts.consume(deviceCode);
        return { status: 'EXPIRED' };
      case 'DENIED':
        this.githubAttempts.consume(deviceCode);
        return { status: 'DENIED' };
      case 'SUCCESS': {
        this.githubAttempts.consume(deviceCode);
        // The access token is read exactly once, right here, and never stored (§167).
        const numericAccountId = await this.githubFlow.fetchNumericAccountId(result.accessToken);
        const session = await this.completeGitHubLogin(numericAccountId, attempt.callerUserId);
        return { status: 'COMPLETE', session };
      }
    }
  }

  /**
   * Links or logs in a GITHUB credential by its numeric account id (spec §167 — never the
   * login name, which GitHub lets an account holder change and someone else re-register).
   */
  private async completeGitHubLogin(
    githubAccountId: string,
    callerUserId: string | null,
  ): Promise<SessionEnvelope> {
    return this.dataSource.transaction(async (manager) => {
      const credentials = manager.getRepository(Credential);
      const existing = await credentials.findOne({
        where: { type: 'GITHUB', identifier: githubAccountId, revokedAt: IsNull() },
      });

      let userId: string;
      if (callerUserId !== null) {
        // AddCredential semantics (spec §167's "linking ... MUST require an authenticated
        // Patches session"): link to the caller's own account, unless this GitHub account is
        // already linked to a *different* one.
        if (existing !== null && existing.userId !== callerUserId) {
          throw AppError.validation(
            'This GitHub account is already linked to a different Patches account.',
          );
        }
        if (existing === null) {
          await credentials.save(
            credentials.create({
              userId: callerUserId,
              type: 'GITHUB',
              identifier: githubAccountId,
            }),
          );
        } else {
          await credentials.update({ id: existing.id }, { lastUsedAt: new Date() });
        }
        userId = callerUserId;
      } else {
        // Anonymous poll: log in with an already-linked GitHub credential. GitHub alone never
        // creates a new Patches account (spec §167 — GitHub is a credential, not an identity).
        if (existing === null) {
          throw AppError.validation(
            'No Patches account is linked to this GitHub account. Sign in and link GitHub ' +
              'from your account settings first.',
          );
        }
        await credentials.update({ id: existing.id }, { lastUsedAt: new Date() });
        userId = existing.userId;
      }

      const user = await manager.getRepository(User).findOne({ where: { id: userId } });
      if (user === null || user.deletedAt !== null || user.status !== 'ACTIVE') {
        throw invalidCredentials();
      }

      const actor = await requireActor(manager, user.actorId);
      const tokens = await this.tokens.issueSession(manager, {
        userId: user.id,
        actorId: actor.id,
      });
      return this.envelope(tokens, actor, user.emailVerifiedAt !== null);
    });
  }

  // ---------------------------------------------------------------- passkeys

  /**
   * Registration ceremony start (P15-004, ADR 0022): authenticated, so the caller's own
   * existing passkeys can be listed in `excludeCredentials` (stops the platform silently
   * re-registering one that's already enrolled). Rate-limited like `beginSshEnrollment`: peer
   * plus the caller's own `userId`, which is trustworthy here (unlike the anonymous login half
   * below).
   */
  async beginPasskeyRegistration(claims: AccessTokenClaims): Promise<{ optionsJson: string }> {
    this.rateLimit.consumePeer('passkey_challenge', getRequestContext()?.peer);
    await this.rateLimit.consumeDistributedPeer('passkey_challenge', getRequestContext()?.peer);
    this.rateLimit.consume('passkey_challenge', `register:${claims.userId}`);
    await this.rateLimit.consumeDistributed('passkey_challenge', `register:${claims.userId}`);

    const actor = await requireActor(this.dataSource.manager, claims.actorId);
    const existingPasskeys = await this.dataSource.getRepository(Credential).find({
      where: { userId: claims.userId, type: 'PASSKEY', revokedAt: IsNull() },
    });

    const options = await this.passkeyVerifier.generateRegistrationOptions({
      rpID: this.rpId(),
      rpName: this.config.instanceName,
      // An opaque byte encoding of `claims.userId`, not the UUID's binary form — the library
      // never round-trips this value back into anything Patches reads, so its only requirement
      // is "stable and unique per user" (§3 of `docs/research/simplewebauthn.md`).
      userID: new TextEncoder().encode(claims.userId),
      userName: actor.handle,
      userDisplayName: actor.displayName ?? actor.handle,
      excludeCredentials: existingPasskeys
        .filter(
          (credential): credential is Credential & { identifier: string } =>
            credential.identifier !== null,
        )
        .map((credential) => ({ id: credential.identifier })),
    });

    await this.passkeyChallenges.issue(this.dataSource.manager, {
      challenge: options.challenge,
      purpose: 'REGISTRATION',
      boundUserId: claims.userId,
    });

    return { optionsJson: JSON.stringify(options) };
  }

  /**
   * Verifies the browser's registration ceremony response and enrolls a `PASSKEY` credential
   * (P15-004, ADR 0022). Every failure — unparseable payload, unknown/expired/replayed
   * challenge, a challenge bound to a *different* user, or a cryptographic verification
   * failure — is the same {@link passkeyRegistrationInvalid}; this endpoint is authenticated,
   * so unlike SSH enrollment's uniform posture the reason doesn't need hiding, but there also
   * isn't a more specific failure worth distinguishing on the wire.
   */
  async completePasskeyRegistration(
    claims: AccessTokenClaims,
    input: CompletePasskeyRegistrationInput,
  ): Promise<CredentialSummary> {
    const parsed = parseInput(completePasskeyRegistrationInputSchema, {
      credentialJson: input.credentialJson,
      ...(input.label === undefined ? {} : { label: input.label }),
    });

    this.rateLimit.consumePeer('passkey_complete', getRequestContext()?.peer);
    this.rateLimit.consume('passkey_complete', `register:${claims.userId}`);
    await this.rateLimit.consumeDistributed('passkey_complete', `register:${claims.userId}`);

    const response = parseWebAuthnJson<RegistrationResponseJSON>(
      parsed.credentialJson,
      passkeyRegistrationInvalid,
    );

    let challengeValue: string;
    try {
      challengeValue = this.passkeyVerifier.decodeClientDataChallenge(
        response.response.clientDataJSON,
      );
    } catch (error) {
      throw passkeyRegistrationInvalid(error);
    }

    // Consumed before verification, like `SshChallengeService.consume`/`completeSshLogin`: if
    // verification then failed, a rollback that restored `consumed_at` would make the challenge
    // replayable.
    const challenge = await this.passkeyChallenges.consume(this.dataSource.manager, {
      challenge: challengeValue,
      purpose: 'REGISTRATION',
    });
    if (challenge === null || challenge.boundUserId !== claims.userId) {
      throw passkeyRegistrationInvalid();
    }

    let verification: VerifiedRegistrationResponse;
    try {
      verification = await this.passkeyVerifier.verifyRegistrationResponse({
        response,
        expectedChallenge: challengeValue,
        expectedOrigin: this.config.publicOrigin,
        expectedRPID: this.rpId(),
      });
    } catch (error) {
      throw passkeyRegistrationInvalid(error);
    }
    if (!verification.verified || verification.registrationInfo === undefined) {
      throw passkeyRegistrationInvalid();
    }

    const {
      credential: verified,
      credentialDeviceType,
      credentialBackedUp,
    } = verification.registrationInfo;

    return this.dataSource.transaction(async (manager) => {
      const credentials = manager.getRepository(Credential);
      const alreadyEnrolled = await credentials.existsBy({
        type: 'PASSKEY',
        identifier: verified.id,
        revokedAt: IsNull(),
      });
      if (alreadyEnrolled) {
        throw AppError.validation('That passkey is already enrolled.');
      }

      const saved = await credentials.save(
        credentials.create({
          userId: claims.userId,
          type: 'PASSKEY',
          identifier: verified.id,
          // Raw COSE public key bytes; the library does not encode this for storage (§6 of
          // `docs/research/simplewebauthn.md`).
          publicMaterial: Buffer.from(verified.publicKey).toString('base64'),
          label: parsed.label ?? null,
          // An inline literal (not a `PasskeyCredentialMetadata`-typed variable) so it matches
          // `Credential.metadata`'s `Record<string, unknown> | null` column type structurally,
          // with no cast; {@link passkeyMetadata} reads it back with the named type.
          metadata: {
            counter: verified.counter,
            transports: verified.transports,
            deviceType: credentialDeviceType,
            backedUp: credentialBackedUp,
          },
        }),
      );
      return toCredentialSummary(saved);
    });
  }

  /**
   * Discoverable-credential ("usernameless") login ceremony start (P15-004, ADR 0022): always
   * issues a challenge with no `allowCredentials` — the credential response itself identifies
   * the account at {@link completePasskeyLogin}. Rate-limited on peer only, same reasoning as
   * `beginSshLogin`: there is no trustworthy subject to key a second bucket on yet.
   */
  async beginPasskeyLogin(): Promise<{ optionsJson: string }> {
    this.rateLimit.consumePeer('passkey_challenge', getRequestContext()?.peer);
    await this.rateLimit.consumeDistributedPeer('passkey_challenge', getRequestContext()?.peer);

    const options = await this.passkeyVerifier.generateAuthenticationOptions({
      rpID: this.rpId(),
    });

    await this.passkeyChallenges.issue(this.dataSource.manager, {
      challenge: options.challenge,
      purpose: 'LOGIN',
      boundUserId: null,
    });

    return { optionsJson: JSON.stringify(options) };
  }

  /**
   * Verifies the browser's authentication ceremony response and returns a session (P15-004,
   * ADR 0022) — the passkey analogue of `completeSshLogin`. The authenticator's own reported
   * use counter is decoded independently of cryptographic verification (see
   * `PasskeyVerifierService.readAuthenticatorCounter`'s doc comment) so a sign-count regression
   * — `storedCounter > 0 && newCounter <= storedCounter`, the exact condition
   * `docs/research/simplewebauthn.md` §5 documents as this library's own compromise signal —
   * can be flagged with a `SECURITY` notification even though the underlying verification call
   * would reject it too, indistinguishably from any other failure.
   *
   * Every failure is the same {@link passkeyLoginFailed} (§166's no-enumeration rule, exactly
   * as `completeSshLogin` applies it): unparseable payload, unknown/expired/replayed challenge,
   * no matching credential, a regressed counter, or a cryptographic verification failure.
   */
  async completePasskeyLogin(input: CompletePasskeyLoginInput): Promise<SessionEnvelope> {
    const parsed = parseInput(completePasskeyLoginInputSchema, input);
    this.rateLimit.consumePeer('passkey_complete', getRequestContext()?.peer);

    const response = parseWebAuthnJson<AuthenticationResponseJSON>(
      parsed.credentialJson,
      passkeyLoginFailed,
    );

    let challengeValue: string;
    let newCounter: number;
    try {
      challengeValue = this.passkeyVerifier.decodeClientDataChallenge(
        response.response.clientDataJSON,
      );
      newCounter = this.passkeyVerifier.readAuthenticatorCounter(
        response.response.authenticatorData,
      );
    } catch (error) {
      throw passkeyLoginFailed(error);
    }

    const challenge = await this.passkeyChallenges.consume(this.dataSource.manager, {
      challenge: challengeValue,
      purpose: 'LOGIN',
    });
    if (challenge === null) throw passkeyLoginFailed();

    const credential = await this.dataSource.getRepository(Credential).findOne({
      where: { type: 'PASSKEY', identifier: response.id, revokedAt: IsNull() },
    });
    if (credential === null || credential.publicMaterial === null) throw passkeyLoginFailed();

    const credentialId = credential.id;
    const userId = credential.userId;
    const publicKeyBase64 = credential.publicMaterial;
    const metadata = passkeyMetadata(credential.metadata);
    const storedCounter = metadata.counter;

    // A plain (non-transactional) read: nothing below needs it inside a transaction, and
    // keeping it out of one is what lets the `SECURITY` notification below commit
    // independently of the login it's reporting on failing.
    const user = await this.dataSource.getRepository(User).findOne({ where: { id: userId } });
    if (user === null || user.deletedAt !== null || user.status !== 'ACTIVE') {
      throw passkeyLoginFailed();
    }
    const actor = await requireActor(this.dataSource.manager, user.actorId);

    if (storedCounter > 0 && newCounter <= storedCounter) {
      // Written in its own transaction, not the one issuing (or, here, refusing) the session:
      // the caller must still see the *login* fail, but that failure throws past this method's
      // return, which would otherwise roll back an insert made in the same transaction —
      // exactly the outcome ADR 0022 does not want (a real clone attempt leaving no record).
      await this.dataSource.transaction(async (manager) => {
        const notifications = manager.getRepository(Notification);
        await notifications.save(
          notifications.create({
            recipientActorId: actor.id,
            type: 'SECURITY',
            actorId: null,
            postId: null,
            conversationId: null,
            communityId: null,
          }),
        );
      });
      throw passkeyLoginFailed();
    }

    let verification: VerifiedAuthenticationResponse;
    try {
      verification = await this.passkeyVerifier.verifyAuthenticationResponse({
        response,
        expectedChallenge: challengeValue,
        expectedOrigin: this.config.publicOrigin,
        expectedRPID: this.rpId(),
        credential: {
          id: response.id,
          publicKey: new Uint8Array(Buffer.from(publicKeyBase64, 'base64')),
          counter: storedCounter,
          ...(metadata.transports === undefined ? {} : { transports: metadata.transports }),
        },
      });
    } catch (error) {
      throw passkeyLoginFailed(error);
    }
    if (!verification.verified) throw passkeyLoginFailed();

    return this.dataSource.transaction(async (manager) => {
      await manager.getRepository(Credential).update(
        { id: credentialId },
        {
          lastUsedAt: new Date(),
          // Same "inline literal, not a named-type variable" reasoning as the registration
          // write above.
          metadata: {
            counter: newCounter,
            transports: metadata.transports,
            deviceType: metadata.deviceType,
            backedUp: metadata.backedUp,
          },
        },
      );

      const tokens = await this.tokens.issueSession(manager, {
        userId: user.id,
        actorId: actor.id,
      });
      return this.envelope(tokens, actor, user.emailVerifiedAt !== null);
    });
  }

  /** Hostname-only RP id (ADR 0022): `PUBLIC_ORIGIN` minus scheme/port, matching what the
   * browser's WebAuthn implementation itself derives from the page origin. */
  private rpId(): string {
    return new URL(this.config.publicOrigin).hostname;
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
      // P15-002: same node-wide refusal `register()`/`login()` apply.
      if (this.config.passwordAuthMode === 'off') throw passwordAuthDisabled();

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

    // A friendly `VALIDATION_ERROR` for a malformed key line before anything security-critical
    // runs — `consumeEnrollmentProof` below re-parses the same text and is the source of truth
    // for the fingerprint actually enrolled, but its own failures are all the uniform
    // `sshEnrollmentProofInvalid()` (B-021), which is the wrong message for "not an OpenSSH key
    // at all".
    parseSshPublicKeyForEnrollment(parsed.secret);

    this.rateLimit.consumePeer('ssh_complete', getRequestContext()?.peer);

    if (input.sshProof === undefined) throw sshEnrollmentProofRequired();

    // B-021: proves the caller actually holds the private key for `parsed.secret`, against
    // the challenge issued by `beginSshEnrollment` for this same user and fingerprint. Every
    // failure mode (missing/expired/replayed/wrong-user/wrong-key/bad signature) is the
    // uniform `sshEnrollmentProofInvalid()`.
    const key = await this.sshChallenges.consumeEnrollmentProof(this.dataSource.manager, {
      userId: claims.userId,
      challengeId: input.sshProof.challengeId,
      publicKeyOpenssh: parsed.secret,
      signature: input.sshProof.signature,
      signatureFormat: input.sshProof.signatureFormat,
    });

    const credentials = this.dataSource.getRepository(Credential);
    const alreadyEnrolled = await credentials.existsBy({
      type: 'SSH_PUBLIC_KEY',
      identifier: key.fingerprint,
      revokedAt: IsNull(),
    });
    if (alreadyEnrolled) {
      // §166's no-enumeration rule governs *unauthenticated* endpoints; here the caller is
      // authenticated (and has just proven possession of the key) and needs to be told why
      // their key was refused. One key still authenticates at most one account per node
      // (§165).
      throw AppError.validation('That SSH key is already enrolled on this node.');
    }

    const saved = await credentials.save(
      credentials.create({
        userId: claims.userId,
        type: 'SSH_PUBLIC_KEY',
        identifier: key.fingerprint,
        // Stored without the comment so the same key enrolled from two machines is
        // byte-identical (mirrors `parseSshPublicKeyForEnrollment`'s `line`).
        publicMaterial: `${key.algorithm} ${key.blob.toString('base64')}`,
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

  /**
   * Mints a fresh set of `RECOVERY_CODE_COUNT` single-use codes for the caller, revoking any
   * generated previously (P15-003) — regenerating always replaces the whole set rather than
   * topping it up, so a user is never unsure which of two printed batches is still valid.
   * Plaintext codes exist only in this call's return value; only their Argon2id hash (the same
   * `PasswordHasher` a `PASSWORD` credential uses) is ever stored.
   */
  async generateRecoveryCodes(claims: AccessTokenClaims): Promise<RecoveryCodesResult> {
    const generatedAt = new Date();
    const codes = Array.from({ length: RECOVERY_CODE_COUNT }, () => generateRecoveryCode());
    // Sequential, not `Promise.all`: `PasswordHasher`'s OWASP-baseline Argon2id cost is tuned
    // assuming one hash runs at a time — ten concurrent hashes would multiply its memory cost
    // by ten for the life of this call.
    const hashes: string[] = [];
    for (const code of codes) hashes.push(await this.hasher.hash(code));

    await this.dataSource.transaction(async (manager) => {
      const credentials = manager.getRepository(Credential);
      await credentials.update(
        { userId: claims.userId, type: 'RECOVERY_CODE', revokedAt: IsNull() },
        { revokedAt: generatedAt },
      );
      await credentials.save(
        hashes.map((secretHash, index) =>
          credentials.create({
            userId: claims.userId,
            type: 'RECOVERY_CODE',
            identifier: null,
            secretHash,
            label: `Recovery code ${String(index + 1)} of ${String(RECOVERY_CODE_COUNT)}`,
          }),
        ),
      );
    });

    return { codes, generatedAt };
  }

  // ---------------------------------------------------------------- recovery login

  /**
   * Consumes one single-use recovery code and returns a session, the same way `login()` does
   * for a password (P15-003) — including the same uniform-failure posture (§166's no-
   * enumeration rule): a bad handle, a bad code, and an account with zero remaining codes all
   * fail identically with `invalidCredentials()`. Unlike password login, the number of
   * Argon2id verifications this call performs varies with how many codes are still active
   * (0–10) — a real, documented gap in *timing* uniformity that a fixed one-hash-per-attempt
   * design (password/SSH) doesn't have. Always running ten verifications regardless would
   * close it, but at real cost to an already-slow (Argon2id), already-rare flow; not worth it
   * for what a handle/email lookup already leaks via `AUTH_INVALID_CREDENTIALS`'s existence
   * elsewhere in this same service.
   */
  async recoveryLogin(input: RecoveryLoginInput): Promise<SessionEnvelope> {
    const parsed = parseInput(recoveryLoginInputSchema, input);
    const subject = normalizeEmail(parsed.emailOrHandle);
    this.rateLimit.consumePeer('recovery_login', getRequestContext()?.peer);
    this.rateLimit.consume('recovery_login', subject);
    await this.rateLimit.consumeDistributed('recovery_login', subject);

    return this.dataSource.transaction(async (manager) => {
      const user = await findUserByHandleOrEmail(manager, subject);
      if (user === null || user.deletedAt !== null || user.status !== 'ACTIVE') {
        // Same timing-uniformity reasoning `login()` documents: spend one real Argon2id
        // verification even when there is no user (and so nothing real to compare against).
        await this.hasher.verify(undefined, parsed.code);
        throw invalidCredentials();
      }

      const activeCodes = await manager.getRepository(Credential).find({
        where: { userId: user.id, type: 'RECOVERY_CODE', revokedAt: IsNull() },
      });

      let matched: Credential | undefined;
      for (const candidate of activeCodes) {
        if (await this.hasher.verify(candidate.secretHash, parsed.code)) {
          matched = candidate;
          break;
        }
      }
      if (matched === undefined) throw invalidCredentials();

      const actor = await requireActor(manager, user.actorId);
      const usedAt = new Date();
      await manager
        .getRepository(Credential)
        .update({ id: matched.id }, { revokedAt: usedAt, lastUsedAt: usedAt });

      // P15-003: a redeemed recovery code is significant enough that the account holder should
      // find out even though they were the one who triggered it — written directly here rather
      // than through `NotificationsService` (`NotificationsModule` already imports `AuthModule`
      // for `AuthGuard`; the reverse import would be circular) and with `actorId: null`, the
      // same "no other actor" convention `MODERATION` notifications use.
      const notifications = manager.getRepository(Notification);
      await notifications.save(
        notifications.create({
          recipientActorId: actor.id,
          type: 'SECURITY',
          actorId: null,
          postId: null,
          conversationId: null,
          communityId: null,
        }),
      );

      const tokens = await this.tokens.issueSession(manager, {
        userId: user.id,
        actorId: actor.id,
      });
      return this.envelope(tokens, actor, user.emailVerifiedAt !== null);
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

/**
 * SHA-256 hex, for auth codes and invite codes — all high-entropy strings, for which a slow
 * KDF adds latency and no security (unlike a user's password). This is the exact algorithm
 * `TokenService.hashRefreshToken` already implements for refresh tokens; reused by name here
 * rather than a second copy of the same three lines.
 */
const hashCode = hashRefreshToken;

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
    clientRequestId: string | null;
    privacyNoticeVersionAcknowledged: number;
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
      clientRequestId: input.clientRequestId,
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

  // P14-010/P14-025 (spec §197.1, §204.2): every new actor gets a privacy-prefs row from
  // birth, with the registration's notice acknowledgement already stamped (see
  // `RegisterInput.privacyNoticeVersionAcknowledged`'s doc and `register()`'s validation of
  // it above). Additive only: nothing above this reads or depends on this row existing, so a
  // registration whose privacy-prefs insert somehow failed would still leave a usable account
  // — it doesn't, since this is still inside the caller's transaction, but the ordering keeps
  // the change a pure addition to the existing flow rather than a rewrite of it.
  const privacyPrefs = manager.getRepository(ActorPrivacyPrefs);
  await privacyPrefs.save(
    privacyPrefs.create({
      actorId: actor.id,
      discoverable: true,
      indexable: true,
      showInLocalFeed: true,
      locked: false,
      privacyNoticeVersion: input.privacyNoticeVersionAcknowledged,
      privacyNoticeAcknowledgedAt: new Date(),
    }),
  );

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

/**
 * `Actor.userId` is nullable in the schema because the row briefly exists without one during
 * `createActorAndUser`'s insert-then-back-fill dance — never after it returns. Asserting here
 * rather than defaulting to `''` is what makes a future regression in that dance a loud
 * `INTERNAL_ERROR` instead of a credential silently written against an empty `userId`.
 */
function requireUserId(actor: Actor): string {
  if (actor.userId === null) throw AppError.internal();
  return actor.userId;
}

function invalidCredentials(): AppError {
  return new AppError('AUTH_INVALID_CREDENTIALS', 'Incorrect handle, email address or password.');
}

/** P15-002: `AppConfigService.passwordAuthMode === 'off'`. */
function passwordAuthDisabled(): AppError {
  return new AppError('PASSWORD_AUTH_DISABLED', 'This node does not accept password sign-in.');
}

/** GitHub login RPCs answer this until `GITHUB_CLIENT_ID` is configured (spec §176) — never
 * a fake pending status a client would poll forever. */
function gitHubNotConfigured(): AppError {
  return new AppError('NOT_IMPLEMENTED', 'GitHub login is not available on this node yet.');
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

/** `credentials.metadata` for a `PASSKEY` row (P15-004) — non-secret WebAuthn bookkeeping, per
 * the entity's own doc comment. `counter` is what {@link AuthService.completePasskeyLogin}'s
 * sign-count-regression check compares against. */
interface PasskeyCredentialMetadata {
  counter: number;
  transports?: string[] | undefined;
  deviceType: 'singleDevice' | 'multiDevice';
  backedUp: boolean;
}

/** Reads a `PASSKEY` credential's metadata defensively rather than casting the whole `jsonb`
 * blob: a `counter` that is missing or not a number defaults to `0`, the same value a freshly
 * registered, never-yet-authenticated passkey would have. */
function passkeyMetadata(value: Record<string, unknown> | null): PasskeyCredentialMetadata {
  const counter = typeof value?.counter === 'number' ? value.counter : 0;
  const transports =
    Array.isArray(value?.transports) &&
    value.transports.every((transport): transport is string => typeof transport === 'string')
      ? value.transports
      : undefined;
  const deviceType = value?.deviceType === 'multiDevice' ? 'multiDevice' : 'singleDevice';
  const backedUp = value?.backedUp === true;
  return { counter, transports, deviceType, backedUp };
}

/** Parses an opaque `credentialJson`/`optionsJson` payload (P15-004): both RPCs carry WebAuthn
 * ceremony payloads as JSON strings rather than a field-by-field proto mirror (see
 * `BeginPasskeyRegistrationResponse`'s doc comment in `auth.proto`), so a malformed one is
 * exactly as uniform a failure as a bad signature. */
function parseWebAuthnJson<T>(text: string, onError: (cause?: unknown) => AppError): T {
  try {
    return JSON.parse(text) as T;
  } catch (error) {
    throw onError(error);
  }
}

/** Every `CompletePasskeyRegistration` failure — unparseable payload, unknown/expired/replayed
 * challenge, a challenge bound to a different user, or a cryptographic verification failure. */
function passkeyRegistrationInvalid(cause?: unknown): AppError {
  return AppError.validation('Passkey registration could not be verified.', { cause });
}

/** The single response every `CompletePasskeyLogin` failure produces (§166's no-enumeration
 * rule, exactly as {@link sshAuthenticationFailed} applies it to SSH login). */
function passkeyLoginFailed(cause?: unknown): AppError {
  return new AppError('AUTH_INVALID_CREDENTIALS', 'Passkey authentication failed.', { cause });
}
