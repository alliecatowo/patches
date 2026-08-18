# Media pipeline

Source of truth: `INITIAL_VISION.md` §27–32, §54, §58, §76.

**Status: implemented** (P5-001, P5-002, B-001) — `packages/media` (storage adapter),
`apps/server/src/modules/media` (`MediaService`), `apps/worker/src/jobs/handlers/{process-media,clean-expired-uploads}.handler.ts`,
local dev via MinIO (ADR 0015). See §9 for what's verified and what's deferred.

## 1. States

`media.state` is one of:

```text
PENDING_UPLOAD
PROCESSING
READY
FAILED
DELETED
```

Transitions: `PENDING_UPLOAD` (row created, presigned PUT issued) → `PROCESSING`
(client confirmed upload, worker job queued) → `READY` (derivatives generated) or
`FAILED` (validation/processing error) → `DELETED` (soft delete / retention cleanup).

## 2. Direct upload flow

The full image never transits the NestJS process — the API only issues/consumes
short-lived R2 credentials via presigned URLs (§30, also a hard prohibition in §153:
"do not proxy normal image uploads through Node").

```text
TUI
 |
 | BeginMediaUpload
 v
NestJS
 |
 | create media row (state = PENDING_UPLOAD)
 | generate short-lived presigned PUT
 v
TUI
 |
 | PUT image directly
 v
Cloudflare R2
 |
 | upload complete
 v
TUI
 |
 | FinalizeMediaUpload
 v
NestJS
 |
 | queue PROCESS_MEDIA outbox job (state -> PROCESSING)
 v
worker
 |
 | sharp pipeline -> READY or FAILED
```

`BeginMediaUpload` (§54) returns: media ID, presigned PUT URL, expiration.

`FinalizeMediaUpload` (§54) is what actually enqueues processing — the client tells
the server the upload finished; the server does not poll R2 speculatively.

`GetMediaDownload` (§54) returns: authorized short-lived download URL, dimensions,
MIME type, thumbnail URL if useful.

## 3. Presigned URL rules (§30)

Presigned URLs (via `@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner` against
the R2 S3-compatible endpoint) must:

- expire quickly (short TTL — minutes, not hours: `MEDIA_PRESIGN_PUT_TTL_SECONDS`/
  `MEDIA_PRESIGN_GET_TTL_SECONDS`, default 300s/600s),
- restrict the target object key (one URL, one key — `media/<id>/original` or
  `media/<id>/v/<variant>`, see `packages/media/src/keys.ts`),
- restrict expected content type where practical,
- never expose R2 secret credentials to the client.

**Implementation note** (`docs/research/aws-sdk-s3-presigned-urls.md`): S3's presigner
excludes `Content-Type` from the signature by default — `S3StorageClient.presignPut` opts it
back in via `signableHeaders: new Set(['content-type'])`, and pins an exact `Content-Length`
(signed automatically once set on the command), so a mismatched content type or size is
rejected by R2/MinIO itself with `SignatureDoesNotMatch`, before the object is ever stored.

## 4. Media processing (worker, §31)

Using `sharp`. Procedure, in order:

1. fetch the uploaded object from R2,
2. inspect file signature and metadata — never trust the filename extension or
   client-supplied MIME type,
3. reject unsupported formats,
4. validate size/dimensions against limits,
5. normalize EXIF orientation,
6. decode safely,
7. create a display derivative,
8. create a thumbnail derivative,
9. omit sensitive metadata (strip EXIF/GPS etc. from derivatives),
10. calculate final dimensions/hash,
11. upload derivatives to R2,
12. mark media `READY`,
13. delete or quarantine the temporary original per retention policy.

Never trusted as input: filename extensions, client-provided MIME types,
client-provided dimensions (§31).

**Implementation status:** steps 1–12 are implemented in
`apps/worker/src/jobs/handlers/process-media.handler.ts` — format/dimension validation via
`sharp`'s decoded metadata (never the client's declared type), `.rotate()` for EXIF
auto-orient, metadata stripped by default (sharp never calls `.withMetadata()`), a `display`
(≤2048px) and `thumb` (≤400px) webp derivative, sha256 of the original (compared against the
client's `BeginMediaUploadRequest.sha256` when present — see §2's flow and
`MediaService.beginMediaUpload`'s doc comment for how that expected hash travels from Begin to
the job payload). **Step 13 (delete/quarantine the original) is deferred** — the original is
currently retained indefinitely alongside its derivatives; no retention policy exists yet.
Tracked as a follow-up (file a task before shipping real user uploads at volume, since storage
cost scales with retained originals).

## 5. Supported formats and limits (§28)

**Accepted (v0):**

- JPEG
- PNG
- WebP

**Rejected (v0):**

- SVG
- PDF
- TIFF
- executable formats
- video
- arbitrary binary files
- animated image formats (unless safely detected and intentionally supported later)

**Limits** (adjustable after real performance testing, but must exist):

```text
10 MB per uploaded image
20 megapixels maximum decoded dimensions
4 images per post
```

## 6. Media privacy (§32)

The R2 bucket is **private** by default. The API issues short-lived presigned GET
URLs after authorization, which keeps the door open for follower-only posts later
without redesigning object storage.

**Implementation note:** `MediaService.getMediaDownload` requires an authenticated caller
(`AuthGuard`) but does **not** restrict to the media's owner — it's what renders any visible
post's images, not just the caller's own uploads, and v0 posts are public by default. Real
per-post visibility enforcement (blocks, follower-only posts) is deferred to whenever
follower-only posts land (Phase 6+); see `media.service.ts`'s doc comment on
`getMediaDownload` for the full reasoning. `BeginMediaUpload`/`FinalizeMediaUpload` **are**
owner-restricted (they mutate the caller's own media).

## 7. TUI media cache

The TUI caches downloaded media locally rather than re-fetching on every render.

Cache directory (default; adjustable):

```text
$XDG_CACHE_HOME/patches/media
```

Fallback if `XDG_CACHE_HOME` is unset:

```text
~/.cache/patches/media
```

macOS may use a platform-conventional cache path instead, if implemented cleanly.

The cache is a **bounded LRU** — unlimited disk growth is not acceptable. Eviction
policy (size- or count-bounded) is an implementation detail left to the TUI's
`media/` module, but a bound must exist.

## 8. Rendering and fallback

Downloaded/cached media is rendered inline via the `TerminalMediaRenderer`
abstraction (Kitty Graphics Protocol where available). When inline rendering isn't
available, the TUI shows a placeholder card and supports opening the image
externally via the `o` key, using safe argument-array process spawning (never shell
string interpolation of a file path). See `docs/architecture/tui.md` §6–7 for the
renderer interface and fallback UI.

## 9. Local dev / object storage backend (B-001, ADR 0015)

**MinIO** backs local dev and integration tests; **Cloudflare R2** backs production. Both are
S3-compatible, so `packages/media`'s `S3StorageClient` is the only implementation, for both —
see ADR 0015 for the full reasoning (why MinIO over a shared R2 bucket or LocalStack).

Verified local flow (every command below was actually run against this repo):

```sh
mise run compose -- up -d          # Postgres + Mailpit + MinIO + minio-init (no profile flag)
```

`minio-init` is a one-shot `minio/mc` container: it creates the `patches-media` bucket and
sets it private (`mc anonymous set none`), then exits — `docker/podman compose ps` shows it
`Exited (0)` once done, which is expected, not a failure.

Server/worker pick up MinIO automatically from `.env.example`'s defaults
(`R2_ENDPOINT=http://127.0.0.1:9000`, `R2_ACCESS_KEY_ID=patches`,
`R2_SECRET_ACCESS_KEY=patchespatches`, `R2_BUCKET=patches-media`,
`R2_FORCE_PATH_STYLE=true`). No code branches on "is this MinIO or R2" — only which
environment variables point at which endpoint.

Integration tests that need real storage (`apps/server/test/media.integration.test.ts`,
`apps/worker/test/media-processing.integration.test.ts`) probe MinIO reachability at
`http://127.0.0.1:9000` in `beforeAll` and skip themselves (via `TestContext.skip()`, per test)
with a clear console warning if it isn't running — `mise run compose -- up -d` before
`TEST_DATABASE_URL=... pnpm test:integration` runs them for real. Verified: both files pass
(9 tests server-side, 3 worker-side) against a real `mise run compose -- up -d` stack.

**Deviations from a literal reading of this doc, both intentional, documented at their point
of implementation:**

- §4 step 13 (delete/quarantine the original) is not implemented — see §4's note.
- §6's "authorized" for `GetMediaDownload` means "authenticated", not "owner" — see §6's note.
