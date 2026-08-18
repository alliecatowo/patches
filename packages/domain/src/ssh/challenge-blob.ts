import { encodeSshStrings } from './wire.js';

/**
 * The exact bytes an SSH agent is asked to sign for a Patches SSH flow (spec §166,
 * `docs/architecture/auth.md` §4).
 *
 * The server always reconstructs this blob from its own challenge row and never accepts one
 * supplied by the client — that is the whole point of the construction. Each component binds
 * the signature to something: the domain-separation string to *this protocol* (so a signature
 * made for some other Patches-adjacent purpose is not reusable here), the node domain to
 * *this node* (RFC 4252 §7's session-identifier discipline, borrowed), and the challenge id +
 * nonce to *this single attempt*.
 *
 * Encoding is SSH's own length-prefixed `string` framing (RFC 4251 §5) rather than
 * concatenation or JSON, so no field's contents can be shifted into its neighbour's — the
 * classic way a "bind everything into one blob" scheme is broken.
 *
 * Lives in `@patches/domain` (spec §166, A-020) so `apps/server` and `apps/tui` share exactly
 * one definition — a client-side reimplementation of the signed-blob layout is precisely the
 * kind of drift this construction exists to prevent.
 */

/**
 * Login domain separator. Versioned; never reused for a different layout (§166).
 */
export const SSH_LOGIN_DOMAIN_SEPARATOR = 'patches-ssh-login-v1';

/**
 * Credential-enrollment domain separator (B-021): a distinct string from
 * {@link SSH_LOGIN_DOMAIN_SEPARATOR} so a login signature can never be replayed as an
 * enrollment proof, or vice versa, even if every other field happened to collide.
 */
export const SSH_ENROLL_DOMAIN_SEPARATOR = 'patches-ssh-enroll-v1';

export interface SshChallengeBlobInput {
  /** Domain separation string — {@link SSH_LOGIN_DOMAIN_SEPARATOR} or
   * {@link SSH_ENROLL_DOMAIN_SEPARATOR}, never reused for a third purpose without a new
   * version suffix (§166). */
  domainSeparator: string;
  /** Canonical domain of this node (`NODE_DOMAIN`). */
  nodeDomain: string;
  challengeId: string;
  /** >= 32 CSPRNG bytes, signed verbatim. */
  nonce: Buffer;
  /** OpenSSH `SHA256:` fingerprint of the signing key. */
  fingerprint: string;
  expiresAt: Date;
}

/**
 * `expires_at` is encoded as whole Unix seconds, in decimal ASCII: the client only ever sees
 * this value as a `google.protobuf.Timestamp`, whose sub-second part it has no reason to
 * reproduce byte-for-byte, and truncating on both sides makes the two derivations agree by
 * construction rather than by luck.
 */
export function buildSshChallengeBlob(input: SshChallengeBlobInput): Buffer {
  return encodeSshStrings([
    input.domainSeparator,
    input.nodeDomain,
    input.challengeId,
    input.nonce,
    input.fingerprint,
    String(Math.floor(input.expiresAt.getTime() / 1000)),
  ]);
}
