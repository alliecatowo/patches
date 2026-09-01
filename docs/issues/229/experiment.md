# H-011 nested-delegation experiment

## Decision

Do not adopt nested delegation from this run. It was not possible to produce a
valid paired measurement in the provided workspace, and a synthetic estimate
would not satisfy H-010's measurement contract.

## Baseline

H-010's corrected repository baseline is 7.62B cache-read tokens, split 53%
orchestrator / 47% subagents, with 196k mean worker context over 18,676
requests. The authoritative parser groups repeated JSONL fragments by
`message.id`; counting lines would inflate the result.

## Reproducible protocol

Run each strategy on the same representative task wave, with the same prompt,
repository snapshot, model routing, and validation requirements:

1. Baseline: one bounded implementer owns read, edit, and verify.
2. Nested: one Sonnet implementer has only `Agent`; Haiku children own read,
   edit, and verify waves, with compact packets and disjoint paths.
3. Save the main and child transcripts without mixing the two runs.
4. Run `mise run usage -- --json --since <start>` for each run (or invoke
   `infra/scripts/usage-report.mjs --json` directly) and compare total
   cache-read tokens, requests, tool calls/request, worker mean context, and
   above-100k/200k shares.
5. Adopt only if the nested run completes the same acceptance criteria and
   reduces total cache-read cost without increasing unsafe scope, retries, or
   validation failures.

## Guardrails

Nested delegation must remain opt-in and experimental. Children receive exact
owned/forbidden paths, may not spawn grandchildren, may not commit/push, and
must return bounded handoffs. The profile must not reintroduce Anthropic
inference into the repository's default llmgateway routing or weaken any hard
rule.

## Evidence from this run

- `infra/scripts/usage-report.mjs --json`: zero main and subagent contexts in
  this workspace; no paired run exists.
- Environment stamp: `workspace:/home/allie/develop/patches/.polyphony/workspaces/_229@e62fdda`.
- `git fetch origin main`: unable to update `.git/FETCH_HEAD` because the
  managed workspace exposes Git metadata read-only; `HEAD` already matched
  `origin/main` at kickoff.
