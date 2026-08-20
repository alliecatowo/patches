import { Injectable } from '@nestjs/common';
import { WebauthnChallenge, type WebauthnChallengePurpose } from '@patches/database';
import { IsNull, MoreThan, type EntityManager } from 'typeorm';

/** ADR 0022: 5 minutes, longer than `SSH_CHALLENGE_TTL_MS` (120s) because a WebAuthn ceremony
 * waits on a human biometric/PIN prompt, not an unattended agent signature. */
export const PASSKEY_CHALLENGE_TTL_MS = 300_000;

/**
 * Issues and consumes `webauthn_challenges` rows (P15-004, ADR 0022) — the WebAuthn analogue of
 * `SshChallengeService`, with one structural difference: a `CompletePasskeyRegistration`/
 * `CompletePasskeyLogin` call carries no server-chosen challenge id of its own, only the
 * credential response, whose `clientDataJSON` embeds the challenge value it was signed over.
 * Callers decode that value first (see `AuthService`'s `decodeWebAuthnChallenge` helper), then
 * look up (and atomically consume) the row it matches here.
 */
@Injectable()
export class PasskeyChallengeService {
  async issue(
    manager: EntityManager,
    input: { challenge: string; purpose: WebauthnChallengePurpose; boundUserId: string | null },
  ): Promise<void> {
    const challenges = manager.getRepository(WebauthnChallenge);
    await challenges.save(
      challenges.create({
        challenge: input.challenge,
        purpose: input.purpose,
        boundUserId: input.boundUserId,
        expiresAt: new Date(Date.now() + PASSKEY_CHALLENGE_TTL_MS),
        consumedAt: null,
      }),
    );
  }

  /**
   * Marks the challenge matching `input.challenge`/`input.purpose` used and returns it, or
   * `null`. The conditional `UPDATE` is what makes it single-use (mirrors
   * `SshChallengeService.consume`'s exact reasoning): a replayed challenge loses the race or
   * finds `consumed_at` already set, and either way affects zero rows.
   *
   * Returns `null` rather than throwing so registration (authenticated, wants a distinguishable
   * error) and login (anonymous, wants the uniform §166 failure) can each pick their own error.
   */
  async consume(
    manager: EntityManager,
    input: { challenge: string; purpose: WebauthnChallengePurpose },
  ): Promise<WebauthnChallenge | null> {
    const challenges = manager.getRepository(WebauthnChallenge);
    const now = new Date();
    const result = await challenges.update(
      {
        challenge: input.challenge,
        purpose: input.purpose,
        consumedAt: IsNull(),
        expiresAt: MoreThan(now),
      },
      { consumedAt: now },
    );
    if (result.affected !== 1) return null;
    return challenges.findOne({ where: { challenge: input.challenge } });
  }
}
