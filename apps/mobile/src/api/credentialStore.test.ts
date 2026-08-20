import { beforeEach, describe, expect, it, vi } from 'vitest';

import { SecureCredentialStore } from './credentialStore.js';

// `vi.mock` calls are hoisted above every import in this file by vitest, so this replaces
// the real `expo-secure-store` module before `SecureCredentialStore` above ever calls it —
// a plain static import needs no dynamic import/top-level await.
const store = new Map<string, string>();

vi.mock('expo-secure-store', () => ({
  getItemAsync: vi.fn((key: string) => Promise.resolve(store.get(key) ?? null)),
  setItemAsync: vi.fn((key: string, value: string) => {
    store.set(key, value);
    return Promise.resolve();
  }),
  deleteItemAsync: vi.fn((key: string) => {
    store.delete(key);
    return Promise.resolve();
  }),
}));

describe('SecureCredentialStore', () => {
  beforeEach(() => {
    store.clear();
  });

  it('round-trips a stored session through expo-secure-store', async () => {
    const credentialStore = new SecureCredentialStore('https://patches-social.fly.dev:8443');
    await credentialStore.save({ accessToken: 'access-1', refreshToken: 'refresh-1' });

    const loaded = await credentialStore.load();
    expect(loaded).toEqual({ accessToken: 'access-1', refreshToken: 'refresh-1' });
  });

  it('returns undefined when nothing is stored', async () => {
    const credentialStore = new SecureCredentialStore('https://patches-social.fly.dev:8443');
    await expect(credentialStore.load()).resolves.toBeUndefined();
  });

  it('treats a corrupt stored value as signed out rather than throwing', async () => {
    const credentialStore = new SecureCredentialStore('https://patches-social.fly.dev:8443');
    store.set('patches_mobile_credentials_https___patches-social.fly.dev_8443', 'not-json');
    await expect(credentialStore.load()).resolves.toBeUndefined();
  });

  it('clear removes the stored session', async () => {
    const credentialStore = new SecureCredentialStore('https://patches-social.fly.dev:8443');
    await credentialStore.save({ accessToken: 'access-1', refreshToken: 'refresh-1' });
    await credentialStore.clear();
    await expect(credentialStore.load()).resolves.toBeUndefined();
  });

  it('keys two different node base URLs separately', async () => {
    const a = new SecureCredentialStore('https://node-a.example:8443');
    const b = new SecureCredentialStore('https://node-b.example:8443');
    await a.save({ accessToken: 'a-token', refreshToken: 'a-refresh' });

    await expect(b.load()).resolves.toBeUndefined();
    await expect(a.load()).resolves.toEqual({ accessToken: 'a-token', refreshToken: 'a-refresh' });
  });
});
