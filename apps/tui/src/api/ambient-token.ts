/**
 * The access token of the currently signed-in session, if any (B-040).
 *
 * `PatchesApi`'s methods take an explicit `accessToken` only where the call has always
 * *required* auth. Every read RPC was written to work anonymously, so those call sites pass
 * nothing — which is correct against a node that allows public reads, and wrong against one
 * with `PUBLIC_READ=false`, where a signed-in user was being treated as anonymous and told
 * "This node requires sign-in to read" on their own profile.
 *
 * Rather than thread a token through ~80 wrapper methods and every screen, the session
 * manager publishes the current token here and `callMetadata` uses it as the fallback: an
 * explicit per-call token still wins, and a call made while signed out still sends no
 * `authorization` header at all.
 *
 * Deliberately a module-level single value: one TUI process talks to exactly one node as
 * exactly one account (multi-account runs use separate XDG homes, `docs/operations/try-it.md`).
 * Kept in its own leaf module so `auth/session.ts` can write it without importing the grpc
 * client, and so tests can reset it.
 */
let ambientAccessToken: string | undefined;

/** Publishes (or, with `undefined`, clears) the token every RPC falls back to. */
export function setAmbientAccessToken(token: string | undefined): void {
  ambientAccessToken = token;
}

/** The fallback token, or `undefined` when signed out. */
export function getAmbientAccessToken(): string | undefined {
  return ambientAccessToken;
}
