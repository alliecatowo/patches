/**
 * Identity binding for fetched ActivityPub documents (audit S-C1). A document's self-declared
 * `id` is only trustworthy when it names the URL we actually fetched (or the final URL after
 * redirects) and lives on the same origin as the server that answered. Otherwise a hostile
 * server can claim to be any actor/object on the network.
 */

/** Returns the origin of `uri`, or `undefined` when it is not a parseable absolute URL. */
export function originOf(uri: string): string | undefined {
  try {
    return new URL(uri).origin;
  } catch {
    return undefined;
  }
}

export function sameOrigin(a: string, b: string): boolean {
  const originA = originOf(a);
  return originA !== undefined && originA === originOf(b);
}

/**
 * True when `declaredId` is the URL that was requested or the URL the request ended at, and
 * is same-origin with the final URL that served the bytes.
 */
export function isIdBoundToFetch(
  declaredId: unknown,
  requestedUri: string,
  finalUrl: string,
): declaredId is string {
  if (typeof declaredId !== 'string') return false;
  if (declaredId !== requestedUri && declaredId !== finalUrl) return false;
  return sameOrigin(declaredId, finalUrl);
}
