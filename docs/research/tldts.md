# tldts — public-suffix-aware domain parsing

Pinned `^7.4.10` (`pnpm-workspace.yaml` catalog; installed `7.4.10`, verified from
`apps/server/node_modules/tldts/package.json`). Verified 2026-08-19 by reading the package's
own `README.md` (npm `tldts@7.4.10` / `github.com/remusao/tldts`, MIT), which is the package's
only documentation surface — there is no separate docs site.

Used in `apps/server/src/modules/filters/filter-matching.ts` (`registrableDomainOf`,
`isRegistrableDomainValue`) to back the `DOMAIN`-kind filter/filter-list term matching in spec
§198.2/§199.4 — a wrong PSL reading silently makes a safety filter not match, so the behaviours
below are load-bearing, not incidental.

## `getDomain(url | hostname, options?)`

Returns the registrable domain (eTLD+1) — the shortest suffix of the hostname that is one label
longer than the recognized public suffix. Examples from the README:
`getDomain('foo.google.co.uk')` → `'google.co.uk'` (multi-label public suffix `co.uk` correctly
consumed as one unit, not under-split); `getDomain('t.co')` → `'t.co'`.

**Returns `null`**, not the bare hostname, for:

- a hostname that is itself entirely a public suffix (`getDomain('co.uk')` → `null` — this is
  the load-bearing case for `isRegistrableDomainValue`'s "`co.uk` must not be a usable rule"
  requirement, since a bare suffix rule would match every `*.co.uk` site)
- an unrecognized/local host not on the PSL (`getDomain('localhost')` → `null`; opt back in per
  host via `{ validHosts: ['localhost'] }`, not used here)
- an IP address (`getDomain('192.168.0.0')` → `null`)

This repo's code relies on exactly this: `registrableDomainOf` falls back to the bare
(www-stripped) hostname only when `getDomain` returns `null`, and `isRegistrableDomainValue`
uses the `null` return directly to reject bare-public-suffix rule values.

## ICANN vs Private suffix sections

`allowPrivateDomains` **defaults to `false`** — only the ICANN section of the Public Suffix List
is used unless explicitly opted in. This repo does not pass `allowPrivateDomains`, so private
suffixes (e.g. `s3.amazonaws.com`, which PSL lists as a private-section suffix) are treated as
ordinary domain labels: `getDomain('spark-public.s3.amazonaws.com')` → `'amazonaws.com'` under
the default (ICANN-only), not `'spark-public.s3.amazonaws.com'` as it would be with
`allowPrivateDomains: true`. Filter/filter-list domain rules in this codebase therefore key off
the ICANN-suffix reading, which is the conservative choice for a safety-matching feature.

## PSL update cadence

`tldts` bundles a snapshot of the Mozilla Public Suffix List directly in the package (no runtime
fetch, no user-facing update mechanism); the README states the maintainers keep the bundled list
current and that keeping the npm dependency itself updated is how consumers get PSL updates.
There is no cache-invalidation concern to design around — a `pnpm update tldts` is the only way
the PSL data changes for this repo.

Source: `https://github.com/remusao/tldts` (README, `tldts@7.4.10`), read from the installed
package on 2026-08-19.
