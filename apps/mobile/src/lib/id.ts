import * as Crypto from 'expo-crypto';

/** `CreatePostRequest.client_request_id` (spec §45 idempotency key). Uses `expo-crypto`
 * directly rather than the `globalThis.crypto` polyfill installed in `src/polyfills.ts` —
 * that polyfill exists only so `@patches/client`'s internals keep working unmodified;
 * app code importing `expo-crypto` itself needs no polyfill indirection. */
export function newClientRequestId(): string {
  return Crypto.randomUUID();
}
