import { readdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

import { buildSshChallengeBlob, SSH_ENROLL_DOMAIN_SEPARATOR } from '@patches/domain';
import { CREDENTIAL_TYPE } from '../api/wire/enums.js';
import { timestampToDate } from '@patches/proto';
import type {
  AddCredentialRequest,
  AddCredentialResponse,
  BeginSshEnrollmentRequest,
  BeginSshEnrollmentResponse,
} from '../api/wire/types.js';

import { listIdentities, signWithAgent } from './ssh-agent.js';
import {
  describeIdentities,
  formatOpenSshPublicKey,
  readPublicKeyFile,
  signFlagsForAlgorithm,
  sshFingerprint,
  type SelectableIdentity,
} from './ssh-login.js';

/**
 * SSH credential enrollment (P1-013, B-021, spec §165–166): discover candidate keys, get an
 * explicit confirmation, then prove the caller actually holds the private key with a
 * **server-verified** challenge — never by reading the key, only ever by asking the agent to
 * sign the blob `BeginSshEnrollment` issued — before calling `AuthService.AddCredential`.
 *
 * This mirrors `ssh-login.ts`'s `BeginSshLogin`/`CompleteSshLogin` handshake exactly, except
 * authenticated and with a distinct domain separator ({@link SSH_ENROLL_DOMAIN_SEPARATOR},
 * from `@patches/domain`, A-020) so a login signature can never be replayed as an enrollment
 * proof or vice versa.
 */

export { SSH_ENROLL_DOMAIN_SEPARATOR };

export interface EnrollmentCandidate extends SelectableIdentity {
  /** Local `.pub` file path(s) this fingerprint also matches, for display only. */
  knownAt: string[];
}

/**
 * Lists `~/.ssh/*.pub` files purely to cross-reference against the agent's loaded
 * identities (so the confirmation prompt can say "matches ~/.ssh/id_ed25519.pub"
 * instead of a bare fingerprint). Never reads a private key, and the result here is
 * never itself signed with or enrolled as a credential — only an agent-loaded
 * identity (see {@link discoverEnrollmentCandidates}) can be.
 */
export async function listHomeSshPublicKeys(
  homeDir: string = homedir(),
): Promise<Array<{ path: string; fingerprint: string }>> {
  const dir = join(homeDir, '.ssh');
  let entries: string[];
  try {
    entries = await readdir(dir);
  } catch {
    // No `~/.ssh` directory at all — nothing to cross-reference, not an error.
    return [];
  }

  const results: Array<{ path: string; fingerprint: string }> = [];
  for (const entry of entries) {
    if (!entry.endsWith('.pub')) continue;
    const path = join(dir, entry);
    try {
      const parsed = await readPublicKeyFile(path);
      results.push({ path, fingerprint: sshFingerprint(parsed.blob) });
    } catch {
      // Not a parseable OpenSSH public key line — best-effort scan, skip it.
    }
  }
  return results;
}

/**
 * Enrollment candidates are always agent-loaded identities — never a bare
 * `~/.ssh/*.pub` file on its own, since Patches only enrolls a key it can ask the
 * agent to prove possession of (`SSH_AGENTC_SIGN_REQUEST`). `knownAt` annotates each
 * with any local `.pub` file(s) that match by fingerprint, for a friendlier prompt.
 */
export async function discoverEnrollmentCandidates(
  socketPath: string,
  homeDir?: string,
): Promise<EnrollmentCandidate[]> {
  const [identities, homeKeys] = await Promise.all([
    listIdentities(socketPath).then(describeIdentities),
    listHomeSshPublicKeys(homeDir),
  ]);
  return identities.map((identity) => ({
    ...identity,
    knownAt: homeKeys
      .filter((key) => key.fingerprint === identity.fingerprint)
      .map((key) => key.path),
  }));
}

export interface SshEnrollApi {
  beginSshEnrollment(
    request: BeginSshEnrollmentRequest,
    accessToken: string,
  ): Promise<BeginSshEnrollmentResponse>;
  addCredential(request: AddCredentialRequest, accessToken: string): Promise<AddCredentialResponse>;
}

export interface EnrollSshCredentialOptions {
  api: SshEnrollApi;
  accessToken: string;
  /** Canonical domain of the node being enrolled on — must match the value the server binds
   * into the challenge blob (`AppConfigService.nodeDomain`), the same convention
   * `performSshLogin`'s `nodeDomain` option uses. */
  nodeDomain: string;
  socketPath: string;
  identity: SelectableIdentity;
  label?: string;
}

/**
 * Runs `BeginSshEnrollment` → agent sign → `AddCredential(SSH_PUBLIC_KEY)` with the resulting
 * possession proof (B-021). Never reads, requests, or transmits a private key — signing
 * happens entirely in the agent, exactly as in `performSshLogin`.
 */
export async function enrollSshCredential(
  options: EnrollSshCredentialOptions,
): Promise<AddCredentialResponse> {
  const publicKeyOpenssh = formatOpenSshPublicKey(
    options.identity.algorithm,
    options.identity.keyBlob,
    options.identity.comment,
  );

  const begin = await options.api.beginSshEnrollment({ publicKeyOpenssh }, options.accessToken);
  const expiresAt = timestampToDate(begin.expiresAt) ?? new Date(Date.now() + 120_000);

  const blob = buildSshChallengeBlob({
    domainSeparator: SSH_ENROLL_DOMAIN_SEPARATOR,
    nodeDomain: options.nodeDomain,
    challengeId: begin.challengeId,
    nonce: Buffer.from(begin.nonce),
    fingerprint: options.identity.fingerprint,
    expiresAt,
  });

  const signature = await signWithAgent(
    options.socketPath,
    options.identity.keyBlob,
    blob,
    signFlagsForAlgorithm(options.identity.algorithm),
  );

  return options.api.addCredential(
    {
      type: CREDENTIAL_TYPE.SSH_PUBLIC_KEY,
      secret: publicKeyOpenssh,
      label: options.label ?? '',
      sshProof: {
        challengeId: begin.challengeId,
        signature: signature.blob,
        signatureFormat: signature.format,
      },
    },
    options.accessToken,
  );
}
