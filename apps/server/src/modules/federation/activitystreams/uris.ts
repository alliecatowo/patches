/**
 * Deterministic local-object URIs (`INITIAL_VISION.md` §110, `docs/architecture/
 * federation.md` §8). Mirrors `Actor.canonicalUri`'s own doc comment: a **local** actor/post's
 * federation URI is *computed* from the node's configured origin, never persisted to
 * `canonical_uri`/stored anywhere — that column stays reserved for what it always meant
 * (null until a stable production domain exists). Only a **remote** object's URI (whatever
 * its own instance published) is ever written to `canonical_uri`.
 *
 * `origin` is `AppConfigService.publicOrigin` with no trailing slash — callers pass it in
 * rather than this module reading config, so it stays a pure/testable function.
 */

export function localActorUri(origin: string, handleNormalized: string): string {
  return `${origin}/users/${encodeURIComponent(handleNormalized)}`;
}

export function localActorInboxUri(origin: string, handleNormalized: string): string {
  return `${localActorUri(origin, handleNormalized)}/inbox`;
}

export function localActorOutboxUri(origin: string, handleNormalized: string): string {
  return `${localActorUri(origin, handleNormalized)}/outbox`;
}

/** One keyset page of an actor's outbox (B-027). `cursor` is the same opaque, server-minted
 * string `first`/`next` always carry — literal `'true'` (the Mastodon/AP convention for "the
 * first page, no cursor yet") when there is nothing to encode. */
export function localActorOutboxPageUri(
  origin: string,
  handleNormalized: string,
  cursor: string,
): string {
  return `${localActorOutboxUri(origin, handleNormalized)}?page=${encodeURIComponent(cursor)}`;
}

export function localActorFollowersUri(origin: string, handleNormalized: string): string {
  return `${localActorUri(origin, handleNormalized)}/followers`;
}

export function localActorFollowingUri(origin: string, handleNormalized: string): string {
  return `${localActorUri(origin, handleNormalized)}/following`;
}

export function localActorKeyId(origin: string, handleNormalized: string): string {
  return `${localActorUri(origin, handleNormalized)}#main-key`;
}

export function localSharedInboxUri(origin: string): string {
  return `${origin}/inbox`;
}

export function localPostUri(origin: string, postId: string): string {
  return `${origin}/posts/${postId}`;
}

/** Strips a `#fragment` (e.g. a signature `keyId` like `.../users/bob#main-key`) down to the
 * actor document URI it names. */
export function stripFragment(uri: string): string {
  const hashIndex = uri.indexOf('#');
  return hashIndex === -1 ? uri : uri.slice(0, hashIndex);
}

/** `true` when `uri` was minted by this node (`origin`) — the fast path that lets the inbox
 * resolve a reference to one of our own actors/posts without a `canonical_uri` DB lookup. */
export function isLocalUri(origin: string, uri: string): boolean {
  return uri === origin || uri.startsWith(`${origin}/`);
}

/** Extracts the UUID from a local post URI (`${origin}/posts/{uuid}`), or `undefined` if
 * `uri` is not one. */
export function parseLocalPostUri(origin: string, uri: string): string | undefined {
  const prefix = `${origin}/posts/`;
  if (!uri.startsWith(prefix)) return undefined;
  const id = uri.slice(prefix.length);
  return UUID_PATTERN.test(id) ? id : undefined;
}

/** Extracts the normalized handle from a local actor URI (`${origin}/users/{handle}`), or
 * `undefined` if `uri` is not one (or is a sub-resource like `/users/bob/inbox`). */
export function parseLocalActorUri(origin: string, uri: string): string | undefined {
  const prefix = `${origin}/users/`;
  if (!uri.startsWith(prefix)) return undefined;
  const rest = uri.slice(prefix.length);
  if (rest.length === 0 || rest.includes('/')) return undefined;
  return decodeURIComponent(rest);
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
