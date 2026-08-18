/** `true` if `accept` (the request's `Accept` header, possibly undefined) is satisfied by an
 * AS2 JSON representation — `application/activity+json`, the W3C-mandated `application/
 * ld+json` (with or without the AS2 profile param), plain `application/json`, or a wildcard.
 * Absent `Accept` is treated as "anything goes" (curl/browsers omitting it is common and
 * should not 406). */
export function acceptsActivityJson(accept: string | undefined): boolean {
  if (accept === undefined || accept.trim().length === 0) return true;
  const value = accept.toLowerCase();
  return (
    value.includes('application/activity+json') ||
    value.includes('application/ld+json') ||
    value.includes('application/json') ||
    value.includes('*/*')
  );
}
