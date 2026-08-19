# Cutting a TUI release

_Status: verified 2026-08-19 — the pack step below was run locally; `gh release create` was
**not** run (that step is left to whoever actually cuts the release)._

The TUI (`@patches/tui`, published under the npm name `patches-social` — see
`apps/tui/README.md`'s "Self-contained build") isn't on the npm registry yet. Until it is,
releases are self-contained tarballs attached to GitHub Releases on
`github.com/alliecatowo/patches`, and the TUI's own in-app upgrade prompt/`patches upgrade`
command (`apps/tui/src/upgrade/`) reads that release list to offer upgrades.

## 1. Bump the version

Edit `apps/tui/package.json`'s `"version"` to the next tag, dropping the leading `v`
(e.g. `"0.1.0-alpha.4"`). This repo's TUI releases are semver prereleases
(`0.1.0-alpha.N`) until v0.1.0 itself ships — `apps/tui/src/upgrade/semver.ts` compares them
with full semver 2.0.0 prerelease precedence, so `0.1.0-alpha.3 < 0.1.0-alpha.4 < 0.1.0` sorts
exactly as expected.

## 2. Build, pack, and release

```bash
mise run tui:release
```

This runs `infra/scripts/tui-release.sh`, which:

1. `pnpm --filter @patches/tui build` (tsup bundle + proto copy — see
   `apps/tui/README.md`'s "Self-contained build" for why this has to be a bundle, not a plain
   `tsc` output, before it can be installed standalone).
2. `pnpm pack` inside `apps/tui`, writing `dist-release/patches-social-<version>.tgz`
   (`publishConfig.name` in `apps/tui/package.json` is what renames the packed
   `package.json`'s `"name"` from `@patches/tui` to `patches-social` — nothing else in the repo
   needs to change).
3. `gh release create v<version> dist-release/patches-social-<version>.tgz --prerelease
--title "patches-social <version>" --notes "..."` — requires an authenticated `gh` CLI.

To only build and pack — proving the tarball itself works without touching GitHub (what CI or
a dry run should do) — pass `--pack-only`:

```bash
mise run tui:release -- --pack-only
```

That's what produced this tarball when this doc was last verified:

```
tui-release: wrote dist-release/patches-social-0.1.0-alpha.3.tgz
```

## 3. Verify the released asset name matches what the upgrade checker expects

`checkForUpgrade` (`apps/tui/src/upgrade/check.ts`) only recognizes a release asset whose name
matches `^patches-social-.*\.tgz$` — exactly what `pnpm pack` + `publishConfig.name` produce.
If a release is ever cut some other way (hand-uploaded asset, different naming), the in-app
upgrade prompt and `patches upgrade` will silently not see it (by design — see "Network failure
... never blocks launch" in that module's doc comment). There's no dedicated verification
command for this beyond "the filename printed by step 2 matches the pattern above".

## 4. Confirm the upgrade path picks it up

Once the release is live:

```bash
patches upgrade   # forces a fresh (cache-bypassing) check; prints the result and installs if newer
```

or just launch `patches` normally — a cached "nothing newer" answer is kept for up to 6 hours
(`$XDG_CACHE_HOME/patches/upgrade-check.json`, or `~/.cache/patches/...`), so a very recent
release might not show up in the launch-time prompt for up to 6h on a machine that already
checked. `patches upgrade` always bypasses that cache.

## Notes

- `--no-upgrade-check` / `PATCHES_NO_UPGRADE_CHECK=1` / `CI=true` all skip the launch-time
  check entirely (`isUpgradeCheckEnabled` in `apps/tui/src/upgrade/check.ts`) — the check never
  runs, let alone blocks, in CI or a non-interactive context.
- `apps/tui/src/upgrade/install.ts` detects how the running binary was installed
  (`npm install -g`, `pnpm add -g`, or a repo checkout) from `process.argv[1]`'s path and picks
  the matching upgrade command; a repo checkout is never touched automatically — it's told to
  `git pull && pnpm build` instead.
