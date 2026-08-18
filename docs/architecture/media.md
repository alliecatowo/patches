# Media pipeline

Source of truth: `INITIAL_VISION.md` §27–32, §54, §58, §76.

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

- expire quickly (short TTL — minutes, not hours),
- restrict the target object key (one URL, one key),
- restrict expected content type where practical,
- never expose R2 secret credentials to the client.

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
