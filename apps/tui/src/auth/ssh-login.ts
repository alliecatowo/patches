import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

import {
  timestampToDate,
  type BeginSshLoginRequest,
  type BeginSshLoginResponse,
  type CompleteSshLoginRequest,
  type CompleteSshLoginResponse,
} from '@patches/proto';

import {
  encodeString,
  listIdentities,
  sshAlgorithmFromBlob,
  signWithAgent,
  SSH_AGENT_RSA_SHA2_512,
  type SshIdentity,
} from './ssh-agent.js';

/**
 * SSH public-key login (spec §166, `docs/architecture/auth.md` §4): the agent
 * signs a blob the server reconstructs itself; Patches never touches a private
 * key. This module builds that blob, drives the two-RPC handshake, and picks
 * which agent identity to use.
 */

/** Domain separation string, versioned, never reused for another purpose. */
export const SSH_LOGIN_DOMAIN_SEPARATOR = 'patches-ssh-login-v1';

export interface SshLoginApi {
  beginSshLogin(request: BeginSshLoginRequest): Promise<BeginSshLoginResponse>;
  completeSshLogin(request: CompleteSshLoginRequest): Promise<CompleteSshLoginResponse>;
}

/** OpenSSH `SHA256:<base64, no padding>` fingerprint of a wire-format key blob. */
export function sshFingerprint(keyBlob: Buffer): string {
  const digest = createHash('sha256').update(keyBlob).digest('base64').replace(/=+$/, '');
  return `SHA256:${digest}`;
}

export interface ParsedOpenSshPublicKey {
  algorithm: string;
  blob: Buffer;
  comment: string;
}

export function parseOpenSshPublicKey(line: string): ParsedOpenSshPublicKey {
  const trimmed = line.trim();
  const parts = trimmed.split(/\s+/);
  const algorithm = parts[0];
  const base64 = parts[1];
  if (algorithm === undefined || base64 === undefined) {
    throw new Error(
      'Not a valid OpenSSH public key line (expected "<algorithm> <base64> [comment]").',
    );
  }
  return { algorithm, blob: Buffer.from(base64, 'base64'), comment: parts.slice(2).join(' ') };
}

export function formatOpenSshPublicKey(algorithm: string, blob: Buffer, comment = ''): string {
  const base64 = blob.toString('base64');
  return comment === '' ? `${algorithm} ${base64}` : `${algorithm} ${base64} ${comment}`;
}

/** Reads and parses a `.pub` file, for enrollment display only — never a private key. */
export async function readPublicKeyFile(path: string): Promise<ParsedOpenSshPublicKey> {
  const contents = await readFile(path, 'utf8');
  return parseOpenSshPublicKey(contents);
}

/**
 * Fixed-order signed blob (`docs/architecture/auth.md` §4): domain separator,
 * node canonical domain, challenge id, nonce, credential fingerprint,
 * expires_at — every variable-length field is SSH-string-encoded (uint32
 * length + bytes) so field boundaries can never shift into one another.
 */
export function buildSshLoginBlob(params: {
  nodeDomain: string;
  challengeId: string;
  nonce: Buffer;
  fingerprint: string;
  expiresAt: Date;
}): Buffer {
  return Buffer.concat([
    encodeString(SSH_LOGIN_DOMAIN_SEPARATOR),
    encodeString(params.nodeDomain),
    encodeString(params.challengeId),
    encodeString(params.nonce),
    encodeString(params.fingerprint),
    // Whole Unix seconds, decimal ASCII — must match the server's own
    // `buildSshChallengeBlob` (apps/server/src/modules/auth/ssh/challenge-blob.ts)
    // byte for byte. The client only ever sees this as a `Timestamp`, whose
    // sub-second part it has no reason to reproduce, so both sides truncate.
    encodeString(String(Math.floor(params.expiresAt.getTime() / 1000))),
  ]);
}

/** `ssh-rsa` keys must sign as `rsa-sha2-512` (spec: SHA-1 `ssh-rsa` signatures are rejected). */
export function signFlagsForAlgorithm(algorithm: string): number {
  return algorithm === 'ssh-rsa' ? SSH_AGENT_RSA_SHA2_512 : 0;
}

export interface SelectableIdentity extends SshIdentity {
  fingerprint: string;
  algorithm: string;
}

export function describeIdentities(identities: readonly SshIdentity[]): SelectableIdentity[] {
  return identities.map((identity) => ({
    ...identity,
    fingerprint: sshFingerprint(identity.keyBlob),
    algorithm: sshAlgorithmFromBlob(identity.keyBlob),
  }));
}

/**
 * Key picker: resolves `--ssh-key <path|fingerprint>` (or an interactive
 * choice) against the agent's loaded identities. `selector` may be a
 * fingerprint (full or suffix), an agent comment, or omitted entirely — which
 * only resolves when exactly one identity is loaded (spec §166 enrollment is
 * always explicit; login with an ambiguous agent must not guess silently).
 */
export function selectIdentity<T extends SelectableIdentity>(
  identities: readonly T[],
  selector?: string,
): T | undefined {
  if (selector === undefined) {
    return identities.length === 1 ? identities[0] : undefined;
  }
  return identities.find(
    (identity) =>
      identity.fingerprint === selector ||
      identity.comment === selector ||
      identity.fingerprint.endsWith(selector),
  );
}

/** Lists the agent's identities annotated with fingerprint + algorithm, for the key picker. */
export async function listSelectableIdentities(socketPath: string): Promise<SelectableIdentity[]> {
  return describeIdentities(await listIdentities(socketPath));
}

export interface PerformSshLoginOptions {
  api: SshLoginApi;
  nodeDomain: string;
  identity: SelectableIdentity;
  publicKeyOpenssh: string;
  socketPath: string;
}

/** Runs `BeginSshLogin` → agent sign → `CompleteSshLogin` end to end. */
export async function performSshLogin(
  options: PerformSshLoginOptions,
): Promise<CompleteSshLoginResponse> {
  const begin = await options.api.beginSshLogin({
    publicKeyOpenssh: options.publicKeyOpenssh,
    fingerprint: options.identity.fingerprint,
  });
  const expiresAt = timestampToDate(begin.expiresAt) ?? new Date(Date.now() + 120_000);

  const blob = buildSshLoginBlob({
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

  return options.api.completeSshLogin({
    challengeId: begin.challengeId,
    publicKeyOpenssh: options.publicKeyOpenssh,
    signature: signature.blob,
    signatureFormat: signature.format,
  });
}
