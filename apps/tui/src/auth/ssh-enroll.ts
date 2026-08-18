import { randomBytes } from 'node:crypto';
import { readdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

import {
  CREDENTIAL_TYPE,
  type AddCredentialRequest,
  type AddCredentialResponse,
} from '@patches/proto';

import { encodeString, listIdentities, signWithAgent } from './ssh-agent.js';
import {
  describeIdentities,
  formatOpenSshPublicKey,
  readPublicKeyFile,
  signFlagsForAlgorithm,
  sshFingerprint,
  type SelectableIdentity,
} from './ssh-login.js';

/**
 * SSH credential enrollment (P1-013, spec §165–166): discover candidate keys, get an
 * explicit confirmation, prove the caller actually holds the private key (never by
 * reading it — only ever by asking the agent to sign something), then call
 * `AuthService.AddCredential`.
 */

/** Domain separation string for the local possession proof — see `provePossession`. */
export const SSH_ENROLL_DOMAIN_SEPARATOR = 'patches-ssh-enroll-v1';

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

/**
 * Asks the agent to sign a random local nonce, purely as a client-side guard against
 * enrolling a key the agent will not actually vouch for (it refuses
 * `SSH_AGENTC_SIGN_REQUEST` for anything not loaded). This signature is **not**
 * transmitted anywhere: `AddCredentialRequest` (`packages/proto` `auth.proto`) has no
 * challenge/signature field of its own, unlike `BeginSshLogin`/`CompleteSshLogin` —
 * only the raw OpenSSH public key text (`secret`) and a `label`. Tracked as a
 * follow-up: a server-verified enrollment challenge shaped like the login one, so
 * possession is actually attested server-side too.
 */
export async function provePossession(
  socketPath: string,
  identity: SelectableIdentity,
): Promise<void> {
  const nonce = randomBytes(32);
  const blob = Buffer.concat([encodeString(SSH_ENROLL_DOMAIN_SEPARATOR), encodeString(nonce)]);
  await signWithAgent(
    socketPath,
    identity.keyBlob,
    blob,
    signFlagsForAlgorithm(identity.algorithm),
  );
}

export interface SshEnrollApi {
  addCredential(request: AddCredentialRequest, accessToken: string): Promise<AddCredentialResponse>;
}

export interface EnrollSshCredentialOptions {
  api: SshEnrollApi;
  accessToken: string;
  socketPath: string;
  identity: SelectableIdentity;
  label?: string;
}

/** Runs the possession proof, then `AddCredential(SSH_PUBLIC_KEY)`. */
export async function enrollSshCredential(
  options: EnrollSshCredentialOptions,
): Promise<AddCredentialResponse> {
  await provePossession(options.socketPath, options.identity);
  const publicKeyOpenssh = formatOpenSshPublicKey(
    options.identity.algorithm,
    options.identity.keyBlob,
    options.identity.comment,
  );
  return options.api.addCredential(
    {
      type: CREDENTIAL_TYPE.SSH_PUBLIC_KEY,
      secret: publicKeyOpenssh,
      label: options.label ?? '',
    },
    options.accessToken,
  );
}
