import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  EphemeralVaultKeyProvider,
  GuardedFileVaultKeyProvider,
  KeyringVaultKeyProvider,
  NO_KEYRING,
  VAULT_KEYRING_SERVICE,
  createVaultKeyProvider,
  vaultAccountKey,
} from './vault-key-providers.js';
import { VaultCorruptionError } from './vault-errors.js';
import { MemoryVaultFs, TEST_ACCOUNT, fakeKeyring } from './test-support.js';

const ACCOUNT_KEY = vaultAccountKey(TEST_ACCOUNT);

describe('KeyringVaultKeyProvider', () => {
  it('creates a key once and reloads the same key and generation', async () => {
    const { keyring } = fakeKeyring();
    const provider = new KeyringVaultKeyProvider({ account: TEST_ACCOUNT, keyring });
    const first = await provider.loadOrCreate();
    const second = await new KeyringVaultKeyProvider({
      account: TEST_ACCOUNT,
      keyring,
    }).loadOrCreate();
    expect(first.generation).toBe(0);
    expect(second.wrappingKey).toEqual(first.wrappingKey);
  });

  it('advances the generation monotonically and never decreases it', async () => {
    const { keyring } = fakeKeyring();
    const provider = new KeyringVaultKeyProvider({ account: TEST_ACCOUNT, keyring });
    await provider.loadOrCreate();
    await provider.advanceGeneration(5);
    await provider.advanceGeneration(3);
    expect((await provider.loadOrCreate()).generation).toBe(5);
  });

  it('fails closed on a malformed entry instead of regenerating', async () => {
    const { keyring, entries } = fakeKeyring();
    entries.set(`${VAULT_KEYRING_SERVICE}\u0000${ACCOUNT_KEY}`, 'not json');
    const provider = new KeyringVaultKeyProvider({ account: TEST_ACCOUNT, keyring });
    await expect(provider.loadOrCreate()).rejects.toBeInstanceOf(VaultCorruptionError);
    expect(entries.get(`${VAULT_KEYRING_SERVICE}\u0000${ACCOUNT_KEY}`)).toBe('not json');
  });

  it('delete removes the entry entirely', async () => {
    const { keyring, entries } = fakeKeyring();
    const provider = new KeyringVaultKeyProvider({ account: TEST_ACCOUNT, keyring });
    await provider.loadOrCreate();
    await provider.delete();
    expect(entries.has(`${VAULT_KEYRING_SERVICE}\u0000${ACCOUNT_KEY}`)).toBe(false);
  });
});

describe('GuardedFileVaultKeyProvider', () => {
  const keyPath = '/cfg/patches/e2ee/keys/test.key';

  function make(overrides: { allowInsecure?: boolean } = {}) {
    const fs = new MemoryVaultFs();
    const warnings: string[] = [];
    const provider = new GuardedFileVaultKeyProvider({
      account: TEST_ACCOUNT,
      allowInsecure: overrides.allowInsecure ?? true,
      path: keyPath,
      fileOperations: fs,
      warn: (message) => warnings.push(message),
    });
    return { provider, fs, warnings };
  }

  it('refuses to construct without explicit opt-in', () => {
    expect(() => make({ allowInsecure: false })).toThrow(/allow-insecure-credential-file/);
  });

  it('warns loudly that the key file is weaker than the keyring', () => {
    const { warnings } = make();
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('plaintext');
  });

  it('round-trips the key across instances with mode 0600', async () => {
    const { provider, fs } = make();
    const first = await provider.loadOrCreate();
    const second = await new GuardedFileVaultKeyProvider({
      account: TEST_ACCOUNT,
      allowInsecure: true,
      path: keyPath,
      fileOperations: fs,
      warn: () => undefined,
    }).loadOrCreate();
    expect(second.wrappingKey).toEqual(first.wrappingKey);
    expect(fs.modes.get(keyPath)).toBe(0o600);
  });

  it('writes nothing but the single guarded key file — no temps or copies remain', async () => {
    const { provider, fs } = make();
    await provider.loadOrCreate();
    await provider.advanceGeneration(4);
    expect([...fs.files.keys()]).toEqual([keyPath]);
    expect(fs.modes.get(keyPath)).toBe(0o600);
  });

  it('fails closed on a malformed key file', async () => {
    const { fs } = make();
    fs.files.set(keyPath, new TextEncoder().encode('{oops'));
    const provider = new GuardedFileVaultKeyProvider({
      account: TEST_ACCOUNT,
      allowInsecure: true,
      path: keyPath,
      fileOperations: fs,
      warn: () => undefined,
    });
    await expect(provider.loadOrCreate()).rejects.toBeInstanceOf(VaultCorruptionError);
  });
});

describe('EphemeralVaultKeyProvider', () => {
  it('is non-persistent and mints a fresh key per process instance', async () => {
    const a = new EphemeralVaultKeyProvider();
    const b = new EphemeralVaultKeyProvider();
    expect(a.persistent).toBe(false);
    expect((await a.loadOrCreate()).wrappingKey).not.toEqual((await b.loadOrCreate()).wrappingKey);
  });
});

describe('createVaultKeyProvider', () => {
  it('prefers the keyring when one is available', async () => {
    const { keyring } = fakeKeyring();
    const provider = await createVaultKeyProvider({
      account: TEST_ACCOUNT,
      allowInsecureFile: false,
      keyring,
    });
    expect(provider.persistent).toBe(true);
    expect(provider).toBeInstanceOf(KeyringVaultKeyProvider);
  });

  it('falls back to the guarded file only on explicit opt-in', async () => {
    const fs = new MemoryVaultFs();
    const provider = await createVaultKeyProvider({
      account: TEST_ACCOUNT,
      allowInsecureFile: true,
      keyring: NO_KEYRING,
      keyFilePath: join('/cfg', 'k.key'),
      fileOperations: fs,
      warn: () => undefined,
    });
    expect(provider).toBeInstanceOf(GuardedFileVaultKeyProvider);
  });

  it('defaults to the ephemeral provider with a warning when nothing secure exists', async () => {
    const warnings: string[] = [];
    const provider = await createVaultKeyProvider({
      account: TEST_ACCOUNT,
      allowInsecureFile: false,
      keyring: NO_KEYRING,
      warn: (message) => warnings.push(message),
    });
    expect(provider).toBeInstanceOf(EphemeralVaultKeyProvider);
    expect(warnings.join('\n')).toContain('will not survive');
  });
});
