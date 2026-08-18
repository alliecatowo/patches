/** Shared literals for the federation HTTP surface (`docs/research/activitypub.md`). */

/** The AS2 base context every document this node emits carries, plus the Patches
 * page-manifest extension term (P8-007) — a namespaced `@context` entry, so a plain
 * ActivityPub server that does not understand `patches:pageManifest` simply ignores it
 * (`docs/architecture/federation.md` §7.5). */
export const ACTIVITYSTREAMS_CONTEXT: readonly (string | Record<string, string>)[] = [
  'https://www.w3.org/ns/activitystreams',
  {
    security: 'https://w3id.org/security#',
    patches: 'https://patches.social/ns#',
    pageManifest: 'patches:pageManifest',
  },
];

/** What Patches sends for every AS2 document it emits, and what it accepts on GET (Mastodon's
 * documented convention — the W3C-mandated `application/ld+json; profile="..."` is accepted
 * too, see `activitystreams.ts`'s content-negotiation helper). */
export const ACTIVITY_JSON_CONTENT_TYPE = 'application/activity+json';
export const LD_JSON_AS2_CONTENT_TYPE =
  'application/ld+json; profile="https://www.w3.org/ns/activitystreams"';
export const JRD_JSON_CONTENT_TYPE = 'application/jrd+json';

/** P8-006: caps applied uniformly to every inbound activity body and every response `safe-
 * fetch` reads from a remote peer. */
export const MAX_INBOUND_BODY_BYTES = 1024 * 1024; // 1 MiB
export const MAX_JSON_DEPTH = 20;
export const SAFE_FETCH_TIMEOUT_MS = 10_000;
export const SAFE_FETCH_MAX_REDIRECTS = 3;

/** P8-005: signed-request clock skew tolerance for the `Date` header. */
export const SIGNATURE_CLOCK_SKEW_MS = 5 * 60_000;
