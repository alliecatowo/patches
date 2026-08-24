/**
 * The vault-backed send pipeline for end-to-end conversations (P13-006 × P13-010,
 * ADR 0020 §4).
 *
 * This is the ONLY route an E2EE conversation's sends may take in this client — never
 * a fallback to the plaintext RPC, not "just this once" (ADR 0020 §1.2). The ordering
 * is the whole point of the ratchet vault's staged-commit protocol:
 *
 *   1. open the account's keyring-wrapped vault (once; faults are sticky and coarse);
 *   2. load the conversation's ratchet session — none means "not enrollable yet",
 *     stated plainly rather than downgraded;
 *   3. `ratchetEncrypt` derives the next state locally;
 *   4. `stageSend` commits that state durably BEFORE any bytes leave the machine;
 *   5. hand the ciphertext to the injected transport (`SendEnvelopes` composition);
 *   6. `confirmSend` promotes the staged state once the node accepts.
 *
 * A crash anywhere after step 4 is safe by construction: the next open adopts the
 * staged successor, so keys are never reused. A transport failure leaves the staged
 * state for exactly that adoption path too.
 *
 * Hard rule (ADR 0020 §4): no key material, counters, or message content ever reaches
 * an error or log line — every failure here carries fixed copy only.
 */
import { ratchetEncrypt, type EncryptedRatchetMessage } from '@patches/crypto';

import type { VaultAccount } from '../e2ee/vault-key-providers.js';
import { createRatchetSessionVault, type RatchetSessionVault } from '../e2ee/ratchet-vault.js';
import { VaultCorruptionError, VaultRollbackError } from '../e2ee/vault-errors.js';

/** Sticky, content-free vault faults surfaced verbatim as inaccessible-history states. */
export type E2eeVaultFault = 'corrupt' | 'rollback';

/** The conversation has no established ratchet session on this device yet. */
export class E2eeSessionUnavailableError extends Error {
  constructor() {
    super('No established end-to-end session with this conversation exists on this device yet.');
    this.name = new.target.name;
  }
}

/** The shell provided no `SendEnvelopes` composition to deliver through. */
export class E2eeTransportUnavailableError extends Error {
  constructor() {
    super('Encrypted delivery is not wired up in this build.');
    this.name = new.target.name;
  }
}

export interface VaultE2eeSender {
  /** The sticky fault from opening, if any — the caller renders it as an explicit
   * inaccessible-history banner until the viewer explicitly wipes and resets. */
  fault(): E2eeVaultFault | undefined;
  send(conversationId: string, body: string): Promise<void>;
  close(): void;
}

export interface CreateVaultE2eeSenderOptions {
  readonly account: VaultAccount;
  readonly allowInsecureKeyFile: boolean;
  /** Injectable for tests; defaults to the real keyring-wrapped file vault. */
  readonly vault?: RatchetSessionVault;
  /**
   * The delivery half of the pipeline — where P13-012's envelope/franking fanout
   * composition plugs in. Receives only opaque bytes; it must not log them.
   */
  readonly transport?: ((message: EncryptedRatchetMessage) => Promise<void>) | undefined;
}

export function createVaultE2eeSender(options: CreateVaultE2eeSenderOptions): VaultE2eeSender {
  let vault: RatchetSessionVault | undefined = options.vault;
  let owned = options.vault === undefined;
  let fault: E2eeVaultFault | undefined;

  async function ensureOpen(): Promise<RatchetSessionVault> {
    if (vault !== undefined) return vault;
    const created = await createRatchetSessionVault({
      account: options.account,
      allowInsecureKeyFile: options.allowInsecureKeyFile,
    });
    try {
      await created.open();
    } catch (error) {
      // Corruption and rollback are disclosed as inaccessible-history states — never
      // silently reset (P13-006). Everything else propagates as itself.
      if (error instanceof VaultCorruptionError) fault = 'corrupt';
      else if (error instanceof VaultRollbackError) fault = 'rollback';
      throw error;
    }
    vault = created;
    return created;
  }

  return {
    fault: () => fault,
    async send(conversationId: string, body: string): Promise<void> {
      if (options.transport === undefined) throw new E2eeTransportUnavailableError();
      const store = await ensureOpen();
      const state = await store.getSession(conversationId);
      if (state === undefined) throw new E2eeSessionUnavailableError();
      const transition = ratchetEncrypt(state, new TextEncoder().encode(body), new Uint8Array());
      // Durable BEFORE the bytes may leave (P13-006's crash-window contract). If the
      // transport throws after staging, the state is left deliberately unconfirmed:
      // the next open adopts the staged successor instead of rolling back to a state
      // that could reuse a key/nonce pair.
      await store.stageSend(conversationId, transition.state);
      await options.transport(transition.output);
      await store.confirmSend(conversationId);
    },
    close(): void {
      if (owned && vault !== undefined) vault.close();
      owned = false;
      vault = undefined;
    },
  };
}
