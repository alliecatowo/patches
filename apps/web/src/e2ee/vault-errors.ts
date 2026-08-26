/**
 * Coarse, content-free failures for the encrypted E2EE vault (P13-006; web port).
 *
 * Hard rule (ADR 0020 §4, Amendment B): no key material, ratchet bytes, counters, or
 * message content may ever appear in an error, log, or diagnostic — so every message
 * here is a fixed string with no interpolated secret data.
 */
export class VaultError extends Error {
  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

/**
 * The vault blob failed authentication or parsing: wrong key, bit rot, truncation, or a
 * database swapped in from another account. Never silently reset — recovery is an
 * explicit wipe, followed by fresh sessions/resync.
 */
export class VaultCorruptionError extends VaultError {
  constructor() {
    super('The encrypted E2EE vault failed authentication or is malformed.');
  }
}

/**
 * The stored vault is older than a state this browser already committed (a restored
 * IndexedDB snapshot). Silent downgrade is refused: key/nonce reuse would become
 * possible. Recovery is an explicit wipe, which also clears the generation anchor.
 */
export class VaultRollbackError extends VaultError {
  constructor() {
    super('The E2EE vault in this browser is older than the state this device already committed.');
  }
}

/** Misuse of the staged-send transaction: staging over a pending stage, or a plain
 * update while a staged send awaits confirmation. */
export class VaultTransactionError extends VaultError {}
