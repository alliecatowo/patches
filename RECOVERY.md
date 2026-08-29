# Recovery — agent worktrees 2026-08-28

Codex previously converted worktrees into `agent/wt-*` branches. All 94 `agent/wt-*` branches have been reconciled:

- 64 merged branches (already in `main`) deleted locally
- 13 pure `chore: checkpoint worktree` branches with no substantive diff deleted
- 7 duplicate branches deduplicated (B-193 x5, harness x2)
- **10 substantive unmerged branches preserved and pushed to `origin`**

All worktrees are gone (`git worktree list` shows only `main`). No uncommitted worktrees remain.

## Preserved branches (pushed to origin, draft PRs to follow)

Each branch below is `main..branch` and is available as `origin/<branch>` for recovery:

| Branch | Commits | Subject | Key files |
|--------|---------|---------|-----------|
| `agent/wt-1787794656-2480868` | 1 | feat(e2ee): adapt TUI/web clients to ADR 0033's unified identity API (B-124) | `apps/tui/src/e2ee/chain.ts`, `apps/web/src/e2ee/chain.ts`, `node-transcripts.ts` deleted, `session-setup.ts` u32→u64 |
| `agent/wt-1787796976-2548548` | 3 | docs(e2ee): update proof handoff with Job 1 completion notes + 2 checkpoints | docs handoff, plus harness revert (see note) |
| `agent/wt-1787791866-2418098` | 2 | wip(e2ee): ADR 0035 reserve-conversation (in progress, pre-rebase) | wip |
| `agent/wt-1787793800-2463043` | 2 | docs(agents): record ADR 0033 server-adaptation commit sha in the handoff + feat(server,database)!: adapt to ADR 0033 crypto API + clean-break migration | server/database ADR 0033 |
| `agent/wt-1787795579-2508888` | 2 | feat(e2ee): turn E2EE into an always-on feature (ADR 0036 owner override) + docs prettier fixups | e2ee |
| `agent/wt-1787795356-2500638` | 1 | test(server): pin ADR 0035 zero-notification/invisible-reservation guarantee | test |
| `agent/wt-1787869136-3797081` | 1 | fix(e2ee): rotate the messaging root even when the account has no roster | e2ee |
| `agent/wt-1787870057-3821755` | 1 | test(server): reproduce vault-less rotateMessagingRoot against a real node | e2ee test |
| `agent/wt-1787785068-2289531` | 2 | docs(harness): make the GitHub Project the canonical task board + fix(e2ee): stop mailbox drain on any non-replay error (B-193) | harness + B-193 (representative of 6 duplicates) |
| `agent/wt-1787782220-2215137` | 1 | fix(e2ee): stop the mailbox drain on any non-replay error (B-193) | B-193 (deduplicated representative) |

## Why not merged into this PR

These branches are based on a `main` from ~2026-08-22..28 and many touch the same E2EE harness area that has since landed the heterogeneous harness (`1f45d1e`). Direct `git merge --no-ff` produces conflicts in `apps/web/src/e2ee/transports.ts` etc. Merging them blindly would revert the harness or require manual conflict resolution per branch. Instead:

- All 10 are **pushed and preserved as branches on `origin`** — no work is lost.
- This PR is the **index recovery PR** — it lands no code, just this inventory, so `main` stays green while reviewers decide which branches still apply.
- To recover a branch: `git checkout <branch> && git rebase main` (resolve conflicts against the new harness), then open a PR with `Fixes #<issue>` so Project Status moves. The heterogeneous harness `goal-driver` can delegate each rebase as a `deepseek` worker with packet `Task: <B-124 etc>`.

## Verification

```
git branch --list "agent/wt-*" | wc -l  # → 10 substantive + 0 worktrees
git worktree list                       # → only main
git branch -r --list "origin/agent/wt-*" | wc -l  # → 10
```

## Next

- Pick which of the 10 are still needed (B-124 and B-193 are likely still open per `tasks.md:622` and `tasks.md:632`).
- Rebase and land via `goal-driver` → `worker` → `reviewer` → `verifier` per `docs/agents/HETEROGENEOUS.md`.

