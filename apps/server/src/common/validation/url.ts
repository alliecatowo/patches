import { z } from 'zod';

/**
 * Shared URL-scheme allowlist for every user-supplied URL (spec §104: link posts' `link_url`,
 * actor `website_url` — links inside free-text bio are not extracted/validated here, since
 * that needs render-time link detection, not a single-field schema; see `docs/agents/
 * LEARNINGS.md`/this task's report for the follow-up).
 *
 * `z.url()` alone is not enough (see LEARNINGS: zod-v4-url-validation — `z.httpUrl()` rejects
 * `localhost`, which a self-hosted node's own links must not) and does not reject embedded
 * credentials (`https://user:pass@host/...`), which is exactly the shape an SSRF/phishing
 * payload uses to smuggle a trusted-looking prefix in front of the real host. This module is
 * the one place that combines "http(s) only" with "no credentials" and a length bound, so
 * every call site enforces the same three rules instead of three slightly different regexes.
 *
 * `packages/domain` picked up its own Pages-specific link-scheme allowlist
 * (`ALLOWED_LINK_SCHEMES`) in a concurrent change; this module intentionally stays in
 * `apps/server` rather than merging into that package right now — see this task's report for
 * an A-020-style consolidation follow-up once both land.
 */

/** Exactly `http:`/`https:` (spec §104) — never `javascript:`, `data:`, `file:`, or anything
 * else, and never added to speculatively. */
export const ALLOWED_URL_SCHEMES = ['http:', 'https:'] as const;

/**
 * Builds a `z.url()`-based schema that also rejects embedded userinfo (`user:pass@host`) and
 * bounds the string length before the URL parse ever runs. `maxLength` should match whatever
 * budget the caller already advertises (spec §58) — this function does not invent its own.
 */
export function safeUrlSchema(maxLength: number, label = 'URL'): z.ZodType<string> {
  return z
    .string()
    .trim()
    .max(maxLength, `${label} must be at most ${String(maxLength)} characters`)
    .pipe(z.url({ protocol: /^https?$/, error: `${label} must be a valid http(s) URL` }))
    .refine((value) => !hasEmbeddedCredentials(value), {
      message: `${label} must not contain a username or password`,
    });
}

/**
 * Throws-on-failure form for call sites that already have a plain string and want a single
 * boolean-ish check rather than a zod pipeline (e.g. a value assembled server-side, not
 * parsed fresh from a request). Returns the trimmed, validated URL.
 */
export function assertSafeUrl(value: string, maxLength: number, label = 'URL'): string {
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > maxLength) {
    throw new Error(`${label} must be at most ${String(maxLength)} characters`);
  }
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error(`${label} must be a valid http(s) URL`);
  }
  if (!(ALLOWED_URL_SCHEMES as readonly string[]).includes(parsed.protocol)) {
    throw new Error(`${label} must be a valid http(s) URL`);
  }
  if (hasEmbeddedCredentials(trimmed)) {
    throw new Error(`${label} must not contain a username or password`);
  }
  return trimmed;
}

/** `URL#username`/`URL#password` are the WHATWG-parsed form; checking those rather than a
 * regex on the raw string is what makes this robust to percent-encoding tricks. */
function hasEmbeddedCredentials(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.username.length > 0 || parsed.password.length > 0;
  } catch {
    // Already rejected by the caller's own parse; nothing more to say here.
    return false;
  }
}
