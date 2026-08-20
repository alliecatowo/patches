# Harness backlog — ranked, evidence-backed

Discovery pass, 2026-08-19. Ranked by **expected token saving per unit of effort**. Cost model lives in
`docs/agents/CONTEXT_ECONOMY.md`; this is the to-do list that follows from it.

## The measurement behind this list

Tool census over all 221 transcripts (97,127 JSONL lines), alongside the corrected usage numbers
(7.62B cache reads, 196k mean worker context, 1.13 tool calls/request):

```
Bash 14,400 · Edit 3,401 · Read 2,709 · Write 1,375 · WebFetch 352 · Agent 210 · LSP 4 · Grep 0 · Glob 0
Bash heads:   grep 4,981 · echo 3,888 · git 3,591 · mise 3,196 · cat 2,490 · sed 2,458 · heredoc 875
Read:         56% unbounded (1,520 whole-file). Hottest: apps/tui/src/app/App.tsx — 124 reads, 2,281 lines
Edit:         replace_all used 10 times out of 3,401
Write:        1,109 distinct paths, 266 repeat (whole-file rewrite); 5.0M chars ≈ 22% of all output tokens
grep args:    4,241 regex · 1,054 plain string · 663 symbol-like
Tool results: 22,615 results, 34.5M chars, only 99 over 20k chars
Permission stalls: 18, ever
```

Three of these overturn assumptions the harness is built on — see "Corrections" at the bottom.

## Ranked backlog

### 1. The ambient bypass-permissions instruction is silently overriding the harness — config

**Friction.** Bypass-permissions mode injects a system instruction telling every agent to "read files
with cat, head, or sed -n, search with grep and find, and make file changes with sed, heredocs, or short
scripts, rather than using the dedicated Read, Edit, or Write tools." The census is the proof: **`Grep`
0 calls, `Glob` 0 calls**, against 4,981 shell `grep`s, 2,490 `cat`s, 2,458 `sed`s, 875 heredocs. Shell
`grep -r`/`cat` dump unbounded raw output into a context re-read on every later request; the `Grep`/
`Read` tools return capped, structured output. All 8 files in `.claude/agents/` now carry a paragraph
fighting this instruction (`implementer.md`: "Regardless of ambient guidance to prefer Bash/`sed`/
heredocs…") and it still loses. `LEARNINGS.md` → "Edit tool text matching can silently drop a literal
ESC byte" is the silent-wrong failure this mode invites.

**Fix.** Leave bypass mode. `permissions.defaultMode: "acceptEdits"` in `.claude/settings.json`, keep the
existing `allow` list, add `ask` (a real key, distinct from `deny`) for the risky handful; optionally
`permissions.disableBypassPermissionsMode: "disable"`. It costs no stalls: 18 permission stalls across
every transcript ever recorded, so the allow list is already broad enough.

**Effect.** Restores capped structured reads/searches as the default path; unlocks items 3 and 7; lets
~4 lines × 8 agents of anti-`sed` prose leave the fixed preamble re-read on every request. **Owner
decision.**

### 2. `apps/tui/test/fake-api.ts` is cast, not type-checked — tooling, ~1h

**Friction.** `apps/tui/test/fake-api.ts:421` ends the fake client with `} as unknown as PatchesApi;`.
`PatchesApi` (`apps/tui/src/api/client.ts`) has ~142 methods; the fake stubs a fraction. A new RPC or
response field therefore produces a _runtime_ symptom — a screen rendering wrong, a confusing frame diff
— instead of a compile error. Six-plus fix commits are exactly this shape — `stub FakeApiHandle.
getNodePolicy so the login flow renders in tests`, `add getAuthPolicy to the fake-api test harness`,
`satisfy Relationship.requested/requestedBy in the fake API fixture`, and three more. `fake-api.ts` is
the 2nd-most-read file in the repo (44 reads, 1,503 lines).

**Fix.** Replace the cast with a structural obligation: `satisfies Record<keyof PatchesApi, unknown>`, or
an explicit `Pick<PatchesApi, …>` plus a `never`-typed exhaustiveness check over the remainder with a
documented allowlist of deliberately-absent methods. Missing member ⇒ `tsc` error naming it, at the fake,
on the first typecheck. **Effect:** each avoided instance is one debug cycle — tens of turns at ~200k
context, i.e. millions of cache-read tokens. Best value-per-hour on this list.

### 3. Reading discipline: bound the read, map big files symbolically — rule, ~30min

**Friction.** 56% of `Read` calls are unbounded. `App.tsx` (2,281 lines) read 124 times;
`apps/tui/src/api/client.ts` (1,864) 28 times; `fake-api.ts` (1,503) 44 times. A whole-file read of
App.tsx is ~30k tokens, and a token added at request _i_ of an _N_-request agent is paid _N−i_ times —
for a 196k-mean worker that is the biggest controllable input to "53% of tokens above 100k context".

**Fix.** `LSP documentSymbol` is confirmed in the 2.1.237 binary. Rule: files over ~600 lines are opened
with `documentSymbol` first (a symbol map, ~1–2k tokens), then `Read` with `offset`/`limit` on the one
range. Put it in `.claude/rules/tui.md` and `server.md`, not `CLAUDE.md`, so it loads only on those
paths. Separately, splitting `App.tsx` (12 top-level declarations across 2,281 lines) is product work
with a harness payoff — see "Needs owner decision".

### 4. Make commands emit machine-shaped output so agents stop parsing their own output — config, ~1h

**Friction.** 4,241 of ~5,958 shell-`grep` arguments are regexes, and the top ones are not code search
— they are agents post-processing command output and markdown:

```
48 × '^- \[ \]'          counting open tasks in tasks.md
35 × 'Test Files|×' etc. parsing vitest's default reporter
31 × 'error TS'          parsing tsc
74 × '^??' / '^[AM]'     parsing git status porcelain
64 × '^## ' / '^# '      finding headings in a doc
```

Each is an extra request at full context to recover a fact the command could have emitted directly. No
`reporters` are configured anywhere (`vitest.config.ts:19` sets coverage reporters only), so agents get
the verbose default and grep it.

**Fix.** (a) `reporters: process.stdout.isTTY ? ['default'] : ['dot']` in the shared vitest config —
agents are always non-TTY, so they get the compact reporter automatically. (b) A `mise run tasks` task
printing open/next tasks as data (the logic already exists in `.claude/hooks/session-start.sh`).
(c) Put `git status --porcelain=v1`, `eslint -f unix`, `git --no-pager diff --stat` in the rules files
as copy-paste lines rather than as advice.

### 5. Skill frontmatter is unused, and one key in use is inert — config, ~2h

**Friction.** All 8 `.claude/skills/*/SKILL.md` declare only `name`, `description`, `allowedTools`, and
`invocation: user`. **`invocation` is not a real key** — 0 occurrences in the 2.1.237 binary, against 16
for `user-invocable-only` and 13 for `skillOverrides`. Seven skills that declare themselves user-only
are in fact model-invocable and can be auto-loaded into a context that did not ask for them. The
corroborating evidence is already in-repo: `.claude/settings.local.json` carries `"skillOverrides":
{"verify": "user-invocable-only"}` — the one skill someone needed to pin had to be pinned outside the
frontmatter, because the frontmatter key does nothing. (`allowedTools` camelCase _is_ recognized, 107
occurrences — that one is fine as written.)

Verified in the binary but unused: `disallowed-tools`, `model`, `effort`, `paths`, `argument-hint`,
`arguments`, `disable-model-invocation`, `user-invocable`, `context: fork` + `agent:`, `background`,
`hooks`.

**Fix, highest-value first.**

- **`/verify` → `context: fork`, `agent: verifier`, `model: haiku`.** The whole build/lint/typecheck/
  test wave then runs in a fresh haiku context and only the verdict returns to the caller. This is the
  native form of the H-011 experiment ("keep churn in the cheapest context") with zero orchestration
  overhead — no `Agent` call to write, no brief to compose.
- **`paths:`** on `/proto-change` and `/migration` so they auto-surface when `packages/proto/**` or
  `packages/database/**` is touched, instead of relying on an agent remembering the skill exists.
- **Replace `invocation: user`** with the real controls (`user-invocable`, `disable-model-invocation`)
  in all seven skills, then drop the `skillOverrides` workaround from `settings.local.json`.

### 6. Proto changes have no deterministic closure check — script + skill, ~1h

**Friction.** `.claude/skills/proto-change/SKILL.md` step 7 says "update the consumers" without saying
how to find them, producing a recurring class of follow-ups (`fix(proto): add missing
NOTIFICATION_TYPE_SECURITY to the hand-mirrored enum`; `fix(tui,server): pass explicit scopes: []`) and
a `LEARNINGS.md` entry (2026-08-19, `repeated` proto fields) whose own conclusion is "a green
`@patches/proto build` does not mean the monorepo is green". The fan-out is wider than the skill admits:
`src/generated/` (ts-proto), `src/generated-es/` (protobuf-es), the hand-maintained `src/enums.ts`
mirror, `constants.ts`, `index.ts`, `nest.ts`, `apps/tui/test/fake-api.ts`, `docs/architecture/api.md`.

**Fix.** A `proto:check` script chaining what already exists: `pnpm proto:lint && pnpm proto:gen && git
diff --exit-code -- packages/proto/src/generated packages/proto/src/generated-es && pnpm proto:breaking
&& pnpm --filter @patches/proto test && pnpm typecheck`. The last step is the missing one and is what
catches every source-breaking case above. Make it `/proto-change` step 4.5 and make the skill's "done"
condition be that command exiting 0. `enums.test.ts` already guards mirror drift — it just isn't run
before the change is declared finished.

### 7. Targeted replacement is not being used — prompt, ~15min

`Edit(replace_all: true)` was used **10 times out of 3,401 Edit calls**; `LSP` has 4 calls total. A
symbol rename across packages is currently N sequential single-shot Edits at full context. One recipe in
`HARNESS.md`'s symbolic-search section: rename = `LSP findReferences` → one `Edit(replace_all: true)`
per file returned → one scoped typecheck. Name where grep stays correct — proto field names/numbers,
config and env keys, user-facing strings, §153 prohibition sweeps — so the rule doesn't overreach.

### 8. Unused hook events that make an instruction mechanical — tooling, ~2h

Confirmed in the binary: `UserPromptSubmit`, `SubagentStart`/`SubagentStop`, `PreCompact`,
`PostToolUseFailure`, `TaskCreated`/`TaskCompleted`, `SessionEnd`, `ConfigChange`.

- **`PostToolUseFailure`** — inject the repo's known remedy as `additionalContext` when a failure matches
  a known class, instead of the agent re-deriving it: connection refused on 5432 → `mise run compose --
up -d`; `TS2307` → `PACKAGE_CONVENTIONS.md`'s CJS/ESM split; the "vitest collects compiled tests from
  `dist/`" trap. All three are already in `LEARNINGS.md`. Best fit for "mechanical, not instructional":
  it fires exactly when needed and costs nothing otherwise.
- **`SubagentStop`** — append `{agent, requests, cache_read, mean_ctx}` to a JSONL log so `mise run
usage` reads one small file instead of walking every transcript, and a lifetime regression shows up
  the same day rather than at the next audit.
- **`UserPromptSubmit`** — inject branch + open-task count deterministically, retiring the `^- \[ \]`
  greps in item 4. `PreCompact` is not worth using: the 500k auto-compact window is deliberate and
  compaction is rarely reached.

### 9. Whole-file `Write` where an `Edit` would do — prompt, ~15min

266 `Write` calls landed on a path already written (0.90M chars of whole-file rewrite), and `Write`
content totals 5.0M chars ≈ 22% of the project's entire 5.7M output-token spend. On an existing file
`Write` re-emits every unchanged line as expensive output tokens. One line in the token-discipline
section: **`Write` creates, `Edit` changes.**

## Workflows vs. nested agents — recommendation

Both exist natively in 2.1.237: `.claude/workflows/<name>.js` with a `pipeline(items, fn)` fanout
primitive (5 binary references, plus `workflowSizeGuideline` in settings), and skill-level
`context: fork` + `agent:`.

**Recommendation: neither as a general shape. Use `context: fork` on skills; reach for a Workflow only
where control flow is already known.** A Workflow removes _model turns_ from deterministic control flow
— for `/verify`, a phase wave, or item 6's proto fan-out the sequence is fully known, so paying an LLM
to decide "now run typecheck" is pure waste. But nesting a sonnet agent under another sonnet agent does
not reduce Σ(context); it relocates it and adds a brief plus a report at both ends. The measured 47/53
subagent/orchestrator split means there is no cheap _context_ to hide work in — only a cheap _model_,
which is exactly what `model: haiku` on a forked skill buys.

**Cheapest experiment.** Run one proto-change task twice from the same commit — once with today's flat
`/proto-change`, once with `/verify` converted to `context: fork` + `agent: verifier` + `model: haiku`
— and diff `mise run usage --since <ts>`. One task, two runs, no new infrastructure. If the fork variant
doesn't move total cache reads by >10%, drop the idea and spend the effort on items 2 and 4.

## The `pnpm verify` loop

Turbo's `test` task is `dependsOn: ["^build"]` with `outputs: ["coverage/**"]` and is cacheable, so a
warm re-run should be near-free — the cost concentrates in a session's first run and in the _reporting_,
which item 4 addresses. `.claude/skills/verify/SKILL.md` documents a scoped variant already; the gap is
that it isn't the default and no per-package minimal command is written down, so every agent re-derives
one. A per-workspace table of the shortest correct command belongs in that skill. Wall-clock timings
were commissioned in this pass and hadn't landed when this file was written — fill in the per-package
table before acting on the scoped-verify item.

## Needs owner decision

1. **Leaving bypass-permissions mode (item 1).** Highest-leverage item and the only one that changes how
   the session is launched. Trades a small risk of permission prompts (measured: 18 ever) for restoring
   capped, structured file access as the default. The harness's whole "use Read/Edit/Write, not sed"
   posture is currently fighting a system instruction it cannot win against. Recommended.
2. **`isolation: "worktree"` on `implementer`.** Would mechanically prevent the `git add -A` /
   half-done-files-from-another-agent hazard (`LEARNINGS.md`, 2026-08-17) instead of relying on the
   disjoint-file-set convention. Interacts with the `gh stack` workflow and with commits landing on the
   current top branch — needs a call on whether worktree commits are acceptable there.
3. **Splitting `apps/tui/src/app/App.tsx`** (2,281 lines, 124 reads, the repo's most expensive file to
   read). Product work with a harness payoff; belongs on `tasks.md`, but someone has to decide it's worth
   doing.

## Corrections to assumptions this harness was built on

- **"Symbolic search beats grep" is only ~11% true here.** 663 of ~5,958 grep arguments were
  symbol-like; 4,241 were regexes parsing command output and markdown structure. LSP is worth adopting,
  but item 4 is the larger share of search cost.
- **`Grep` and `Glob` have never been called — not once.** Any rule phrased "use `Grep` instead of shell
  grep" is inert today; item 1 is what makes such a rule capable of holding.
- **Output truncation is confirmed a non-problem.** 22,615 tool results, 34.5M chars, 99 above 20k
  chars. The standing constraint against summarizing hooks is supported by data, not just principle.
- **Permission stalls are a non-problem** (18, ever). Don't spend effort on the allow list for its own
  sake — only as the enabler in item 1.
