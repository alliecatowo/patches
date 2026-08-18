import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';

import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { RefreshToken } from '@patches/database';
import {
  errors as joseErrors,
  importPKCS8,
  importSPKI,
  type JWTPayload,
  jwtVerify,
  SignJWT,
} from 'jose';
import { DataSource, IsNull, type EntityManager } from 'typeorm';

import { AppError } from '../../common/errors/app-error.js';
import { AppConfigService } from '../../config/app-config.service.js';

/**
 * Session issuance, rotation and revocation (spec §35–§36, ADR 0010).
 *
 * Two very different tokens live here on purpose:
 *
 *  - the **access token** is a short-lived EdDSA-signed JWT, verified statelessly on every
 *    request, carrying only `sub`/`actor_id`/`session_id`;
 *  - the **refresh token** is opaque, 32 CSPRNG bytes with no structure at all, stored only
 *    as a SHA-256 hash and rotated on every use, with reuse of an already-rotated token
 *    revoking its entire family (§36).
 *
 * The refresh token is not a JWT precisely because it must be revocable: a stateless token
 * cannot be taken back, and "log out all sessions" has to actually mean something.
 */

/** jose's algorithm identifier for Ed25519 signatures. */
const JWT_ALGORITHM = 'EdDSA';

/**
 * Audience claim. Constant rather than configurable: it distinguishes "a Patches access
 * token" from any other EdDSA JWT that might reach this verifier, while the *issuer* claim
 * (the node domain) is what distinguishes one node from another (§163, §169).
 */
const JWT_AUDIENCE = 'patches-api';

/** 256 bits of entropy — well past any brute-force concern, and a 43-character string. */
const REFRESH_TOKEN_BYTES = 32;

export interface AccessTokenClaims {
  userId: string;
  actorId: string;
  sessionId: string;
  expiresAt: Date;
}

export interface IssuedTokens {
  accessToken: string;
  accessExpiresAt: Date;
  /** Plaintext, returned to the client exactly once and never stored (§36). */
  refreshToken: string;
  refreshExpiresAt: Date;
  sessionId: string;
}

export interface IssueSessionInput {
  userId: string;
  actorId: string;
  /** Continue an existing token family (a rotation); omit to start a new one (a login). */
  sessionId?: string;
  userAgent?: string | null;
}

/** SHA-256 hex of a refresh token. Fast on purpose: the token is already high-entropy, so a
 * slow KDF would buy nothing and cost every refresh a hundred milliseconds. */
export function hashRefreshToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

/** Constant-time comparison of two hex digests of equal length. */
export function refreshTokenHashesMatch(a: string, b: string): boolean {
  const left = Buffer.from(a, 'hex');
  const right = Buffer.from(b, 'hex');
  return left.length === right.length && timingSafeEqual(left, right);
}

@Injectable()
export class TokenService {
  // Typed off jose's own return types: `CryptoKey` is a global *value* under
  // `types: ["node"]` but not a global type, so naming it directly does not compile.
  private signingKey: ReturnType<typeof importPKCS8> | undefined;
  private verificationKey: ReturnType<typeof importSPKI> | undefined;

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly config: AppConfigService,
  ) {}

  /**
   * Issues an access token and a fresh refresh token, writing the refresh token's hash on
   * `manager` — which must be the caller's transactional manager when the session is issued
   * alongside other writes (registration, password reset).
   */
  async issueSession(manager: EntityManager, input: IssueSessionInput): Promise<IssuedTokens> {
    const now = new Date();
    const sessionId = input.sessionId ?? randomUUID();

    const accessExpiresAt = new Date(now.getTime() + this.config.accessTokenTtlSeconds * 1000);
    const refreshExpiresAt = new Date(now.getTime() + this.config.refreshTokenTtlSeconds * 1000);

    const refreshToken = randomBytes(REFRESH_TOKEN_BYTES).toString('base64url');
    const tokens = manager.getRepository(RefreshToken);
    await tokens.save(
      tokens.create({
        userId: input.userId,
        sessionId,
        tokenHash: hashRefreshToken(refreshToken),
        expiresAt: refreshExpiresAt,
        userAgent: input.userAgent ?? null,
      }),
    );

    const accessToken = await new SignJWT({
      actor_id: input.actorId,
      session_id: sessionId,
    })
      .setProtectedHeader({ alg: JWT_ALGORITHM })
      // A unique id per token. Not used for revocation (that is the refresh family's job) —
      // it exists so two tokens issued for the same session within the same second are not
      // byte-identical, which matters for correlating a specific token in logs.
      .setJti(randomUUID())
      .setSubject(input.userId)
      .setIssuer(this.config.nodeDomain)
      .setAudience(JWT_AUDIENCE)
      .setIssuedAt(now)
      .setExpirationTime(accessExpiresAt)
      .sign(await this.privateKey());

    return { accessToken, accessExpiresAt, refreshToken, refreshExpiresAt, sessionId };
  }

  /**
   * Validates and consumes a presented refresh token, returning the family it belongs to.
   *
   * Reuse detection (§36): a token that has already been rotated away, or that loses the race
   * to mark itself used, means the plaintext exists in more than one place. The only safe
   * response is to assume the copy is the attacker's and revoke every token in the family —
   * including whichever one the legitimate client is holding, which is why this ends a
   * session rather than merely failing a request.
   */
  async consumeRefreshToken(
    manager: EntityManager,
    presented: string,
  ): Promise<{ userId: string; sessionId: string }> {
    const tokens = manager.getRepository(RefreshToken);
    const row = await tokens.findOne({ where: { tokenHash: hashRefreshToken(presented) } });

    // An unknown token gets the same answer as an expired one: whether a given string was
    // ever a valid refresh token is not something a caller is entitled to learn.
    if (row === null) throw sessionExpired();

    if (row.usedAt !== null || row.revokedAt !== null) {
      await this.revokeFamilyOutOfBand(row.sessionId);
      throw sessionExpired();
    }

    if (row.expiresAt.getTime() <= Date.now()) throw sessionExpired();

    // Conditional update rather than a read-then-write: two concurrent refreshes with the
    // same token must not both succeed, and exactly one of them can set `used_at` here.
    const result = await tokens.update(
      { id: row.id, usedAt: IsNull(), revokedAt: IsNull() },
      { usedAt: new Date() },
    );
    if (result.affected !== 1) {
      await this.revokeFamilyOutOfBand(row.sessionId);
      throw sessionExpired();
    }

    return { userId: row.userId, sessionId: row.sessionId };
  }

  /**
   * Revokes a family in its **own** transaction.
   *
   * Reuse detection happens inside the caller's transaction, and that transaction is about to
   * be rolled back by the error thrown immediately after — which would take the revocation
   * with it and leave the leaked family alive. The separate transaction is what makes the
   * revocation survive the failure it is a response to. It touches only rows the caller holds
   * no locks on (the conditional `UPDATE` above matched nothing), so it cannot deadlock
   * against its own caller.
   */
  private async revokeFamilyOutOfBand(sessionId: string): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      await this.revokeSession(manager, sessionId);
    });
  }

  /** Revokes every token in one family — logout, or reuse detection. */
  async revokeSession(manager: EntityManager, sessionId: string): Promise<void> {
    await manager
      .getRepository(RefreshToken)
      .update({ sessionId, revokedAt: IsNull() }, { revokedAt: new Date() });
  }

  /** Revokes every session an account holds (`LogoutAllSessions`, password reset). */
  async revokeAllForUser(manager: EntityManager, userId: string): Promise<void> {
    await manager
      .getRepository(RefreshToken)
      .update({ userId, revokedAt: IsNull() }, { revokedAt: new Date() });
  }

  /**
   * Verifies an access token's signature, issuer, audience and expiry, and returns its claims.
   * Deliberately loads nothing from the database — that is the entire value of a stateless
   * access token, and the 15-minute lifetime is what bounds the staleness it buys.
   */
  async verifyAccessToken(token: string): Promise<AccessTokenClaims> {
    let payload: JWTPayload;
    try {
      ({ payload } = await jwtVerify(token, await this.publicKey(), {
        algorithms: [JWT_ALGORITHM],
        issuer: this.config.nodeDomain,
        audience: JWT_AUDIENCE,
      }));
    } catch (error) {
      if (error instanceof joseErrors.JWTExpired) throw sessionExpired();
      throw new AppError('AUTH_INVALID_CREDENTIALS', 'Invalid access token.', { cause: error });
    }

    const { sub, exp } = payload;
    // Custom claims are `unknown` by construction: a JWT payload is attacker-supplied JSON
    // until each field has been checked.
    const actorId: unknown = payload['actor_id'];
    const sessionId: unknown = payload['session_id'];
    if (
      typeof sub !== 'string' ||
      typeof actorId !== 'string' ||
      typeof sessionId !== 'string' ||
      typeof exp !== 'number'
    ) {
      throw new AppError('AUTH_INVALID_CREDENTIALS', 'Invalid access token.');
    }

    return { userId: sub, actorId, sessionId, expiresAt: new Date(exp * 1000) };
  }

  private async privateKey(): ReturnType<typeof importPKCS8> {
    this.signingKey ??= importPKCS8(
      requireKey(this.config.jwtPrivateKeyPem, 'JWT_PRIVATE_KEY'),
      JWT_ALGORITHM,
    );
    return this.signingKey;
  }

  private async publicKey(): ReturnType<typeof importSPKI> {
    this.verificationKey ??= importSPKI(
      requireKey(this.config.jwtPublicKeyPem, 'JWT_PUBLIC_KEY'),
      JWT_ALGORITHM,
    );
    return this.verificationKey;
  }
}

function requireKey(pem: string | undefined, name: string): string {
  if (pem === undefined) {
    // A configuration fault, not a client error: it surfaces as INTERNAL with the reason in
    // the server log, which is exactly where an operator will look.
    throw new Error(`${name} is not configured. Run \`pnpm keys:generate\` and set it in .env.`);
  }
  return pem;
}

function sessionExpired(): AppError {
  return new AppError('AUTH_SESSION_EXPIRED', 'Your session has expired. Please sign in again.');
}
