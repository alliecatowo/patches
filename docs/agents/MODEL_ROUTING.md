# Model routing

Routing table and rationale for which model handles which kind of work in this harness.
See `.claude/agents/*.md` for the per-agent assignment; this doc is the reasoning behind it.

## Table

| Model      | Use for                                                                                               | Examples in this repo                                                                                                              |
| ---------- | ----------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| **haiku**  | Mechanical, deterministic checks; no judgment calls                                                   | `verifier` running `pnpm verify`; formatting cleanup; simple lookups ("what's the current handle regex")                           |
| **sonnet** | Default implementation, research, docs — the workhorse                                                | `implementer` shipping a task; `researcher` writing a verified doc note; `docs-writer` syncing docs; `harness-tuner`               |
| **opus**   | Review, architecture, hard debugging, risky spikes — anywhere a wrong call is expensive               | `reviewer` against hard rules; `architect` writing ADRs; `spec-auditor` sweeping the codebase                                      |
| **fable**  | Only the toughest problems — deep architectural audits, genuinely ambiguous designs with no precedent | pre-federation security audit (§160), pre-MVP-deploy audit (§159), a design question `architect` explicitly flags as warranting it |

## Rationale

- **Cost/speed/quality tradeoff**: haiku is cheap and fast but has no room for judgment — use
  it only where the task is a checklist, not a decision. Sonnet is the default because most
  of this repo's work (implementing a scoped task against a documented spec, writing a
  research note, syncing a doc) is well-specified enough that a stronger model doesn't buy
  much. Opus earns its cost when the task is evaluative (review, architecture) rather than
  generative, or when a mistake compounds (a wrong ADR, a missed hard-rule violation). Fable
  is reserved and expensive — spend it only where getting it wrong is genuinely costly and
  the problem is genuinely hard, not as a default upgrade.

## Rules of thumb

1. **Parallelize breadth with sonnet.** When a phase splits into many independent
   implementer tasks, fan them all out at sonnet rather than trying to use fewer, stronger
   agents serially.
2. **Escalate on second failure.** If a sonnet `implementer` gets stuck on the same problem
   twice (verification keeps failing for the same reason, or it reports a real blocker),
   don't retry a third time at the same model — escalate to `architect` (opus) rather than
   burning more sonnet attempts on a problem that needed better judgment from the start.
3. **Reviewers should be a stronger model than implementers.** `reviewer` (opus) reviews
   `implementer` (sonnet) output — never route review through the same or a weaker model
   than the one that wrote the code; it won't catch what it wouldn't have caught itself.
4. **Read-only, high-stakes sweeps go to opus/fable, not sonnet.** `spec-auditor` (opus,
   escalatable to fable) trades speed for thoroughness — it runs at phase boundaries, not on
   every commit, so the cost is justified.
5. **Don't downgrade `implementer` to haiku** even for "simple" tasks — implementation
   requires judgment about layering, security, and when to stop and ask; haiku is for
   verification, not authorship.
