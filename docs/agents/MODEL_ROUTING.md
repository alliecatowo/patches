# Model routing

The frontier main session is an orchestrator and acceptance gate, not the default implementer. It
only routes work already defined by the user, the [GitHub Project board](https://github.com/users/alliecatowo/projects/5), or the spec. Each delegated task has a
short, self-contained packet: goal, constraints, exact owned and forbidden paths, acceptance
checks, and any current state needed to start. Use reduced/non-full fork context when supported.

| Work shape                                                                                          | Codex capability | Claude capability class | Required guard                             |
| --------------------------------------------------------------------------------------------------- | ---------------- | ----------------------- | ------------------------------------------ |
| Search, classification, mechanical edit, narrow diagnostic, scoped check                            | Luna             | Haiku-equivalent        | Exact paths and an explicit stop condition |
| Routine implementation, tests, docs, research, routine review                                       | Terra            | Sonnet-equivalent       | Disjoint ownership and scoped verification |
| Architecture, crypto/security, ambiguous cross-cutting issue, difficult debugging, high-risk review | Sol              | Opus-equivalent         | Evidence and explicit acceptance gate      |

Use a currently available model in the named capability class; these are routes, not a promise
that a particular provider/model is installed. Reserve the frontier tier for work where a mistake
is expensive to reverse. A worker may delegate a genuinely independent mechanical subtask to a
cheaper class, but not a second coordination layer.

Independent review is strictly stronger in effective capability than implementation: low/medium
Terra work may receive high Terra review; high Terra or risky cross-cutting work requires Sol
review. Do not place Sol on implementation that requires independent stronger review. The
`verifier` runs the relevant canonical checks; the implementer owns remediation.

After two equivalent failures, change approach or escalate rather than retrying unchanged. No
routing choice authorizes guessed tasks, scope expansion, or a deviation from hard rules.
