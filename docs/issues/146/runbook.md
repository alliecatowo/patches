# E2EE v1 production rollout runbook

## Gate before enablement

Enablement is allowed only when all are attached to the issue: an independent cryptographic review
covering franking and the actual implementation; remediation dispositions; a green real-node lab
for HTTP/web plus the TUI/reference crypto path; green scoped/full validation; and an owner
decision acknowledging metadata disclosure and residual risks.

The current repository follows ADR 0036's pre-alpha **always-on** capability behavior: a signing
key makes `GetE2eeCapability` report enabled. That policy substitution is not evidence that the
security gate is complete. Until the gate above is satisfied, do not deploy a signing key to a
production node or advertise E2EE as approved.

## Controlled procedure

1. Record the candidate build SHA, schema migration state, crypto/domain test results, reviewer
   report, and lab transcript in the issue workpad.
2. Deploy to an isolated staging node with a fresh signing key and run
   `infra/scripts/e2ee-lab.sh run`; retain only sanitized, body-free logs.
3. Confirm capability disclosure, client copy, active-device roster changes, fanout exactness,
   mailbox expiry, franking verification, and telemetry contain no message bodies or DM identifiers.
4. Obtain the explicit owner enablement decision, then deploy the same immutable artifact to the
   approved invite-only node. Do not alter protocol parameters during rollout.
5. Monitor capability errors, fanout rejection, prekey inventory, mailbox latency/expiry,
   franking verification failures, and generic client error rates. Alert on any body-bearing log or
   unexpected capability state.

## Abort and rollback

Abort on any review blocker, failed lab assertion, identity/roster rollback acceptance, missing
active-device fanout, franking mismatch, body-bearing telemetry, unexplained capability state, or
client disclosure regression. Stop new E2EE conversation creation and preserve body-free forensic
logs. Existing E2EE conversations must never silently fall back to plaintext.

Because ADR 0036 derives capability from the current franking signing key, rollback is a reversible
configuration/deployment action: remove or revoke that node signing key through the approved secret
rotation procedure, verify `GetE2eeCapability` is `DISABLED`, and keep the node serving no new E2EE
conversations. Do not delete ciphertext, rotate protocol identifiers in place, or reinterpret old
envelopes. Re-enable only with a fresh reviewed artifact and a new gate record.

## Observability and privacy

Allowed signals are aggregate capability state, counts, durations, status/error codes, and bounded
inventory/mailbox metrics. Never log or metric message bodies, openings, plaintext, ratchet keys,
tokens, conversation IDs, device IDs, or message IDs. Reports remain explicit reporter disclosures
and must follow ADR 0020 retention/access controls.
