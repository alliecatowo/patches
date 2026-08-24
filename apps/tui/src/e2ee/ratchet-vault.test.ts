import { describe, expect, it } from 'vitest';

import {
  decodeRatchetState,
  disposeRatchetState,
  encodeRatchetState,
  ratchetEncrypt,
} from '@patches/crypto';

import { NO_KEYRING } from './vault-key-providers.js';
import { VaultCorruptionError } from './vault-errors.js';
import {
  createRatchetSessionVault,
  wipeE2eeState,
  type RatchetSessionVault,
} from './ratchet-vault.js';
import { MemoryVaultFs, TEST_ACCOUNT, fakeKeyring, testRatchetState } from './test-support.js';

const VAULT_PATH = '/cfg/patches/e2ee/facade.vault';
const KEY_PATH = '/cfg/patches/e2ee/keys/facade.key';

function requireSession(state: Awaited<ReturnType<RatchetSessionVault['getSession']>>) {
  if (state === undefined) throw new Error('session missing from vault');
  return state;
}

interface Setup {
  readonly fs: MemoryVaultFs;
  readonly keyring: ReturnType<typeof fakeKeyring>;
  open(): Promise<RatchetSessionVault>;
}

function setup(): Setup {
  const fs = new MemoryVaultFs();
  const keyring = fakeKeyring();
  return {
    fs,
    keyring,
    open: () =>
      createRatchetSessionVault({
        account: TEST_ACCOUNT,
        allowInsecureKeyFile: false,
        vaultPath: VAULT_PATH,
        fileOperations: fs,
        keyring: keyring.keyring,
      }),
  };
}

describe('TypedRatchetVault send contract', () => {
  it('a crash after the durable stage can never rewind the ratchet (no key/nonce reuse)', async () => {
    const s = setup();
    const vault = await s.open();
    await vault.open();
    await vault.applyUpdate('alice', testRatchetState());

    const before = requireSession(await vault.getSession('alice'));
    expect(before.sentCount).toBe(0);
    const transition = ratchetEncrypt(before, new TextEncoder().encode('first'), new Uint8Array());
    expect(transition.state.sentCount).toBe(1);
    await vault.stageSend('alice', transition.state); // durable BEFORE the send
    vault.close(); // crash before confirm — or before/after the actual network send

    const recovered = await s.open();
    const info = await recovered.open();
    expect(info.adoptedStagedSessions).toEqual(['alice']);
    const state = requireSession(await recovered.getSession('alice'));
    expect(state.sentCount).toBe(1);

    // Encrypting from the recovered state continues past everything already sent;
    // reuse would mean sentCount rewound to 0 and re-emitted message number 0.
    const next = ratchetEncrypt(state, new TextEncoder().encode('second'), new Uint8Array());
    expect(next.state.sentCount).toBe(2);
    disposeRatchetState(next.state);
    recovered.close();
  });

  it('confirm promotes the staged send and the next stage starts from there', async () => {
    const s = setup();
    const vault = await s.open();
    await vault.open();
    await vault.applyUpdate('alice', testRatchetState());
    const first = ratchetEncrypt(
      requireSession(await vault.getSession('alice')),
      new TextEncoder().encode('m1'),
      new Uint8Array(),
    );
    await vault.stageSend('alice', first.state);
    await vault.confirmSend('alice');
    expect((await vault.getSession('alice'))?.sentCount).toBe(1);
    vault.close();
  });

  it('round-trips full ratchet states, not just opaque bytes', async () => {
    const s = setup();
    const vault = await s.open();
    await vault.open();
    const original = testRatchetState();
    // applyUpdate consumes (zeroizes) the caller's state by contract, so compare
    // against an independent decode of what was committed.
    const snapshot = decodeRatchetState(encodeRatchetState(original));
    await vault.applyUpdate('alice', original);
    expect(await vault.getSession('alice')).toEqual(snapshot);
    vault.close();
  });

  it('zeroizes (best-effort) a state it has durably consumed', async () => {
    const s = setup();
    const vault = await s.open();
    await vault.open();
    await vault.applyUpdate('alice', testRatchetState());
    const state = requireSession(await vault.getSession('alice'));
    const transition = ratchetEncrypt(state, new Uint8Array([1]), new Uint8Array());
    await vault.stageSend('alice', transition.state);
    expect(transition.state.rootKey.every((byte) => byte === 0)).toBe(true);
    vault.close();
  });

  it('fails closed at open when the stored bytes were tampered with', async () => {
    const s = setup();
    const vault = await s.open();
    await vault.open();
    await vault.applyUpdate('alice', testRatchetState());
    vault.close();

    const bytes = s.fs.files.get(VAULT_PATH);
    const flipped = bytes?.slice() ?? new Uint8Array();
    const last = flipped.length - 1;
    flipped[last] = (flipped[last] ?? 0) ^ 0xff;
    s.fs.files.set(VAULT_PATH, flipped);

    const doomed = await s.open();
    await expect(doomed.open()).rejects.toBeInstanceOf(VaultCorruptionError);
  });
});

describe('createRatchetSessionVault tiers', () => {
  it('keyring tier persists across instances', async () => {
    const s = setup();
    const first = await s.open();
    await first.open();
    await first.applyUpdate('alice', testRatchetState());
    first.close();

    const second = await s.open();
    await second.open();
    expect(await second.listSessions()).toEqual(['alice']);
    second.close();
  });

  it('no-keyring, no-opt-in tier warns and persists nothing', async () => {
    const fs = new MemoryVaultFs();
    const warnings: string[] = [];
    const vault = await createRatchetSessionVault({
      account: TEST_ACCOUNT,
      allowInsecureKeyFile: false,
      vaultPath: VAULT_PATH,
      fileOperations: fs,
      keyring: NO_KEYRING,
      warn: (message) => warnings.push(message),
    });
    await vault.open();
    await vault.applyUpdate('alice', testRatchetState());
    vault.close();
    expect(warnings.join('\n')).toContain('will not survive');
    expect(fs.files.has(VAULT_PATH)).toBe(false);
  });

  it('opt-in guarded key file tier persists like the keyring tier', async () => {
    const fs = new MemoryVaultFs();
    const open = () =>
      createRatchetSessionVault({
        account: TEST_ACCOUNT,
        allowInsecureKeyFile: true,
        vaultPath: VAULT_PATH,
        keyFilePath: KEY_PATH,
        fileOperations: fs,
        keyring: NO_KEYRING,
        warn: () => undefined,
      });
    const first = await open();
    await first.open();
    await first.applyUpdate('alice', testRatchetState());
    first.close();
    expect(fs.files.has(KEY_PATH)).toBe(true);

    const second = await open();
    await second.open();
    expect(await second.listSessions()).toEqual(['alice']);
    second.close();
  });
});

describe('wipeE2eeState (logout / device-wipe seam)', () => {
  it('destroys the vault, key file, temps, lock, and keyring entry without opening', async () => {
    const s = setup();
    const vault = await s.open();
    await vault.open();
    await vault.applyUpdate('alice', testRatchetState());
    vault.close();

    await wipeE2eeState({
      account: TEST_ACCOUNT,
      vaultPath: VAULT_PATH,
      fileOperations: s.fs,
      keyring: s.keyring.keyring,
    });

    expect(s.fs.files.has(VAULT_PATH)).toBe(false);
    expect([...s.fs.files.keys()].filter((key) => key.includes('facade'))).toEqual([]);
    expect(s.keyring.entries.size).toBe(0);

    // A brand-new vault opens at generation 0 with no rollback complaint.
    const fresh = await s.open();
    await fresh.open();
    expect(await fresh.listSessions()).toEqual([]);
    fresh.close();
  });

  it('is a no-op when nothing was ever stored', async () => {
    const fs = new MemoryVaultFs();
    const keyring = fakeKeyring();
    await expect(
      wipeE2eeState({
        account: TEST_ACCOUNT,
        vaultPath: VAULT_PATH,
        fileOperations: fs,
        keyring: keyring.keyring,
      }),
    ).resolves.toBeUndefined();
  });
});
