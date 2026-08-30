# Security review and remediation record

## Review status

No independent cryptographic review or external security audit is evidenced for this rollout.
The repository's internal audit and ADR 0036 policy substitution are engineering evidence, not
third-party approval. `E2EE_V1` must not be described as independently reviewed until a signed,
scope-matched report is attached to the issue and each finding below has an owner and disposition.

## Gate matrix

| Area                | Required evidence                                                      | Current repository evidence                       | Disposition                                   |
| ------------------- | ---------------------------------------------------------------------- | ------------------------------------------------- | --------------------------------------------- |
| Identity binding    | Root/device certificate vectors, roster rollback tests                 | ADR 0020 §2–3; domain and server tests            | Engineering evidence; external review pending |
| X3DH setup          | Canonical transcript, one-time-prekey exhaustion and replay tests      | ADR 0020 §5; crypto test suites                   | Engineering evidence; external review pending |
| Double Ratchet      | Header encryption, skipped-key bounds, crash/rollback tests            | ADR 0020 §6; `packages/crypto/` tests             | Engineering evidence; external review pending |
| Vault safety        | Atomic send/receive persistence and keychain/passphrase boundary       | ADR 0020 §4; client vault code/tests              | Engineering evidence; external review pending |
| Fanout/groups       | Exact active-device coverage and epoch conflict tests                  | ADR 0020 §7; E2EE server tests                    | Engineering evidence; external review pending |
| Franking            | Commitment/opening construction, sender/receiver binding, key rotation | ADR 0020 §9 explicitly requires review            | **Open security blocker**                     |
| Abuse evidence      | Reporter consent, verification failure behavior, no body in telemetry  | ADR 0020 §9; report-evidence implementation       | Engineering evidence; external review pending |
| Metadata/disclosure | Client copy accurately names node-visible metadata                     | `docs/architecture/e2ee.md`; product/privacy docs | Copy review required with external report     |

## Remediation rule

The cryptographic reviewer must assess the actual v1 wire/domain implementation, including the
franking construction and its domain separation. Findings are tracked as blocking until fixed,
accepted by the reviewer in writing, or explicitly deferred by an owner decision recorded in a new
ADR. No environment flag, capability response, or lab pass substitutes for that review.

## Residual risk

Even after review, classical v1 makes no post-quantum claim; the node retains metadata and can
deny service or forge its own symmetric franking tag; JavaScript secret wiping is best effort; and
report evidence is reporter-selected. These are product/security disclosures, not defects to hide.
