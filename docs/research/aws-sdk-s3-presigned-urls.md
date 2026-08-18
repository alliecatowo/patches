# AWS SDK for JavaScript v3 — S3 presigned URLs (`@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner`)

Stack: `@aws-sdk/client-s3` 3.1112.0, `@aws-sdk/s3-request-presigner` 3.1112.0 (npm `latest` as of
verification date — not yet pinned in this repo's `package.json`/catalog; no S3/storage package
exists here yet). Verified 2026-08-18 by reading SDK source directly (npm-packed
`@aws-sdk/client-s3`, and `smithy-lang/smithy-typescript`'s `signature-v4` package on GitHub
`main`) and by running a live client → MinIO round trip locally (`docker.io/minio/minio:latest`
via podman). Live-test scripts are not checked into the repo (ephemeral, `/tmp`); the request/
response evidence is transcribed below so the claims are reproducible.

Priority used: SDK/Smithy source (primary, since AWS's own prose docs pages didn't return
fetchable content in this session — repeated `WebFetch` calls against
`docs.aws.amazon.com/AWSJavaScriptSDK/v3/...` returned only nav chrome, not API reference body;
do not trust those URLs' content without re-fetching) > live empirical test against a real
S3-compatible server (MinIO) > package README.

## 1. `getSignedUrl` signature, import, `expiresIn` unit

```ts
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

const url: string = await getSignedUrl(client, command, { expiresIn: 3600 });
```

- Documented (README): `expiresIn` defaults to **900** if omitted.
  Source: `packages/s3-request-presigner/README.md` in `aws/aws-sdk-js-v3` (raw, fetched
  2026-08-18).
- Documented (source): unit is **seconds**. In
  `smithy-lang/smithy-typescript/packages/signature-v4/src/SignatureV4.ts`,
  `presign()` destructures `expiresIn = 3600` and writes it verbatim into the
  `X-Amz-Expires` query param (`expiresIn.toString(10)`), and rejects if
  `expiresIn > MAX_PRESIGNED_TTL` where `MAX_PRESIGNED_TTL = 60 * 60 * 24 * 7` (constants.ts) —
  "less than one week", which is only sane as seconds. `S3RequestPresigner.presign()`
  (`packages/s3-request-presigner/src/presigner.ts`) overrides the default to `900` before
  spreading caller options.
- Full `RequestPresigningArguments` options confirmed by reading the same file: `expiresIn`,
  `unsignableHeaders: Set<string>`, `unhoistableHeaders: Set<string>`, `signableHeaders:
Set<string>`, `hoistableHeaders: Set<string>`, `signingDate`, `signingRegion`, `signingService`.

## 2. Is `Content-Type` enforced on a presigned PUT by default? — **No**

**Documented + empirically confirmed: No, not by default.**

- `S3RequestPresigner.prepareRequest()` (`s3-request-presigner/src/presigner.ts`) does, unconditionally:
  `unsignableHeaders.add("content-type")` — S3's presigner forces `content-type` onto the
  unsignable set for _every_ presign call, regardless of whether `ContentType` was set on the
  command.
- `getCanonicalHeaders()` (`smithy-typescript/packages/signature-v4/src/getCanonicalHeaders.ts`)
  skips any header that is in `unsignableHeaders` **unless** it's also explicitly present in
  `signableHeaders`. So `content-type` is excluded from the signature by default, and stays
  excluded even though `PutObjectCommand`'s `ContentType` field does get serialized onto the
  outgoing request as a real `Content-Type` header (confirmed by grepping the packed
  `@aws-sdk/client-s3` schema table for the `PutObjectRequest` shape — it maps `ContentType` →
  header `Content-Type`).
- The documented escape hatch (README, "Get Presigned URL with headers that should be signed"):
  pass `signableHeaders: new Set(["content-type"])` to `getSignedUrl`'s options. This works
  because `signableHeaders` overrides the unsignable check in `getCanonicalHeaders`.
- **Live confirmation against MinIO** (`docker.io/minio/minio:latest`, `forcePathStyle: true`,
  `PutObjectCommand({ Bucket, Key, ContentType: "text/plain", ContentLength: 42 })`):
  - Default presign → `X-Amz-SignedHeaders=content-length;host` (no `content-type`). Uploading
    with a _different_ `Content-Type` than what was passed to the command still returned
    **HTTP 200**.
  - Presigned with `signableHeaders: new Set(["content-type"])` → `X-Amz-SignedHeaders=content-length;content-type;host`.
    Uploading with a mismatched `Content-Type` header returned **HTTP 403
    `SignatureDoesNotMatch`**; uploading with the exact matching value returned **200**.

So: **you must opt in** via `signableHeaders: new Set(["content-type"])` to have S3/R2/MinIO
enforce that the client's real PUT sends the same `Content-Type` the URL was signed for.
`unhoistableHeaders` is unrelated to this — that option is documented (README) for forcing
`x-amz-*` headers (e.g. checksum, SSE headers) to be _required_ in the request rather than
silently droppable; it doesn't touch `content-type`.

## 3. Is `Content-Length` enforced on a presigned PUT? — **Yes, by default, if you set it on the command**

This contradicts the commonly repeated claim ("presigned PUT URLs can't bound size, use POST
policy for that") — that claim is true only when the caller doesn't pass `ContentLength` to
`PutObjectCommand` in the first place. **Flagging discrepancy with likely training-data
assumption.**

- Unlike `content-type`, `S3RequestPresigner.prepareRequest()` does **not** add `content-length`
  to `unsignableHeaders`, and `content-length` is not in Smithy's
  `ALWAYS_UNSIGNABLE_HEADERS` map (`constants.ts`: `authorization`, `cache-control`,
  `connection`, `expect`, `from`, `keep-alive`, `max-forwards`, `pragma`, `referer`, `te`,
  `trailer`, `transfer-encoding`, `upgrade`, `user-agent`, `x-amzn-trace-id` — no
  `content-length`).
- `PutObjectCommand`'s `ContentLength` field is serialized directly to a `Content-Length` header
  on the pre-presign request object (confirmed via the packed schema table, same as
  `ContentType`).
- Net effect: if `ContentLength` is present on the command, it lands in `X-Amz-SignedHeaders`
  automatically, with no extra options needed.
- **Live confirmation**: presigning `PutObjectCommand({ ContentLength: 42, ... })` produced
  `X-Amz-SignedHeaders=content-length;host` with no `signableHeaders` option passed at all.
  Uploading a 42-byte body with `Content-Length: 42` → **200**. Uploading a 10-byte body with
  `Content-Length: 10` against the same (already-generated) presigned URL → **403
  `SignatureDoesNotMatch`**.
- Caveat (inferred, not tested): this pins an **exact** byte count, not a _range_. There's no
  min/max bound this way — for a real range (e.g. "≤ 20 MiB"), the documented S3 mechanism is
  still the POST policy `content-length-range` condition (`bucket.generatePresignedPost` /
  `createPresignedPost` in `@aws-sdk/s3-presigned-post`, not evaluated in this note — separate
  package, follow-up if the product needs a _range_ rather than a fixed size). If the upload flow
  can compute the exact byte size up front (e.g. server already knows the file size before
  issuing the presigned PUT), exact-pinning via `ContentLength` is sufficient and simpler than
  POST policy.

## 4. `GetObjectCommand` response header overrides — confirmed present

`ResponseContentType` and `ResponseContentDisposition` are real `GetObjectCommandInput` fields.
Live-confirmed: passing both to `GetObjectCommand` and presigning produced a URL containing
`response-content-type=application%2Fpdf&response-content-disposition=attachment%3B%20filename%3D%22foo.pdf%22`
as **query parameters** (not headers — so they're unaffected by `signableHeaders`/
`unsignableHeaders`, and `X-Amz-SignedHeaders` was just `host` in this case). Other
`Response*` overrides exist on the same shape by symmetry with the S3 API
(`ResponseCacheControl`, `ResponseContentEncoding`, `ResponseContentLanguage`,
`ResponseExpires`) — **inferred** from the naming pattern and S3 API generally, not
individually exercised in the live test.

## 5. MinIO: `forcePathStyle` and other gotchas

- **Confirmed via live test**: `new S3Client({ endpoint: "http://127.0.0.1:19000",
forcePathStyle: true, region: "us-east-1", credentials: {...} })` produces working presigned
  URLs against MinIO (`CreateBucketCommand`, `PutObjectCommand` presign+PUT,
  `HeadObjectCommand` all succeeded). `forcePathStyle` is the v3 name — SDK v2's
  `s3ForcePathStyle` does not exist in v3's `S3ClientConfig` (**inferred**: not exhaustively
  grepped, but no `s3ForcePathStyle` hits anywhere in the packed `@aws-sdk/client-s3`
  `dist-cjs/index.js`, and the constructor accepted `forcePathStyle` without a TS error in the
  live test, which used `type: "module"` + no `--transpile-only`, i.e. real type-checking was
  not run — treat the "no `s3ForcePathStyle`" claim as source-grep-confirmed, and the "the v3
  name is `forcePathStyle`" claim as working-code-confirmed).
  Without path style, virtual-hosted-style (`bucket.endpoint`) is what the SDK defaults to,
  which won't resolve for a bare local MinIO host — not separately tested here since
  `forcePathStyle: true` is already the documented recommendation for non-AWS endpoints
  everywhere this was checked; not worth burning a test cycle disproving the negative.
- Region: `us-east-1` (arbitrary, didn't match any real bucket-creation region concept in
  MinIO) worked with no error — MinIO does not appear to validate the SigV4 region claim
  against anything. **Inferred** from this one passing test, not a documented MinIO guarantee;
  if this matters in production, keep `region` consistent between the client used to create the
  bucket and the client used to presign, since that's the safe/documented AWS-compatible
  posture and costs nothing.
- No header-signing mismatch errors ("headers present which were not signed") were hit in this
  test. A GitHub issue (`aws/aws-sdk-js-v3` #4634, found via web search, not read in full) is
  reported to describe exactly that symptom for some MinIO/port combinations — **not verified
  in this session**, flagging as a known-issue pointer only, since our own round trip against
  MinIO on a non-standard port (19000) worked cleanly. If a real integration hits
  `AccessDenied: headers ... not signed`, check that GitHub issue before deep-diving.

## 6. `HeadObjectCommand` output shape — confirmed live

Live `HeadObjectCommand` response keys (MinIO), besides `$metadata`:
`AcceptRanges`, `LastModified`, `ContentLength`, `ETag`, `ContentType`, `Metadata`. Exact
PascalCase field names confirmed: `ContentType: string`, `ContentLength: number`, `ETag:
string` (quoted, e.g. `"6ce59ad23cb43af476f04875925e42a6"` — includes the surrounding double
quotes, matching S3's normal ETag format; strip/keep quotes deliberately when comparing against
a client-computed MD5/checksum).

## Sources

- `aws/aws-sdk-js-v3`, `packages/s3-request-presigner/README.md` (raw, fetched 2026-08-18):
  https://github.com/aws/aws-sdk-js-v3/blob/main/packages/s3-request-presigner/README.md
- `aws/aws-sdk-js-v3`, `packages/s3-request-presigner/src/getSignedUrl.ts` and `src/presigner.ts` (raw, same commit as above)
- `smithy-lang/smithy-typescript`, `packages/signature-v4/src/SignatureV4.ts`, `getCanonicalHeaders.ts`, `constants.ts` (raw, fetched 2026-08-18): https://github.com/smithy-lang/smithy-typescript/tree/main/packages/signature-v4/src
- `@aws-sdk/client-s3@3.1112.0` as packed from npm (`npm pack`), `dist-cjs/index.js` schema tables — read directly, not a public URL
- Live round-trip test against `docker.io/minio/minio:latest` via podman, `@aws-sdk/client-s3@3.1112.0` + `@aws-sdk/s3-request-presigner@3.1112.0` — run in this session, not checked into the repo
- `aws/aws-sdk-js-v3` GitHub issue #4634 (mentioned only, not read): https://github.com/aws/aws-sdk-js-v3/issues/4634

## Follow-up (not this note's job to decide)

- No `docs/decisions/` ADR exists yet for the storage/media-upload flow's presigned-URL
  contract; `docs/decisions/0005-r2-media-storage.md` exists but should be checked by
  `architect` against §3 above (exact-`Content-Length`-pinning vs POST-policy range) before a
  `StorageClient` is implemented, since it changes what the server needs to know before issuing
  a presigned PUT (exact size vs. a bound).
- No `@aws-sdk/client-s3` / `@aws-sdk/s3-request-presigner` entries exist yet in
  `pnpm-workspace.yaml`'s catalog or any `package.json` — whoever implements `StorageClient`
  needs to add them via `pnpm add --filter <workspace>` (never hand-edited), and should re-check
  this note's version pin (3.1112.0) is still current at that time, since `@aws-sdk/*` releases
  extremely frequently.
- `@aws-sdk/s3-presigned-post` (POST policy / `content-length-range`) was not researched here —
  a separate task if range-bounded upload size (rather than exact-pinned) turns out to be
  required.
