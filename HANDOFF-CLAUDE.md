# Handoff — opencode session 2026-08-26 (late) → Claude

## Repo state right now

- `/patches` on **`main` @ `98216b3`** — clean tree, synced with origin. #99 (wave 3)
  was just squash-merged into it.
- Local branches `feat/web-dx-wave-2`, `feat/web-dx-wave-3` exist locally and on
  origin; safe to delete after reading the notes below (their content is in main).

## The open PR stack (what you need to finish)

Four stacked wave PRs from Claude's swarm. Merge order matters — each builds on the last:

| PR      | Branch                 | State when I stopped                                                               |
| ------- | ---------------------- | ---------------------------------------------------------------------------------- |
| ~~#98~~ | ~~feat/web-dx-wave-2~~ | ✅ MERGED (all green). Squash = `98216b3`'s parent chain on main                   |
| #99     | feat/web-dx-wave-3     | ✅ MERGED (I fixed 9 conflicts + 4 broken tests first — see "Already fixed" below) |
| #100    | feat/web-e2ee-wave-4   | ❌ OPEN, failing: actionlint (preview.yml quoting), web build, format:check        |
| #101    | feat/stranded-wave-5   | ❌ OPEN, failing: actionlint (same preview.yml), domain build, format:check        |

**#98 and #99 are already in main. Do NOT re-merge them.**

## How to finish #100 and #101 (exact steps)

### Step 1 — merge main into wave-4

```
git checkout feat/web-e2ee-wave-4
git pull origin feat/web-e2ee-wave-4
git fetch origin main
git merge origin/main
```

Expect ~13 conflicts. Known ones from my aborted attempt:

- `apps/web/src/routes/MessagesRoute.tsx` + `.test.tsx` — wave-4's E2EE messaging seam
  vs main's B-179 wire changes (`home_server`). Keep BOTH: wave-4's session logic AND
  main's `homeServer` field on actors.
- `pnpm-lock.yaml` + `pnpm-workspace.yaml` — resolve by taking wave-4's side, then run
  `flock /tmp/patches-pnpm.lock pnpm install --lockfile-only` to reconcile, OR take
  theirs + reinstall. NEVER hand-edit the lockfile.

### Step 2 — fix wave-4's own failures (these existed pre-merge too):

1. **actionlint**: `.github/workflows/preview.yml:456` — shellcheck SC1072/SC1073/SC1078,
   an unterminated string in a `run:` block around line 456 (the PR-comment node script).
   Wave-2's HEAD commit `b1dea3b` ("fix(ci,tui): unbreak preview.yml shell quoting")
   has the correct version of this block — port it or copy that hunk verbatim.
2. **web build fail**: `apps/web` build exited 2. Get the real error with:
   `gh run view --job 98081441103 --log-failed | grep -B5 "exit code"` then reproduce
   locally: `pnpm --filter @patches/web... build`.
3. **format:check**: just run `pnpm format && git add -A`.

### Step 3 — same for #101 (feat/stranded-wave-5), which contains wave-4:

- actionlint: same preview.yml fix (already fixed if you merged wave-4's branch after
  fixing it there — verify with `pnpm exec actionlint .github/workflows/*.yml`).
- **packages/domain build failure**: get details via
  `gh run view --job 98082420167 --log-failed`. Reproduce: `pnpm --filter @patches/domain build`.
- format:check → `pnpm format`.

### Step 4 — verification before each push (pre-push hook runs full verify anyway;

use --no-verify ONLY if you've already proven each stage green yourself):

```
pnpm typecheck && pnpm format:check && pnpm lint && pnpm test
pnpm exec actionlint .github/workflows/*.yml
# integration needs DB: mise run compose -- up -d, then TEST_DATABASE_URL=... pnpm test:integration
```

### Step 5 — merge order: #100 then #101. Both squash:

```
gh pr merge 100 --squash --subject "feat(web): browser E2EE messaging seam — vault, enrollment, transports, runtime session (#100)"
gh pr merge 101 --squash --subject "feat: wave 5 — P13-008 group membership chain, ADR 0033, README overhaul, filter-scope cleanup (#101)"
```

## Already fixed this session (don't redo)

In #99's merge commit (now in main):

- proto-loading.test.ts: top-level enums load as EnumDescriptorProto reflection objects —
  assert through `descriptor.type.value`, not `pkg.EnumName` (that API doesn't exist).
- control.test.ts truncated-envelope: accepts `/truncated|not valid UTF-8/` — a 1-byte
  cut can land inside string content.
- auth.mapper.test/post.mapper.test fixtures: carry `nameplate: null` etc.
- actor.dto.ts `toNameplateSummary` accepts `undefined`; UpdateProfileInput allows
  `undefined` enum strings under exactOptionalPropertyTypes.
- tui b022: glyph renders INSIDE avatar-frame brackets now (B-129) — expect `★ Alice`.
- tui notification grouping fixture: pass wire `{seconds, nanos}` timestamps — grouping
  requires both createdAt present within GROUP_WINDOW_MS.

## Known live bug (partner report, unfixed)

**"Saving radial vs fan still does nothing"** (B-148 regression report). The wave-1 fix
(#97) made ThumbNavFab consume the preference and tests pass — but partner says saving
still does nothing. Suspects: (a) she tested on prod which hadn't redeployed (web deploys
on main pushes — check `gh run list --workflow Web`), (b) her installed PWA runs an old
SW bundle (vite-plugin-pwa from #97 changed SW entirely — may need uninstall/reinstall),
(c) the settings screen writes a different key than ThumbNavFab reads. Needs real
investigation on a deployed build, not guesses.

## Infra notes for this repo (learned the hard way)

- Pre-push lefthook runs FULL `pnpm verify` (~4min warm). Use `--no-verify` only after
  proving stages green yourself; never skip a red verify.
- `pnpm deploy --prod` prunes workspace devDeps — always build web/wrangler-dependent
  steps BEFORE any deploy staging step in CI jobs.
- Wrangler non-interactive delete needs `-f` (no --yes flag exists).
- Preview apps need explicit shared IPv4 allocation or *.fly.dev DNS doesn't exist.
- tasks.md is the canonical board (owner directive). GitHub issues only for the old
  doctor-backlog record (#87–#93).

## Cleanup AFTER all four PRs merge

- Delete local+remote: feat/web-dx-wave-2, feat/web-dx-wave-3, feat/web-e2ee-wave-4,
  feat/stranded-wave-5 (content preserved via squash merges).
- ~30 agent worktrees under patches-agent-wt/ and wt-* — run
  `.claude/scripts/worktree-collect.sh clean` (only removes fully-merged trees; keeps
  unmerged/dirty ones). Several have WIP commits on their branches (session-wave trio,
  filterenum) — those branches stay until owner decides.
- Stale stashes exist (stash@{0} on feat/tui-ux-and-web-client, stash@{1} on
  feat/phase-0-foundation) — not mine, left alone.
