import * as Crypto from 'expo-crypto';

/**
 * Hermes (React Native's default JS engine) has no Web Crypto implementation —
 * `crypto.randomUUID` is undefined by default (docs/research/expo-react-native.md §3,
 * flagged there as secondary-source but consistent with well-known Hermes behavior).
 * `@patches/client`'s `bindService` (`packages/client/src/api.ts`) calls
 * `crypto.randomUUID()` for the `x-request-id` header on every RPC; that package is
 * deliberately transport-agnostic (ADR 0016 §9) and must not gain an Expo-only
 * dependency, so the fix lives here instead: install `expo-crypto`'s official
 * `randomUUID()` onto `globalThis.crypto` once, before any code imports `@patches/client`
 * (see `index.ts`).
 */
interface MinimalCrypto {
  randomUUID: () => string;
}

const target = globalThis as unknown as { crypto?: MinimalCrypto };

if (typeof target.crypto?.randomUUID !== 'function') {
  target.crypto = { ...target.crypto, randomUUID: () => Crypto.randomUUID() };
}

/**
 * Typed accessor for the `globalThis.crypto.randomUUID` installed above. `apps/mobile`'s
 * `tsconfig.json` has no `"DOM"` lib (unlike `apps/web`/`@patches/client`, which need it for
 * `HeadersInit`), so a bare `crypto.randomUUID()` call site doesn't typecheck here — screens
 * that need a client-generated id (e.g. `RegisterRequest.client_request_id`) call this instead
 * of reaching for the global directly.
 */
export function randomUUID(): string {
  return Crypto.randomUUID();
}
