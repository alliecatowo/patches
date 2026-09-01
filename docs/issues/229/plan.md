# Issue #229 plan

## Scope

Evaluate, but do not silently adopt, a Sonnet implementer restricted to `Agent`
that delegates read/edit/verify waves to Haiku workers. The experiment must use
the H-010 measurement semantics and preserve the repository's current
llmgateway-only routing and bounded-worker rules.

## Checklist

- [x] Reconcile issue state and inspect the H-010 baseline and current agent
      configuration.
- [x] Attempt the existing measurement command against this workspace.
- [x] Determine whether this workspace can run a valid Sonnet/Haiku paired experiment.
- [x] Document the reusable protocol, guardrails, and evidence-backed outcome.
- [x] Assess paired Sonnet/Haiku execution; runtime and transcripts were unavailable, so no trial was claimed.

## Acceptance mapping

| Requirement                   | Evidence                                                                |
| ----------------------------- | ----------------------------------------------------------------------- |
| H-010 baseline is identified  | `docs/agents/CONTEXT_ECONOMY.md` corrected baseline                     |
| Measurement is reproducible   | `infra/scripts/usage-report.mjs --json` and protocol in `experiment.md` |
| Adoption decision is explicit | `experiment.md` and `CONTEXT_ECONOMY.md`                                |
| Per-issue artifacts exist     | `plan.md`, `run-log.md`, `handoff.md`                                   |

## Result

The paired experiment was not executable here: the repository routes inference
through `llmgateway/*`, sets `CLAUDE_CODE_DISABLE_ANTHROPIC=1`, exposes no
Sonnet/Haiku profile, and the measurement command found zero transcript
contexts. The nested profile is therefore not adopted on this evidence.
