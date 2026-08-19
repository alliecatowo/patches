# tar-stream — streaming tar pack/extract

Pinned `^3.2.0` (`pnpm-workspace.yaml` catalog; installed `3.2.0`, verified from
`node_modules/.pnpm/tar-stream@3.2.0/node_modules/tar-stream/package.json`). Verified 2026-08-19
by reading the package's own `README.md` (npm `tar-stream@3.2.0` /
`github.com/mafintosh/tar-stream`, MIT), its only documentation surface.

Used in `apps/worker/src/jobs/handlers/export-account.handler.ts` (`buildTarGz`, `pack as
tarPack`) to build the account-export `.tar.gz` — the §197.3/§204.2 data-portability
guarantee, so entry framing correctness here directly determines whether an export archive a
user downloads is actually valid.

## Pack API

`tar.pack()` returns a `Duplex`-ish pack stream; `pack.entry(header, [data], [callback])` adds
one entry — `data` may be a `Buffer`/string (written and closed synchronously) or omitted, in
which case `entry()` returns a writable stream you `.write()`/`.end()` yourself. The callback
fires once that entry is fully written, which is the signal to add the next entry or call
`pack.finalize()`. `apps/worker`'s `buildTarGz` uses the `Buffer` form and `await`s each
entry's callback in sequence before adding the next, which the README's own "pipe the pack
stream somewhere" example does not itself await — sequencing here is this repo's own
choice, not a library requirement, but it is safe: `pack.entry` is documented to accept being
called again once the previous entry's callback has fired.

## Header shape

`{ name, size (default 0), mode (default 0o644 file / 0o755 dir), mtime (default now), type
(default 'file'), linkname, uid/gid (default 0), uname, gname, devmajor/devminor }`. `size` is
declared up front in the header rather than inferred by tar-stream, so a `Buffer` entry's
`size` must match `buffer.length` exactly — `buildTarGz` passes `file.buffer.length` for this
reason; a mismatch would produce a corrupt/truncated tar member since consumers rely on `size`
to know where the entry's data ends.

## No entry-count or size limit

`tar-stream` itself enforces no per-entry or archive size limit and does no file-system I/O —
"it operates purely using streams" (README). USTAR long-name/pax-extended-header support is
implemented, so `name` is not silently truncated at USTAR's legacy 100-byte field width.

## Gzip is not tar-stream's job

The package explicitly does not gzip: "you still need to gunzip your data if you have a
`.tar.gz`" (README, re: extraction; the inverse holds for packing). `buildTarGz` composes this
itself: `pack.pipe(createGzip())`, then buffers the gzip output stream with
`stream/consumers`' `buffer()` before it is handed to `StorageClient.putObject` (which takes a
`Buffer`, not a stream — a deliberate buffering choice documented at the call site, not a
tar-stream constraint). Because `pack` only backpressures based on how fast its consumer (here,
`gzip`) drains it, and `gzippedPromise` (`streamToBuffer(gzip)`) is created and awaited only
after all `pack.entry()` calls resolve, there is no unbounded-memory risk beyond holding the
whole compressed archive in memory once — the same tradeoff every other worker-side buffered
object write in this repo already makes.

Source: `https://github.com/mafintosh/tar-stream` (README, `tar-stream@3.2.0`), read from the
installed package on 2026-08-19.
