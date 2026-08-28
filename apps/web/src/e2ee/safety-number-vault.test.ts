/**
 * Safety-number verification mark storage (issue #168): a boolean per peer, never the
 * number itself — the number is always recomputed from freshly verified chain material.
 */
import { describe, expect, it } from 'vitest';

import {
  isSafetyNumberVerified,
  setSafetyNumberVerified,
  type SafetyNumberVaultAccess,
} from './vault.js';
import { VaultCorruptionError } from './vault-errors.js';

function fakeVault(): SafetyNumberVaultAccess & { records: Map<string, Uint8Array> } {
  const records = new Map<string, Uint8Array>();
  return {
    records,
    getOpaqueRecord: (key) => Promise.resolve(records.get(key)),
    putOpaqueRecord: (key, value) => {
      records.set(key, value);
      return Promise.resolve();
    },
  };
}

describe('safety-number verification marks', () => {
  it('is unverified by default', async () => {
    const vault = fakeVault();
    expect(await isSafetyNumberVerified(vault, 'peer-1')).toBe(false);
  });

  it('round-trips a mark set true', async () => {
    const vault = fakeVault();
    await setSafetyNumberVerified(vault, 'peer-1', true);
    expect(await isSafetyNumberVerified(vault, 'peer-1')).toBe(true);
    expect(await isSafetyNumberVerified(vault, 'peer-2')).toBe(false);
  });

  it('unmarks on false without disturbing other peers', async () => {
    const vault = fakeVault();
    await setSafetyNumberVerified(vault, 'peer-1', true);
    await setSafetyNumberVerified(vault, 'peer-2', true);
    await setSafetyNumberVerified(vault, 'peer-1', false);
    expect(await isSafetyNumberVerified(vault, 'peer-1')).toBe(false);
    expect(await isSafetyNumberVerified(vault, 'peer-2')).toBe(true);
  });

  it('fails closed on a corrupted record instead of silently reading unverified', async () => {
    const vault = fakeVault();
    await setSafetyNumberVerified(vault, 'peer-1', true);
    vault.records.set('\0patches-e2ee-safety-number-verified', new Uint8Array([9, 9, 9]));
    await expect(isSafetyNumberVerified(vault, 'peer-1')).rejects.toBeInstanceOf(
      VaultCorruptionError,
    );
  });
});
