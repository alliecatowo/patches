---
name: protoc-gen-es-import-extension
description: protoc-gen-es v2 with opt=target=ts omits .js import extensions by default, breaking tsc under NodeNext module resolution
metadata:
  type: feedback
---

`@bufbuild/protoc-gen-es` v2's `target=ts` output mode generates relative imports between
`_pb.ts` files with **no file extension** by default (`import_extension=none`) — meant for a
bundler-resolved consumer. Under this repo's NodeNext `moduleResolution` (every other package
here), `tsc` rejects that with TS2835 ("Relative import paths need explicit file extensions").

**Why:** Discovered generating `packages/proto/src/generated-es/` for ADR 0016's Connect edge
(P10-004) — `pnpm --filter @patches/proto build`'s DTS step failed on the freshly generated
files immediately after `buf generate`.

**How to apply:** Add `import_extension=js` to the plugin's `opt:` list in `buf.gen.yaml`
alongside `target=ts`, matching every other `.js`-suffixed relative import in this repo's
source. Same principle as [[proto-stringEnums-runtime-mismatch]] and
[[proto-fieldmask-wire-shape]]: a codegen tool's defaults assume a generic consumer, and this
repo's actual toolchain (NodeNext resolution, dual ESM/CJS) usually needs an explicit opt to
match it.
