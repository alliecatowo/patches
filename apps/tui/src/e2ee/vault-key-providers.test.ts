import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  EphemeralVaultKeyProvider,
  GuardedFileVaultKeyProvider,
  KeyringVaultKeyProvider,
  NO_KEYRING,
  PassphraseVaultKeyProvider,
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

  it('sweeps a crashed rotation temp so no plaintext wrapping key is left behind', async () => {
    const { provider, fs } = make();
    const original = await provider.loadOrCreate();
    // A process that died between the exclusive open and the rename leaves this: a
    // 0600 file containing the wrapping key in the clear.
    const orphan = `${keyPath}.4242.11111111-2222-3333-4444-555555555555.tmp`;
    fs.files.set(orphan, new TextEncoder().encode('{"v":1,"k":"AAAA","g":0}\n'));

    const reopened = await new GuardedFileVaultKeyProvider({
      account: TEST_ACCOUNT,
      allowInsecure: true,
      path: keyPath,
      fileOperations: fs,
      warn: () => undefined,
    }).loadOrCreate();

    expect([...fs.files.keys()]).toEqual([keyPath]);
    // Sweeping is cleanup, never a reset: the live key is untouched.
    expect(reopened.wrappingKey).toEqual(original.wrappingKey);
  });

  it('sweeps temps on delete so a wipe leaves no recoverable key', async () => {
    const { provider, fs } = make();
    await provider.loadOrCreate();
    fs.files.set(`${keyPath}.99.abc.tmp`, new TextEncoder().encode('{"v":1,"k":"AAAA","g":0}\n'));
    await provider.delete();
    expect([...fs.files.keys()]).toEqual([]);
  });

  it('leaves unrelated files in the key directory alone', async () => {
    const { provider, fs } = make();
    await provider.loadOrCreate();
    const neighbour = '/cfg/patches/e2ee/keys/other.key';
    fs.files.set(neighbour, new TextEncoder().encode('{"v":1,"k":"AAAA","g":0}\n'));
    fs.files.set(`${neighbour}.7.x.tmp`, new TextEncoder().encode('not ours'));
    await provider.advanceGeneration(9);
    expect([...fs.files.keys()].sort()).toEqual(
      [neighbour, `${neighbour}.7.x.tmp`, keyPath].sort(),
    );
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

describe('PassphraseVaultKeyProvider', () => {
  const keyPath = '/cfg/patches/e2ee/keys/test.pkey';

  function make(overrides: { allowInsecure?: boolean; passphrase?: string } = {}) {
    const fs = new MemoryVaultFs();
    const warnings: string[] = [];
    const passphrase = overrides.passphrase ?? 'correct horse battery staple';
    const provider = new PassphraseVaultKeyProvider({
      account: TEST_ACCOUNT,
      allowInsecure: overrides.allowInsecure ?? true,
      getPassphrase: () => Promise.resolve(passphrase),
      path: keyPath,
      fileOperations: fs,
      warn: (message) => warnings.push(message),
    });
    return { provider, fs, warnings };
  }

  it('refuses to construct without explicit opt-in', () => {
    expect(() => make({ allowInsecure: false })).toThrow(/allow-insecure-credential-file/);
  });

  it('warns that the tier is weaker than a keyring and never mentions plaintext key storage', () => {
    const { warnings } = make();
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('passphrase');
  });

  it('round-trips the key and generation across instances given the same passphrase', async () => {
    const { provider, fs } = make();
    const first = await provider.loadOrCreate();
    await provider.advanceGeneration(3);
    const second = await new PassphraseVaultKeyProvider({
      account: TEST_ACCOUNT,
      allowInsecure: true,
      getPassphrase: () => Promise.resolve('correct horse battery staple'),
      path: keyPath,
      fileOperations: fs,
      warn: () => undefined,
    }).loadOrCreate();
    expect(second.wrappingKey).toEqual(first.wrappingKey);
    expect(second.generation).toBe(3);
  });

  it('never writes the raw wrapping key or the passphrase to disk in the clear', async () => {
    const { provider, fs } = make({ passphrase: 'a very secret passphrase indeed' });
    const { wrappingKey } = await provider.loadOrCreate();
    const raw = fs.files.get(keyPath);
    expect(raw).toBeDefined();
    const text = new TextDecoder().decode(raw ?? new Uint8Array());
    expect(text).not.toContain('a very secret passphrase indeed');
    expect(text).not.toContain(Buffer.from(wrappingKey).toString('base64'));
    const parsed = JSON.parse(text) as { salt: string; nonce: string; wrapped: string };
    expect(parsed.salt).toBeTruthy();
    expect(parsed.nonce).toBeTruthy();
    expect(parsed.wrapped).toBeTruthy();
  });

  it('fails closed on the wrong passphrase rather than regenerating a key', async () => {
    const { fs } = make({ passphrase: 'the real passphrase' });
    const provider = new PassphraseVaultKeyProvider({
      account: TEST_ACCOUNT,
      allowInsecure: true,
      getPassphrase: () => Promise.resolve('the real passphrase'),
      path: keyPath,
      fileOperations: fs,
      warn: () => undefined,
    });
    await provider.loadOrCreate();

    const wrongProvider = new PassphraseVaultKeyProvider({
      account: TEST_ACCOUNT,
      allowInsecure: true,
      getPassphrase: () => Promise.resolve('a wrong guess'),
      path: keyPath,
      fileOperations: fs,
      warn: () => undefined,
    });
    await expect(wrongProvider.loadOrCreate()).rejects.toBeInstanceOf(VaultCorruptionError);
  });

  it('changePassphrase re-wraps the same key under a new passphrase without touching it', async () => {
    const { provider, fs } = make({ passphrase: 'old passphrase' });
    const original = await provider.loadOrCreate();
    await provider.changePassphrase('new passphrase');

    const reopened = await new PassphraseVaultKeyProvider({
      account: TEST_ACCOUNT,
      allowInsecure: true,
      getPassphrase: () => Promise.resolve('new passphrase'),
      path: keyPath,
      fileOperations: fs,
      warn: () => undefined,
    }).loadOrCreate();
    expect(reopened.wrappingKey).toEqual(original.wrappingKey);
    expect(reopened.generation).toBe(original.generation);

    const staleAttempt = new PassphraseVaultKeyProvider({
      account: TEST_ACCOUNT,
      allowInsecure: true,
      getPassphrase: () => Promise.resolve('old passphrase'),
      path: keyPath,
      fileOperations: fs,
      warn: () => undefined,
    });
    await expect(staleAttempt.loadOrCreate()).rejects.toBeInstanceOf(VaultCorruptionError);
  });

  it('changePassphrase requires a previously loaded key', async () => {
    const { provider } = make();
    await expect(provider.changePassphrase('anything')).rejects.toThrow(
      /requires an already-loaded vault key/,
    );
  });

  it('sweeps temps on delete so no wrapped key record is left behind', async () => {
    const { provider, fs } = make();
    await provider.loadOrCreate();
    fs.files.set(`${keyPath}.99.abc.tmp`, new TextEncoder().encode('leftover'));
    await provider.delete();
    expect([...fs.files.keys()]).toEqual([]);
  });

  it('fails closed on a malformed key file', async () => {
    const { fs } = make();
    fs.files.set(keyPath, new TextEncoder().encode('{oops'));
    const provider = new PassphraseVaultKeyProvider({
      account: TEST_ACCOUNT,
      allowInsecure: true,
      getPassphrase: () => Promise.resolve('anything'),
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

  it('prefers the passphrase tier over the guarded file when both are opted into', async () => {
    const fs = new MemoryVaultFs();
    const provider = await createVaultKeyProvider({
      account: TEST_ACCOUNT,
      allowInsecureFile: true,
      keyring: NO_KEYRING,
      fileOperations: fs,
      warn: () => undefined,
      passphrase: { getPassphrase: () => Promise.resolve('a passphrase'), path: '/cfg/p.pkey' },
    });
    expect(provider).toBeInstanceOf(PassphraseVaultKeyProvider);
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
