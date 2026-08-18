import { randomBytes } from 'node:crypto';

import { Injectable } from '@nestjs/common';
import { SshLoginChallenge } from '@patches/database';
import {
  buildSshChallengeBlob,
  SSH_ENROLL_DOMAIN_SEPARATOR,
  SSH_LOGIN_DOMAIN_SEPARATOR,
} from '@patches/domain';
import { IsNull, MoreThan, type EntityManager } from 'typeorm';

import { AppError } from '../../common/errors/app-error.js';
import { AppConfigService } from '../../config/app-config.service.js';
import {
  type OpenSshPublicKey,
  parseOpenSshPublicKey,
  readSshSignatureAlgorithm,
  verifySshSignature,
} from './ssh/openssh.js';
import { sshEnrollmentBindingSchema, uuidInputSchema } from './validation.js';

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
 * Challenge/response SSH login and enrollment (spec §166, `docs/architecture/auth.md` §4;
 * enrollment is B-021).
 *
 * Two rules shape the login half:
 *
 *  1. **No enumeration.** SSH public keys are public — GitHub publishes them — so confirming
 *     "this key is enrolled on this node" links an external identity to a Patches account.
 *     A challenge is therefore issued unconditionally, and *every* failure to complete one is
 *     the same `UNAUTHENTICATED`, whether the key is unknown, revoked, expired, or the
 *     signature is simply wrong.
 *  2. **The server chooses the bytes.** The signed blob is reconstructed here from the stored
 *     challenge row; a blob supplied by the client is never signed or accepted.
 *
 * Enrollment reuses the same `ssh_login_challenges` table (there is no separate table or
 * `purpose` column — see `sshEnrollmentBindingSchema`'s doc comment in `validation.ts`) and
 * the same signature verifier as login (§166's algorithm/key-strength rules apply equally),
 * but is authenticated rather than anonymous, so enumeration is not a concern: a distinct
 * domain separator ({@link SSH_ENROLL_DOMAIN_SEPARATOR}) still keeps a login signature from
 * ever being replayable as an enrollment proof or vice versa.
 */
@Injectable()
export class SshChallengeService {
  constructor(private readonly config: AppConfigService) {}

  /** Issues a login challenge. Never consults `credentials` — see rule 1 above. */
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
   * Issues an enrollment challenge (B-021), bound to the authenticated caller and the
   * fingerprint of the key they intend to enroll — both checked again at
   * {@link consumeEnrollmentProof}, so a proof can only ever be redeemed by the same user for
   * the same key it was issued for.
   */
  async beginEnrollment(
    manager: EntityManager,
    input: { userId: string; fingerprint: string },
  ): Promise<IssuedSshChallenge> {
    const challenges = manager.getRepository(SshLoginChallenge);
    const row = await challenges.save(
      challenges.create({
        nonce: randomBytes(NONCE_BYTES),
        expiresAt: new Date(Date.now() + SSH_CHALLENGE_TTL_MS),
        claimedHandle: JSON.stringify({
          purpose: 'ENROLL',
          userId: input.userId,
          fingerprint: input.fingerprint,
        }),
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
   * Verifies `signature` over the login blob this node would have produced for `challenge`,
   * and returns the parsed key so the caller can look up its fingerprint.
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
      domainSeparator: SSH_LOGIN_DOMAIN_SEPARATOR,
      nodeDomain: this.config.nodeDomain,
      challengeId: input.challenge.id,
      nonce: input.challenge.nonce,
      fingerprint: key.fingerprint,
      expiresAt: input.challenge.expiresAt,
    });

    if (!verifySshSignature(key, blob, input.signature)) throw sshAuthenticationFailed();
    return key;
  }

  /**
   * Consumes an enrollment challenge and verifies its proof (B-021): the challenge must be
   * unexpired and unconsumed (single-use, like login), bound to `input.userId` and to the
   * fingerprint of `input.publicKeyOpenssh`, and the signature must verify over the
   * enroll-domain blob with the *same* verifier `verifySignature` uses for login — so
   * SHA-1 `ssh-rsa` and sub-2048-bit RSA are rejected identically here.
   *
   * Every failure — missing binding, wrong user, wrong key, expired/replayed challenge, bad
   * signature — throws the same {@link sshEnrollmentProofInvalid}, so `AddCredential` cannot
   * be used to probe which of those was true.
   */
  async consumeEnrollmentProof(
    manager: EntityManager,
    input: {
      userId: string;
      challengeId: string;
      publicKeyOpenssh: string;
      signature: Buffer;
      signatureFormat: string;
    },
  ): Promise<OpenSshPublicKey> {
    if (!uuidInputSchema.safeParse(input.challengeId).success) throw sshEnrollmentProofInvalid();

    const challenges = manager.getRepository(SshLoginChallenge);
    const now = new Date();
    const result = await challenges.update(
      { id: input.challengeId, consumedAt: IsNull(), expiresAt: MoreThan(now) },
      { consumedAt: now },
    );
    if (result.affected !== 1) throw sshEnrollmentProofInvalid();

    const row = await challenges.findOne({ where: { id: input.challengeId } });
    if (row === null) throw sshEnrollmentProofInvalid();

    const binding = decodeClaimedHandleJson(row.claimedHandle);
    const parsedBinding = sshEnrollmentBindingSchema.safeParse(binding);
    if (!parsedBinding.success || parsedBinding.data.userId !== input.userId) {
      throw sshEnrollmentProofInvalid();
    }

    let key: OpenSshPublicKey;
    try {
      key = parseOpenSshPublicKey(input.publicKeyOpenssh);
    } catch {
      throw sshEnrollmentProofInvalid();
    }
    if (key.fingerprint !== parsedBinding.data.fingerprint) throw sshEnrollmentProofInvalid();

    if (input.signatureFormat.length > 0) {
      const declared = readSshSignatureAlgorithm(input.signature);
      if (declared !== input.signatureFormat) throw sshEnrollmentProofInvalid();
    }

    const blob = buildSshChallengeBlob({
      domainSeparator: SSH_ENROLL_DOMAIN_SEPARATOR,
      nodeDomain: this.config.nodeDomain,
      challengeId: row.id,
      nonce: row.nonce,
      fingerprint: key.fingerprint,
      expiresAt: row.expiresAt,
    });

    if (!verifySshSignature(key, blob, input.signature)) throw sshEnrollmentProofInvalid();
    return key;
  }
}

/**
 * `claimed_handle` is a plain nullable text column repurposed to carry the JSON-encoded
 * enrollment binding (see `sshEnrollmentBindingSchema`'s doc comment); it is never
 * client-writable, but a malformed value is treated as "no binding" rather than thrown, so a
 * parsing edge case fails closed as `sshEnrollmentProofInvalid()` instead of surfacing as an
 * unhandled exception.
 */
function decodeClaimedHandleJson(value: string | null): unknown {
  if (value === null) return null;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
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

/** `AddCredential(SSH_PUBLIC_KEY)` was called with no possession proof at all — a client bug,
 * not an authentication failure, so this is `VALIDATION_ERROR` (→ `INVALID_ARGUMENT`) rather
 * than {@link sshEnrollmentProofInvalid} (→ `UNAUTHENTICATED`). */
export function sshEnrollmentProofRequired(): AppError {
  return AppError.validation(
    'Enrolling an SSH key requires a possession proof from BeginSshEnrollment.',
  );
}

/** The single response every enrollment-proof failure produces (missing binding, wrong user,
 * wrong key, expired/replayed challenge, or a bad signature) — uniform so `AddCredential`
 * cannot be used to distinguish which one was true (B-021, mirrors {@link
 * sshAuthenticationFailed}'s login-side reasoning). */
export function sshEnrollmentProofInvalid(): AppError {
  return new AppError(
    'AUTH_INVALID_CREDENTIALS',
    'SSH key enrollment proof is invalid or expired.',
  );
}
