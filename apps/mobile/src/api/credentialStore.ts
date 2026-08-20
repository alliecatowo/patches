import * as SecureStore from 'expo-secure-store';
import type { CredentialStore, StoredSession } from '@patches/client';

const KEY_PREFIX = 'patches_mobile_credentials';

/**
 * `expo-secure-store`-backed `CredentialStore` (task brief: tokens live in SecureStore,
 * never `AsyncStorage`, never plaintext — SecureStore is Keychain-backed on iOS and
 * Keystore-encrypted `SharedPreferences` on Android, `docs/research/expo-react-native.md`
 * §2). Keyed by the node's base URL, same as `apps/web`'s `LocalStorageCredentialStore`,
 * so a token from one node is never read back for another (ADR 0016 §5: a token is bound
 * to the node that issued it).
 */
export class SecureCredentialStore implements CredentialStore {
  private readonly key: string;

  constructor(nodeBaseUrl: string) {
    // SecureStore keys must match `/^[\w.-]+$/` — a raw URL contains `:`/`/` and isn't valid.
    this.key = `${KEY_PREFIX}_${encodeKey(nodeBaseUrl)}`;
  }

  async load(): Promise<StoredSession | undefined> {
    const raw = await SecureStore.getItemAsync(this.key);
    if (raw === null) return undefined;
    try {
      const parsed: unknown = JSON.parse(raw);
      return isStoredSession(parsed) ? parsed : undefined;
    } catch {
      // Corrupt/old-shape stored value — treat as signed out rather than throwing.
      return undefined;
    }
  }

  async save(session: StoredSession): Promise<void> {
    await SecureStore.setItemAsync(this.key, JSON.stringify(session));
  }

  async clear(): Promise<void> {
    // iOS Keychain entries persist across an uninstall/reinstall with the same bundle id
    // (docs/research/expo-react-native.md §2), so logout must delete explicitly rather than
    // relying on any OS-level cleanup.
    await SecureStore.deleteItemAsync(this.key);
  }
}

function encodeKey(value: string): string {
  return value.replace(/[^\w.-]/g, '_');
}

function isStoredSession(value: unknown): value is StoredSession {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Record<string, unknown>;
  return typeof record['accessToken'] === 'string' && typeof record['refreshToken'] === 'string';
}
