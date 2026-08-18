import { randomBytes } from 'node:crypto';

import { Injectable } from '@nestjs/common';
import { SshLoginChallenge } from '@patches/database';
import { IsNull, MoreThan, type EntityManager } from 'typeorm';

import { AppError } from '../../common/errors/app-error.js';
import { AppConfigService } from '../../config/app-config.service.js';
import { buildSshChallengeBlob } from './ssh/challenge-blob.js';
import {
  type OpenSshPublicKey,
  parseOpenSshPublicKey,
  readSshSignatureAlgorithm,
  verifySshSignature,
} from './ssh/openssh.js';
import { uuidInputSchema } from './validation.js';

/** Spec §166 caps this at 120 seconds; there is no reason for an agent signature to take longer. */
export const SSH_CHALLENGE_TTL_MS = 120_000;

/** §166 requires at least 32 CSPRNG bytes. */
const NONCE_BYTES = 32;

export interface IssuedSshChallenge {
  challengeId: string;
  nonce: Buffer;
  expiresAt: Date;
}

/**
 * Challenge/response SSH login (spec §166, `docs/architecture/auth.md` §4).
 *
 * Two rules shape everything here:
 *
 *  1. **No enumeration.** SSH public keys are public — GitHub publishes them — so confirming
 *     "this key is enrolled on this node" links an external identity to a Patches account.
 *     A challenge is therefore issued unconditionally, and *every* failure to complete one is
 *     the same `UNAUTHENTICATED`, whether the key is unknown, revoked, expired, or the
 *     signature is simply wrong.
 *  2. **The server chooses the bytes.** The signed blob is reconstructed here from the stored
 *     challenge row; a blob supplied by the client is never signed or accepted.
 */
@Injectable()
export class SshChallengeService {
  constructor(private readonly config: AppConfigService) {}

  /** Issues a challenge. Never consults `credentials` — see rule 1 above. */
  async begin(manager: EntityManager): Promise<IssuedSshChallenge> {
    const challenges = manager.getRepository(SshLoginChallenge);
    const row = await challenges.save(
      challenges.create({
        nonce: randomBytes(NONCE_BYTES),
        expiresAt: new Date(Date.now() + SSH_CHALLENGE_TTL_MS),
        claimedHandle: null,
      }),
    );
    return { challengeId: row.id, nonce: row.nonce, expiresAt: row.expiresAt };
  }

  /**
   * Marks a challenge used and returns it, or throws the uniform failure.
   *
   * The conditional `UPDATE` is what makes it single-use: a replayed signature loses the race
   * or finds `consumed_at` already set, and either way affects zero rows.
   */
  async consume(manager: EntityManager, challengeId: string): Promise<SshLoginChallenge> {
    // Validated before it reaches Postgres: a non-UUID would fail the column cast with a
    // driver error rather than the uniform authentication failure this endpoint owes callers.
    if (!uuidInputSchema.safeParse(challengeId).success) throw sshAuthenticationFailed();

    const challenges = manager.getRepository(SshLoginChallenge);
    const now = new Date();
    const result = await challenges.update(
      { id: challengeId, consumedAt: IsNull(), expiresAt: MoreThan(now) },
      { consumedAt: now },
    );
    if (result.affected !== 1) throw sshAuthenticationFailed();

    const row = await challenges.findOne({ where: { id: challengeId } });
    if (row === null) throw sshAuthenticationFailed();
    return row;
  }

  /**
   * Verifies `signature` over the blob this node would have produced for `challenge`, and
   * returns the parsed key so the caller can look up its fingerprint.
   */
  verifySignature(input: {
    challenge: SshLoginChallenge;
    publicKeyOpenssh: string;
    signature: Buffer;
    /** Client-declared algorithm; cross-checked against the blob, never trusted over it. */
    signatureFormat: string;
  }): OpenSshPublicKey {
    let key: OpenSshPublicKey;
    try {
      key = parseOpenSshPublicKey(input.publicKeyOpenssh);
    } catch {
      // Unparseable key material is an authentication failure like any other (rule 1).
      throw sshAuthenticationFailed();
    }

    if (input.signatureFormat.length > 0) {
      const declared = readSshSignatureAlgorithm(input.signature);
      if (declared !== input.signatureFormat) throw sshAuthenticationFailed();
    }

    const blob = buildSshChallengeBlob({
      nodeDomain: this.config.nodeDomain,
      challengeId: input.challenge.id,
      nonce: input.challenge.nonce,
      fingerprint: key.fingerprint,
      expiresAt: input.challenge.expiresAt,
    });

    if (!verifySshSignature(key, blob, input.signature)) throw sshAuthenticationFailed();
    return key;
  }
}

/**
 * The single response every SSH login failure produces. Exported so `AuthService` throws the
 * identical error for "no credential matches this fingerprint" — the one case that lives
 * outside this service but must be indistinguishable from the ones inside it.
 */
export function sshAuthenticationFailed(): AppError {
  return new AppError('AUTH_INVALID_CREDENTIALS', 'SSH authentication failed.');
}
