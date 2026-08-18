# 0005. Cloudflare R2 for media storage with direct client upload

**Status:** Accepted
**Date:** 2026-08-17

## Context

Patches supports image attachments from v0 (text, static photos, links). Image binaries
must not live in PostgreSQL, and the NestJS API process should not be a bottleneck or
attack surface for large binary uploads. Storage needs to be S3-compatible so tooling and a
future migration path stay portable, and needs a route to private/authorized access for
future follower-only posts without redesigning the storage layer.

## Decision

Use **Cloudflare R2** (S3-compatible API) as the object store, via `@aws-sdk/client-s3` and
`@aws-sdk/s3-request-presigner` against the R2 endpoint. Uploads go through a **direct
upload flow**: the TUI calls `BeginMediaUpload`, NestJS creates a media row and returns a
short-lived presigned PUT URL, the client PUTs the image directly to R2, then the client
calls `FinalizeMediaUpload` and NestJS queues worker processing (see ADR 0004). Presigned
URLs expire quickly, are scoped to a specific object key, and restrict expected content type
where practical — they never expose R2 secret credentials. The worker uses **sharp** to
inspect real file signatures/metadata (never trusting client-provided filename extension,
MIME type, or dimensions), validate size/format, normalize EXIF orientation, generate
display and thumbnail derivatives, strip sensitive metadata, and mark media `READY`. The
bucket is private by default; the API issues short-lived presigned GET URLs after
authorization. The TUI maintains a bounded local LRU media cache
(`$XDG_CACHE_HOME/patches/media`, falling back to `~/.cache/patches/media`).

## Consequences

- Large binary traffic never transits the NestJS process — uploads and downloads go
  directly between client and R2, keeping the API data plane focused on metadata/social
  logic.
- No egress fees on reads from R2 (a Cloudflare R2 characteristic), which matters for a
  media-bearing social app operating on a modest budget.
- A private-by-default bucket with presigned GET URLs means follower-only or otherwise
  restricted media is a policy change, not a storage redesign.
- The S3-compatible API means the AWS SDK tooling and mental model transfer directly, and a
  future move to actual S3 (or another S3-compatible provider) stays plausible without a
  rewrite.
- Media processing (sharp, derivative generation, EXIF stripping) is real work the worker
  must do reliably and defensively — untrusted binary input handling is a genuine security
  surface, not a formality.

## Alternatives considered

- **Storing image binaries in PostgreSQL.** Rejected: explicitly prohibited
  (`INITIAL_VISION.md` §153). Bloats the database, breaks backup/restore ergonomics, and
  provides no benefit over object storage for this access pattern.
- **Proxying uploads through the NestJS process.** Rejected: explicitly prohibited. Turns
  the API into a bandwidth and memory bottleneck and an unnecessary trust boundary for large
  binary payloads.
- **AWS S3 directly.** Not rejected outright as a future option (the architecture stays
  portable to it), but R2's egress pricing and S3 compatibility make it the better initial
  choice without locking into AWS more broadly (see also the project's general AWS/GCP
  avoidance, `INITIAL_VISION.md` §95).
