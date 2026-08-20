import { Check, Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

import { checkIn } from './enums.js';

/** What a challenge row was issued for (ADR 0022) — mirrors `SshLoginChallengePurpose`. */
export const WEBAUTHN_CHALLENGE_PURPOSES = ['REGISTRATION', 'LOGIN'] as const;
export type WebauthnChallengePurpose = (typeof WEBAUTHN_CHALLENGE_PURPOSES)[number];

/**
 * A server-issued, single-use WebAuthn ceremony challenge (`INITIAL_VISION.md` §165, ADR 0022,
 * `docs/architecture/auth.md`). Mirrors `SshLoginChallenge`'s shape and single-use-via-
 * conditional-UPDATE pattern (`SshChallengeService.consume`), but stores the challenge itself
 * (already a base64url string, as `@simplewebauthn/server`'s `generateRegistrationOptions`/
 * `generateAuthenticationOptions` produce it) rather than a raw nonce, because a WebAuthn
 * `CompletePasskeyRegistration`/`CompletePasskeyLogin` call carries no server-chosen opaque id
 * of its own to look the row up by — only the credential response, whose `clientDataJSON`
 * embeds the challenge it was signed over. The server decodes that challenge value first, then
 * looks up (and atomically consumes) the row it matches.
 *
 * `REGISTRATION` rows are bound to the authenticated caller (`boundUserId`) the same way
 * `SshLoginChallenge`'s `ENROLL` purpose is; `LOGIN` rows are unbound (discoverable-credential
 * login carries no username, so there is no caller to bind to yet — the credential response
 * itself identifies the account via its credential id).
 *
 * TTL is 5 minutes (`PASSKEY_CHALLENGE_TTL_MS`), longer than the SSH challenge's 120 seconds:
 * an SSH challenge is signed automatically by an agent with no human in the loop, while a
 * passkey ceremony waits on a biometric/PIN prompt.
 */
@Entity({ name: 'webauthn_challenges' })
@Index(['challenge'], { unique: true })
@Index(['expiresAt'])
@Check('chk_webauthn_challenges_purpose', checkIn('purpose', WEBAUTHN_CHALLENGE_PURPOSES))
export class WebauthnChallenge {
  @PrimaryGeneratedColumn('uuid')
  declare id: string;

  /** Base64url challenge value, exactly as embedded in the options JSON returned to the
   * client and later echoed back inside the credential response's `clientDataJSON`. */
  @Column({ type: 'text' })
  declare challenge: string;

  /** `REGISTRATION` (`beginRegistration()`) or `LOGIN` (`beginLogin()`). */
  @Column({ type: 'text' })
  declare purpose: WebauthnChallengePurpose;

  /** Registration only: the authenticated user this challenge may be redeemed for. `null` for
   * login challenges (discoverable credential login has no caller yet). */
  @Column({ type: 'uuid', nullable: true })
  declare boundUserId: string | null;

  /** TTL 5 minutes (ADR 0022); expired rows are swept by a periodic job. */
  @Column({ type: 'timestamptz' })
  declare expiresAt: Date;

  /** Single-use; consumed atomically. */
  @Column({ type: 'timestamptz', nullable: true })
  declare consumedAt: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  declare createdAt: Date;
}
