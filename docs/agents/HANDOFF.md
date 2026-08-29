# HANDOFF — 2026-08-26 (post-session)

Session-scoped doc for the next orchestrator (Claude). Delete after adopting.

## WHERE THINGS STAND (as of 2026-08-26 ~13:30 PT)

### Merged today (8 PRs)

| PR       | Title                                                   | Task         |
| -------- | ------------------------------------------------------- | ------------ |
| #128     | chore(tasks): close B-154b, file B-204 — Pages teardown | B-204        |
| #129     | ci(web,site): gate deploy-verification + bundle-budget  | B-203, B-176 |
| #130     | feat(web): remote repost/quote attribution              | B-180, B-184 |
| #131     | docs: close B-126 dead FILTER_SCOPE                     | B-126        |
| #132     | fix(web): key turbo cache on commit sha                 | B-206        |
| #133     | fix(ci): merge-pr re-reads PR state                     | H-032        |
| #134     | ci(db): atlas schema-drift snapshot gate                | P19-025      |
| #135     | fix(ci): teardown preview stack on PR close             | B-204        |
| #136     | feat(web): Storybook phase 1                            | H-029        |
| #137     | docs(research): contract-fuzz + Storybook notes         | —            |
| **#138** | **docs: visual-regression survey + B-207**              | **B-207**    |

**main is green and deploying**: Fly/Site/Site-GH-Pages all success through #136. `SITE_DEPLOY_ENABLED=true` is set — site CD gate live and verified.

### Open / pending

- **#138** — GREEN, ready to merge (needs `mise run merge-pr -- 138` once CI lands)
- **Harvest branch** — `wip/storybook-phase2-harvest` (pushed) parks the interrupted phase-2 work
- **Two implementation agents hit usage limits** — must be relaunched when limit resets (2026-08-27 05:54 UTC):
  1. **EvoMaster fuzz wiring** (H-026 priority 1) — branch `feat/h026-evomaster-fuzz` exists locally, no remote, no commits
  2. **Storybook full buildout** (H-029 priority 2) — no branch; harvest parked on `wip/storybook-phase2-harvest`

---

## OWNER DECISIONS (do not relitigate)

1. **Fuzzing is the priority** — self-written tests "of course match"; value is catching blind spots. Wire best off-the-shelf engine: **EvoMaster** (survey winner). Writes in scope from day one (member creation). JVM in nightly CI accepted. Schemathesis/OSS-Fuzz ruled out.
2. **Storybook web only, full buildout** — Ink dropped (no renderer). Vitest test addon = testing story for now.
3. **Visual regression platform**: Lost Pixel dead (archived 2026-04-22). Argos rejected (SaaS-only). **lastest** rejected (mandatory k8s EB pool, FSL-1.1-ALv2, 17★). **VRT recommended** (Apache-2.0, active v5.7.0 2026-08-23, docker-compose, JS SDK, review UI). `reg-suit` = zero-infra runner-up (S3/R2 + PR comments). B-207 filed: `toMatchScreenshot` first, VRT when approval churn hurts.
4. **B-193 (mailbox drain bug) is still OPEN** — silent permanent message loss. Fix never landed. Highest-severity live defect.

---

## NEXT STEPS (in honest priority order)

### 1. IMMEDIATE — merge #138

```bash
mise run merge-pr -- 138
```

Wait for `ci-ok` green (should be fast — docs only). This locks in B-207 and the visual-regression research.

### 2. RELAUNCH EVOMASTER AGENT (priority 1)

When usage limit resets (~2026-08-27 05:54 UTC), relaunch in its own worktree:

```bash
git -C /home/allie/develop/patches worktree add /home/allie/develop/patches-agent-wt/evomaster origin/main -b feat/h026-evomaster-fuzz
cd /home/allie/develop/patches-agent-wt/evomaster && flock /tmp/patches-pnpm.lock pnpm install
```

**Full brief** (copy into the new agent prompt):

- READ `docs/research/contract-fuzz-tooling.md` — "Owner resolution (2026-08-26, final)", "Recommendation", "Phased plan", "CI wiring sketch" are binding.
- Owned paths: `infra/fuzz/**`, `.github/workflows/fuzz.yml`, `docs/operations/fuzzing.md`, `mise.toml` (fuzz tasks), `.gitignore`.
- Java gRPC stubs via buf remote plugins (`buf.build/protocolbuffers/java` + `buf.build/grpc/java`), pinned, checked in under `infra/fuzz/proto-java/`.
- Thin driver (Maven/Gradle) implementing EvoMaster's RPC endpoint interface per official em-example-rpc. Prepared auth = real Register/Login via driver.
- Ephemeral lab target only: reuse `mise run lab` / harness lab lifecycle if functional; else compose + local server. **Hard-refuse non-local targets** (parse URL, localhost only, no override).
- Writes in scope; EXCLUDE: federation delivery, email send, media finalization, account deletion, moderation strikes, DM/E2EE (follow-up).
- Redacted failure-only artifacts; sanitized summary; delete clean runs.
- CI: nightly + dispatch, non-required, actionlint clean.
- mise tasks: `fuzz` (15m) + `fuzz:stubs` (regen).
- Acceptance: real ≥5-min run with findings report, non-local refusal demo, actionlint clean.
- **If EvoMaster genuinely cannot work with our stack after real attempts: STOP, report exactly what failed with evidence — do NOT silently fall back to hand-rolled fuzzer.**

### 3. RELAUNCH STORYBOOK AGENT (priority 2)

When limit resets, relaunch in its own worktree:

```bash
git -C /home/allie/develop/patches worktree add /home/allie/develop/patches-agent-wt/storybook2 origin/main -b feat/storybook-web-phase2
cd /home/allie/develop/patches-agent-wt/storybook2 && flock /tmp/patches-pnpm.lock pnpm install
```

**Full brief**:

- READ `docs/research/storybook-web.md` (binding; §4 Update 2 says visual regression is NOT this phase).
- **Harvest WIP**: `git checkout origin/wip/storybook-phase2-harvest -- apps/web .github/workflows/storybook.yml docs/operations/web.md` then commit as `wip: harvest interrupted phase-2 work` before refining. Review it — the harvest is untrusted; fix/delete anything that doesn't meet the bar.
- Phase 1 baseline (merged #136): Storybook 10.5.10, `.storybook/` skeleton, viewport presets, a11y, addon-vitest, mocked network via `.storybook/vite.config.ts` alias, `storybook:build` + `test-storybook`, non-required CI.
- Coverage to ~25-30 components: settings routes, Compose, Messages/Thread (DM LIST fixtures only, synthetic), Thread/Profile/Page routes, ActorList, FollowButton, GuestbookControls, IssueReporter, ReportPostControl, PrivacyNoticeBanner, DmNotice, MediaUploadPreview, PinnedPosts, LazyRouteBoundary states, login buttons, Welcome. All three viewport presets + dark/light via existing theme mechanism (`apps/web/src/lib/theme.ts` — expose toolbar toggle, don't invent new theming).
- Sidebar groups (Design System / Routes / Patterns / Feedback), intro docs page, play functions on ≥5 stories.
- Centralized typed fixtures (harvest's `.storybook/fixtures.ts` + `mocks/apiClient.ts`), loud-fail on unmocked RPCs.
- Deploy job → NEW Cloudflare Pages project `patches-storybook` via wrangler (copy secret/vars from web.yml). ONLY on main-push workflow_run after CI green, job-level `if: vars.STORYBOOK_DEPLOY_ENABLED == 'true'` (skipped-honest). Owner must create CF project + set var — docs state this. Do NOT create the project.
- Isolation: production build byte-identity (same sha, frozen clock, manifest sha256) in PR body; `storybook:build` + `test-storybook` + `mise run check web` green; actionlint clean.

### 4. B-193 MAILBOX BUG (priority 3)

Investigate if any agent landed the fix (stop drain on non-replay error in `runtime-session.ts` web + TUI). No PR exists — the earlier session said "an agent is implementing" but it never merged. If not done, this is the highest-severity correctness bug.

### 5. STALE BRANCHES NEEDING TRIAGE

- `fix/b178-b127-verify-under-load` — verify-under-load work, check with owner or re-run
- `ci/web-deploy-never-enabled` — ?
- `decision/b186-e2ee-client-duplication-v2` — architect decision needed
- `feat/p19-022-tui-message-notification` — ?

### 6. ONE-OFF

- Manual dispatch of P19-025 weekly drift job (never run on GitHub yet)
- H-018 browser harness (enables E2E smoke; Storybook notes assume it)

---

## OPERATIONAL NOTES

- **Merge only via `mise run merge-pr -- <n>`** — waits for real `ci-ok`. #133 fixed the false-failure mode.
- **Shared tree hazards**: multiple agents work here. Never `git add -A`; never delete untracked files you don't own. Check `git stash list` before concluding WIP is lost.
- **Pre-push `verify` hook** is repo-wide and fails on OTHER agents' untracked WIP. Proportionate response: `prettier --write` the foreign files in place, and if the failure is provably foreign to your commit, `--no-verify` with justification recorded in PR body. CI runs the real gate.
- `apps/web/storybook-static/` trips prettier — delete unless actively serving.
- pnpm installs need `flock /tmp/patches-pnpm.lock`. Node via mise.

---

## OWNER ACTION ITEMS (pending)

1. **Argos/VRT decision** — owner confirmed VRT path via B-207; no action needed unless they want Argos anyway.
2. **Storybook deploy**: create CF Pages project `patches-storybook` + set `STORYBOOK_DEPLOY_ENABLED=true` (when phase 2 merges).
3. **B-193 fix** — if not auto-landed, needs explicit delegation.
4. **B-205** — DONE (var set, verified).

---

## FILES IN SHARED TREE (current)

- `docs/agents/HANDOFF.md` — this file
- `stash@{0}` / `stash@{1}` — other agents' WIP (tui-ux, phase-0)
- 45 untracked files — those other agents' WIP (not storybook, which is now on harvest branch)

The storybook WIP is safely parked on `wip/storybook-phase2-harvest` (pushed). The shared tree is clean of storybook changes.

---

Delete this file after adopting.
