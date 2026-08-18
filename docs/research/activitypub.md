# ActivityPub federation (Stage F1 two-instance lab) — Reference

Verified 2026-08-18 against the W3C Recommendations for ActivityPub and ActivityStreams 2.0
(w3.org/TR), RFC 7033 (WebFinger), `draft-cavage-http-signatures-12` and RFC 9421 on
datatracker.ietf.org, RFC 3230/RFC 5843 for the `Digest` header, and docs.joinmastodon.org for
the one production-scale interop convention this note leans on (Mastodon is not required for
F1, spec §108, but its docs are the de facto interoperability profile for later stages and the
only place several ambiguous points in the specs are resolved in practice). Targets Stage F1
per `INITIAL_VISION.md` §108: a two-Patches-instance federation lab, no Mastodon interop yet.

Scope: this is a protocol reference for `implementer` to build against. It does not prescribe
NestJS module boundaries — see spec §105 (`FederationGateway` seam) and §109–110 (security,
persistence) for the architecture this must sit behind.

## 1. ActivityPub (W3C Recommendation)

Source: <https://www.w3.org/TR/activitypub/> (accessed 2026-08-18).

### 1.1 Actor object shape (§4.1 "Actor objects")

Required:

- `id` — canonical actor URI
- `type` — e.g. `Person`
- `inbox` — URI of an `OrderedCollection`
- `outbox` — URI of an `OrderedCollection`

Recommended by the spec text (§4.1): `following`, `followers` collections.

Optional, spec-defined: `liked` collection, `preferredUsername`, `endpoints` (a map of
server-wide endpoint URIs on the actor, including `endpoints.sharedInbox`,
`endpoints.oauthAuthorizationEndpoint`, `endpoints.oauthTokenEndpoint`,
`endpoints.provideClientKey`, `endpoints.signClientKey`).

**`publicKey` is NOT part of the W3C ActivityPub Recommendation.** It comes from the (separate,
non-normative-here) Linked Data Signatures / `security-vocab` convention that Mastodon and most
of the Fediverse adopted as a de facto standard for actor key discovery. Documented shape, per
Mastodon (§6.2 below), since the W3C text says nothing about it:

```json
"publicKey": {
  "id": "https://example.com/users/alice#main-key",
  "owner": "https://example.com/users/alice",
  "publicKeyPem": "-----BEGIN PUBLIC KEY-----\n...\n-----END PUBLIC KEY-----\n"
}
```

`inferred:` Patches F1 should emit `publicKey` in this exact shape (id/owner/publicKeyPem) since
it is the only convention any implementation (including a second Patches node) will look for,
even though it is outside the W3C document itself.

### 1.2 Content negotiation (§3.2, §6, §7)

- Inbox POST (client-to-server, §6) and outbox POST: **MUST** be made with
  `Content-Type: application/ld+json; profile="https://www.w3.org/ns/activitystreams"`.
- Server responses to GET (actor, objects, collections, §3.2): **MUST** respond to
  `application/ld+json; profile="https://www.w3.org/ns/activitystreams"` and **SHOULD** also
  respond to `application/activity+json`.
- §7 (server-to-server) permits servers to interpret `application/activity+json` on inbound
  POSTs equivalently to the full profiled `ld+json` type.

`inferred:` in practice (confirmed by Mastodon docs §6.2 below) every real implementation sends
and accepts plain `application/activity+json` for S2S traffic; Patches should accept both on
inbound requests and may send either — sending `application/activity+json` is simplest and is
what Mastodon itself sends.

### 1.3 Outbox GET semantics (§5.1)

> "The outbox MUST be an OrderedCollection. The outbox stream contains activities the user has
> published, subject to the ability of the requestor to retrieve the activity (that is, the
> contents of the outbox are filtered by the permissions of the person reading it)."

General collection ordering rule (§5): "An OrderedCollection MUST be presented consistently in
reverse chronological order." — same rule as `INITIAL_VISION.md`'s no-offset-pagination
constraint (§153); use the AS2 paging model (§2 below), not offset params.

### 1.4 Inbox POST / delivery (§7, §7.1)

- §7: activities delivered via S2S **MUST** carry an `object` property for: `Create`, `Update`,
  `Delete`, `Follow`, `Add`, `Remove`, `Like`, `Block`, `Undo`. `Add`/`Remove` **additionally
  MUST** carry `target`.
- §7.1 delivery algorithm: resolve target actor inboxes (dereferencing addressed collections as
  needed), de-duplicate recipients, exclude the activity's own actor, then
  "An HTTP POST request (with authorization of the submitting user) is then made to the inbox,
  with the Activity as the body."
- §7 notes servers **SHOULD** deliver to `sharedInbox` where present on a recipient's `endpoints`
  and the audience allows it, to avoid redundant per-actor delivery — this is where
  `endpoints.sharedInbox` (§1.1) is used.
- Authentication of delivery: the spec deliberately does not mandate a mechanism. §B.2 / §3:
  "federated servers also should not trust content received from a server other than the
  content's origin without some form of verification... mechanisms such as checking signatures
  would be better if available. No particular mechanism for verification is authoritatively
  specified by this document." This is why HTTP Signatures (§3 below), not part of the AP spec
  itself, is required in practice — Patches F1 must implement it for both directions
  (self-interop) even though the Recommendation only gestures at "signatures... would be
  better."

### 1.5 Activity types needed for F1

All are `Activity` types (or `Tombstone`, an `Object` type) — exact `type` strings, defined in
ActivityStreams vocabulary (§2 below) and given side effects in ActivityPub:

| Type     | AP inbox side effect (§7.x)                                                                                                       | AP outbox side effect (§6.x)                                                                                                                                                          |
| -------- | --------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Follow` | (§7.5) receiving server SHOULD generate `Accept` or `Reject` with the `Follow` as `object`, deliver to the Follow's `actor`       | (§6.5) sender SHOULD add `object` to actor's `following` only once `Accept` is received back                                                                                          |
| `Accept` | (§7.6) if `object` is a `Follow` the receiver previously sent, receiver SHOULD add the Accept's `actor` to receiver's `following` | —                                                                                                                                                                                     |
| `Undo`   | (§7.12) undo side effects of the referenced activity; `Undo` and the undone activity MUST share the same `actor` (§6.10)          | (§6.10) same rule client-side                                                                                                                                                         |
| `Create` | (§7.2) "surprisingly few side effects" — store the activity and its embedded `object`                                             | (§6.2) creates the embedded `object`                                                                                                                                                  |
| `Note`   | object type embedded in `Create`, not an activity itself                                                                          | —                                                                                                                                                                                     |
| `Delete` | (§7.4) receiver SHOULD remove its representation of `object` by `id`, MAY replace with a `Tombstone`                              | (§6.4) origin server MAY replace `object` with a `Tombstone`; if the deleted object is subsequently requested, respond `410 Gone` if serving a `Tombstone` body, else `404 Not Found` |
| `Like`   | (§7.10) SHOULD increment the object's like count by adding the activity to its `likes` collection if present                      | (§6.8) SHOULD add `object` to actor's `liked` collection                                                                                                                              |

`Undo` of `Follow` is the mechanism for unfollow — there is no separate `Unfollow` type; confirm
`object` of the `Undo` is the original `Follow` activity (ideally by `id`, so both sides can
correlate it).

## 2. ActivityStreams 2.0 (Core + Vocabulary)

Sources: <https://www.w3.org/TR/activitystreams-core/>,
<https://www.w3.org/TR/activitystreams-vocabulary/> (both accessed 2026-08-18).

### 2.1 `@context`

Core spec: implementations producing AS2 documents SHOULD include `@context` referencing the
normative JSON-LD context `https://www.w3.org/ns/activitystreams` (an `http://` variant is also
accepted). In compacted JSON-LD form (the form every real implementation emits, including
Mastodon), vocabulary terms appear unprefixed — `"type": "Person"`, `"type": "Follow"`, etc. —
not as the full `https://www.w3.org/ns/activitystreams#Person` IRI. The full-IRI forms only
matter for JSON-LD expansion/reasoning; **do not emit or expect full IRIs in `type` fields on
the wire** — use the short vocabulary terms shown in §2.3 below.

### 2.2 Extending the vocabulary (custom `patches:pageManifest`)

Core spec example for adding a namespaced extension term to `@context`:

```json
{
  "@context": {
    "@vocab": "https://www.w3.org/ns/activitystreams",
    "ext": "https://canine-extension.example/terms/",
    "@language": "en"
  },
  "type": "Note",
  "ext:nose": 0
}
```

For Patches, this means a `Note` (or actor) carrying a `patches:pageManifest` extension should
use an array-form `@context` combining the AS2 context with a Patches-owned term mapping:

```json
{
  "@context": [
    "https://www.w3.org/ns/activitystreams",
    { "patches": "https://patches.example/ns#" }
  ],
  "type": "Note",
  "patches:pageManifest": { "...": "..." }
}
```

`inferred:` the array form (base AS2 context + one small object adding local terms) is the
universal convention (it is exactly what Mastodon does for its own `toot:`, `ostatus:`, etc.
extensions per its actor documents) though neither W3C doc shows the array form explicitly —
only the single-object form shown above. Use a real, Patches-controlled URL as the term IRI
prefix (does not need to be dereferenceable for F1, but should be a URL Patches actually owns
before F2/F3 to avoid colliding with another implementation's private vocabulary).

### 2.3 Vocabulary type strings and required properties

Section citations are to `activitystreams-vocabulary`. Compacted `type` values (see §2.1):

| Term        | Section             | `type` string | Required/notable properties                                              |
| ----------- | ------------------- | ------------- | ------------------------------------------------------------------------ |
| `Person`    | §3.2 Actor Types    | `Person`      | none beyond `Object`; commonly `name`, `url`, `icon`                     |
| `Follow`    | §3.1 Activity Types | `Follow`      | `actor`, `object` (the actor being followed)                             |
| `Accept`    | §3.1                | `Accept`      | `actor`, `object` (the `Follow`); optional `target`                      |
| `Undo`      | §3.1                | `Undo`        | `actor`, `object` (the prior activity, same `actor`)                     |
| `Create`    | §3.1                | `Create`      | `actor`, `object` (the created object, e.g. `Note`)                      |
| `Note`      | §3.3 Object Types   | `Note`        | not an activity; `content`, `published`, `attributedTo` typical          |
| `Delete`    | §3.1                | `Delete`      | `actor`, `object` (id of deleted object); optional `origin`              |
| `Tombstone` | §3.3                | `Tombstone`   | `formerType`, `deleted` (timestamp)                                      |
| `Like`      | §3.1                | `Like`        | `actor`, `object`; `target`/`origin` "typically have no defined meaning" |

### 2.4 OrderedCollection / paging

Core spec, collection properties: `totalItems`, `orderedItems` (on an `OrderedCollection` or
`OrderedCollectionPage`). Paging properties: `first`, `last`, `next`, `prev`, `current`,
`partOf`, `startIndex`. `partOf` "identifies the Collection to which the items contained by the
CollectionPage belong"; `first`/`next`/`prev`/`last`/`current` reference other
`OrderedCollectionPage` instances (by URI or embedded object).

Minimal shape for an outbox root:

```json
{
  "@context": "https://www.w3.org/ns/activitystreams",
  "id": "https://a.example/users/alice/outbox",
  "type": "OrderedCollection",
  "totalItems": 42,
  "first": "https://a.example/users/alice/outbox?page=true"
}
```

...and a page:

```json
{
  "@context": "https://www.w3.org/ns/activitystreams",
  "id": "https://a.example/users/alice/outbox?page=true",
  "type": "OrderedCollectionPage",
  "partOf": "https://a.example/users/alice/outbox",
  "next": "https://a.example/users/alice/outbox?page=true&min_id=...",
  "orderedItems": ["...activity objects or their ids..."]
}
```

`inferred:` exact query-param cursor scheme (`page=true&min_id=...`) is Mastodon's convention,
not spec-mandated — spec only fixes the `first`/`next`/`partOf` _shape_, not the URL scheme.
Patches should pick its own opaque cursor param (matching the no-offset-pagination rule, spec
§153) and is free to design it; do not copy Mastodon's `min_id`/`max_id` params unless doing so
for F2 interop specifically.

## 3. WebFinger (RFC 7033)

Source: <https://datatracker.ietf.org/doc/html/rfc7033> (accessed 2026-08-18).

- Request (§4.2): `GET /.well-known/webfinger?resource=<uri>` — for account discovery the
  resource is `acct:user@domain` (the `acct:` URI scheme; RFC 7033 itself is resource-URI
  agnostic and doesn't define `acct:`, but this is the universal Fediverse convention — see
  Mastodon §6.3 below for the exact form). Optional `rel` query params (repeatable) filter which
  `links` entries are returned (§4.3).
- Response media type: **`application/jrd+json`** (§10.2).
- JRD response shape (§4.4): top-level `subject` (string, echoes the resource), optional
  `aliases` (array of strings), optional `properties` (string→string|null map), optional `links`
  (array of link objects, each with `rel`, optional `type`, optional `href`, optional `titles`,
  optional `properties`, §4.4.4).
- RFC 7033 itself defines no ActivityPub-specific `rel` value — the `rel="self"`,
  `type="application/activity+json"` link pointing at the actor document is an
  ActivityPub-ecosystem convention layered on top of WebFinger, not part of RFC 7033. Confirmed
  by Mastodon's own docs (§6.3 below), which is the practical source of truth for this
  convention.

## 4. HTTP Signatures (S2S request authentication)

### 4.1 `draft-cavage-http-signatures-12`

Source: <https://datatracker.ietf.org/doc/html/draft-cavage-http-signatures-12> (accessed
2026-08-18). Note this expired Internet-Draft has **no formal IETF standing** — it lives on only
because Mastodon and most of the Fediverse implemented it before it was ever finalized, and
implementations never migrated in lockstep. Patches must implement it anyway for F1
self-interop (Patches-to-Patches) since that is what any second implementation Patches will ever
talk to in F2 expects.

`Signature` request header, comma-separated parameters:

```
Signature: keyId="https://a.example/users/alice#main-key",algorithm="rsa-sha256",headers="(request-target) host date digest",signature="Base64(...)"
```

- `keyId` (REQUIRED): opaque string identifying the actor/key; convention (Mastodon, §6.2) is
  `<actor-id>#main-key`, dereferenceable to fetch `publicKey.publicKeyPem` from the actor doc.
- `algorithm` (draft says RECOMMENDED, and says implementations SHOULD prefer deriving the
  algorithm from `keyId`-resolved key metadata rather than trust this field) — Patches/Mastodon
  both send and expect the literal string `"rsa-sha256"` in practice; `hs2019` is the draft's
  own "algorithm-agnostic" replacement value but is not what Mastodon sends. `inferred:` send
  `rsa-sha256` for F1 for maximum compatibility with the only ecosystem convention that exists.
- `headers` (OPTIONAL, space-separated, quoted, lowercase): which components are signed, in
  order. If omitted the draft's default is `date` alone for RSA/HMAC/ECDSA algorithms — **do
  not rely on the default**; always send it explicitly. Minimum for GET: `(request-target) host
date`. For POST (has a body): `(request-target) host date digest`.
- `signature` (REQUIRED): base64 (RFC 4648) signature over the constructed signing string.

Signing string construction: one line per entry in `headers`, in the order listed, joined by
`\n` with **no trailing newline**; each line is `lowercased-name: value`, except the pseudo-header
`(request-target)` which is `(request-target): <lowercased-method> <path>[?query]`. Example from
the draft (for `GET /foo`, `headers="(request-target) host date"`):

```
(request-target): get /foo
host: example.org
date: Tue, 07 Jun 2014 20:51:35 GMT
```

Verifier side: recompute the exact same string from the request's actual method/path/host/date/
digest, verify the `signature` against it using the public key resolved from `keyId`.

### 4.2 `Digest` header (RFC 3230 + RFC 5843)

Sources: <https://www.rfc-editor.org/rfc/rfc3230.html>,
<https://datatracker.ietf.org/doc/html/rfc5843> (accessed 2026-08-18). RFC 3230 defines the
`Digest` header carrying one or more `algorithm=base64digest` instance-digest pairs over the
message body; RFC 5843 registers additional algorithm tokens including `SHA-256`. Header form:

```
Digest: SHA-256=<base64(sha256(raw request body bytes))>
```

`inferred:` the algorithm token's case (`SHA-256` vs Mastodon doc examples showing lowercase
`sha-256=`) is not consistently normalized across implementations — RFC 5843 registers the
token as `SHA-256`; be case-insensitive when parsing an incoming `Digest` header's algorithm
name, and send the canonical `SHA-256=` form. The digest must be computed over the exact bytes
of the request body as sent (before any re-serialization), or the `(request-target)`/`digest`
signature check will fail on the receiving side even with a byte-identical logical JSON payload
— sign and digest the literal bytes you transmit, not a re-parsed/re-stringified copy.

### 4.3 RFC 9421 (HTTP Message Signatures) — not needed for F1, structure for later

Source: <https://datatracker.ietf.org/doc/html/rfc9421> (accessed 2026-08-18). Published
February 2024, IETF Standards Track, obsoletes/replaces the never-finished cavage drafts.
Structural differences worth knowing so F1 code doesn't have to be rewritten, only extended:

- Two headers instead of one: `Signature-Input` (which components are covered + parameters) and
  `Signature` (the value), both serialized as HTTP Structured Fields (RFC 8941), rather than one
  `Signature` header with quoted comma-separated params.
- Explicit "component identifiers": HTTP field names, plus derived components prefixed `@` —
  `@method`, `@target-uri`, `@authority`, `@status`, replacing the ad hoc `(request-target)`
  pseudo-header.
- Mastodon's own docs (§4.4 below) note Mastodon 4.5.0 shipped RFC 9421 support and removed the
  feature flag, i.e. it's a live migration in the ecosystem, not yet universal.

`inferred:` F1 only needs cavage-12 (spec §108: "no Mastodon compatibility goal yet... prove
Patches-to-Patches"). Structure the signing/verification code so the signing-string builder and
the "verify against a resolved public key" step are separate from the "which header scheme is
this request using" dispatch, so RFC 9421 support can be added as a second scheme at F2 without
touching the crypto core. Flagged for `architect`: whether F2 should support both schemes
simultaneously (Mastodon does) or migrate outright is a real design decision, not a research
question — write an ADR when F2 is scoped.

## 5. Mastodon docs (interop convention reference, not required for F1)

Sources: <https://docs.joinmastodon.org/spec/activitypub/>,
<https://docs.joinmastodon.org/spec/webfinger/>, <https://docs.joinmastodon.org/spec/security/>
(all accessed 2026-08-18). These are cited only because §1–§4 above show several places where
the W3C/IETF documents leave a gap (signature mechanism, `publicKey` shape, WebFinger `rel=self`
convention, paging cursor scheme) that Mastodon's docs fill in as the ecosystem's practical
default. Not authoritative in the W3C/IETF sense; flagged wherever used above as `inferred:`.

### 5.1 Actor extensions Mastodon relies on beyond the AP spec

`publicKey` (§1.1 above), plus Mastodon-specific actor fields not needed for F1:
`featured`, `featuredTags`, `discoverable`, `indexable`, `manuallyApprovesFollowers`,
`attachment` (profile metadata via `PropertyValue`). None of these are required for Patches F1;
listed so they aren't mistaken for spec requirements later.

### 5.2 WebFinger example

```json
{
  "subject": "acct:alice@a.example",
  "links": [
    {
      "rel": "self",
      "type": "application/activity+json",
      "href": "https://a.example/users/alice"
    }
  ]
}
```

Mastodon's verification step on receipt: resolve the `self`/`application/activity+json` link to
the actor document and confirm the actor's `preferredUsername` + domain match the requested
`acct:` resource — this defends against a WebFinger response pointing at an actor URI that
doesn't actually correspond to the queried handle. `inferred:` Patches should do the same
cross-check on both WebFinger lookups and on any inbound actor document it caches.

### 5.3 HTTP Signatures in production (§4 corroboration)

Confirms draft-cavage-12 is what Mastodon signs/verifies with today, `headers` set typically to
`(request-target) host date` for GET and `(request-target) host date digest` for POST,
`keyId` = `<actor-id>#main-key`, `algorithm="rsa-sha256"`. Key resolution: "fetch the `keyId`
and resolve to an actor's `publicKey`," with a bidirectional check that the fetched key's
`owner` points back at the actor that supposedly signed the request.

### 5.4 Delivery, caching, retry — not fully documented publicly

Mastodon's public docs do not spell out exact retry/backoff intervals or actor-key cache TTLs;
`inferred:` treat this as unspecified rather than guess a number — Patches F1's own retry policy
is an implementation decision for `architect`/`implementer`, not something to copy from
Mastodon without a source. Shared-inbox usage (deliver once to `endpoints.sharedInbox` for
activities addressed to `https://www.w3.org/ns/activitystreams#Public` or otherwise shared by
multiple local recipients) is confirmed as a real optimization Mastodon performs, matching the
AP spec's own `sharedInbox` field (§1.1, §1.4).

## 6. What Patches F1 will implement vs. defer

Cross-referencing `INITIAL_VISION.md` §105–110 (Stage F0 already schemas-only, done ahead of
this note; F1 is next):

**F1 (this note's scope) implements:**

- WebFinger (`GET /.well-known/webfinger?resource=acct:user@domain`, JRD response,
  `application/jrd+json`, §3 above)
- Actor document (`Person`, `inbox`, `outbox`, `following`, `followers`, `preferredUsername`,
  `publicKey`, `endpoints.sharedInbox`, §1.1–§2.3 above)
- Inbox (POST, accepts `application/activity+json` and the full `ld+json` profile) and outbox
  (GET, `OrderedCollection` + paged `OrderedCollectionPage`, §1.3–§1.4, §2.4)
- `Follow` / `Accept` / `Undo` handshake, `Create`+`Note`, `Delete`(+`Tombstone`), `Like`
  (§1.5, §2.3)
- HTTP Signatures, `draft-cavage-http-signatures-12`, `rsa-sha256`, `Digest: SHA-256=...` (§4.1,
  §4.2) — required both directions since this is Patches-to-Patches only, no interop fallback
  exists yet
- Basic SSRF/ingestion hardening per spec §109 (private/reserved IP rejection, redirect limits,
  response size caps, timeouts, content-type validation, JSON depth/size caps) — general HTTP
  client hardening, not protocol-specific; not covered by this note, needs its own research note
  if not already covered by an existing HTTP client library note.

**Explicitly deferred to F2 (interoperability, spec §108):** testing against Mastodon or any
non-Patches implementation, remote actor caching policy, retry/backoff/dedup policy, domain
blocklist/moderation, and adding RFC 9421 as a second signature scheme (§4.3).

**Deferred to F3 (public federation, spec §108):** anything gated on abuse controls, monitoring,
and domain controls being production-ready — not a protocol question, out of scope for this
note.

## Sources

- [ActivityPub (W3C Recommendation)](https://www.w3.org/TR/activitypub/) — §1
- [Activity Streams 2.0 Core](https://www.w3.org/TR/activitystreams-core/) — §2.1, §2.2, §2.4
- [Activity Streams 2.0 Vocabulary](https://www.w3.org/TR/activitystreams-vocabulary/) — §2.3
- [RFC 7033 — WebFinger](https://datatracker.ietf.org/doc/html/rfc7033) — §3
- [draft-cavage-http-signatures-12](https://datatracker.ietf.org/doc/html/draft-cavage-http-signatures-12) — §4.1
- [RFC 3230 — Instance Digests in HTTP](https://www.rfc-editor.org/rfc/rfc3230.html) — §4.2
- [RFC 5843 — Additional Hash Algorithms for HTTP Instance Digests](https://datatracker.ietf.org/doc/html/rfc5843) — §4.2
- [RFC 9421 — HTTP Message Signatures](https://datatracker.ietf.org/doc/html/rfc9421) — §4.3
- [Mastodon: ActivityPub](https://docs.joinmastodon.org/spec/activitypub/) — §5.1
- [Mastodon: WebFinger](https://docs.joinmastodon.org/spec/webfinger/) — §5.2, §3
- [Mastodon: Security](https://docs.joinmastodon.org/spec/security/) — §4.1, §5.3
- `INITIAL_VISION.md` §105–110 (federation seam, target, stages, security, persistence) — §6
