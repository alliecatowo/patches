# 0027. Unreviewed E2EE may run only with explicit owner authorization on a disposable node

**Status:** Accepted
**Date:** 2026-08-22

## Context

ADR 0020 deliberately permits the E2EE node protocol only on isolated test nodes until its hard
ship gates pass. ADR 0024 rejected the first franking construction, and ADR 0025 repaired the
known binding defects but explicitly left the independent external-review gate open. The global
`E2EE_APPROVED_FRANKING_PROFILES` list is therefore correctly empty and must remain the
production approval source.

That fail-closed constant now prevents the real persistence, deduplication, exact multi-device
fanout, revocation serialization, mailbox pagination/acknowledgement, malformed-input, and report
opening paths from running in integration tests or on the owner's disposable development node.
Replacing those tests with assertions that the ship gate rejects first preserved the gate but
removed downstream regression coverage. It also made the implemented development protocol
impossible to exercise end to end.

On 2026-08-22 the owner explicitly authorized running this unreviewed construction on disposable
development infrastructure with no real users. This is authorization for development and testing,
not an external review, a production-security claim, or permission for a production operator to
inherit the exception.

## Decision

Add an explicit `E2EE_UNREVIEWED_DEV_MODE` server setting, defaulting to `false`. This flag is the
node-level owner opt-in: an unreviewed E2EE path is permitted only when it is explicitly true, and
only for a disposable node with no real users. `NODE_ENV` continues to control runtime behavior
(including production logging and optimization); it is not a deployment trust classification and
does not authorize or reject the flag. The owner-authorized disposable Fly node therefore keeps
`NODE_ENV=production` and explicitly sets `E2EE_UNREVIEWED_DEV_MODE=true`.

Do not add `patches-franking-v1` to `E2EE_APPROVED_FRANKING_PROFILES`, mutate that frozen list in a
test, or make approval depend directly on `process.env`. Instead, the E2EE Nest module owns one
injected runtime approval policy. Its default behavior delegates to
`assertFrankingProfileApproved`; its explicit owner-authorized disposable-node behavior permits
exactly `E2EE_FRANKING_PROFILE_V1`. Both `GetE2eeCapability` and the shared create/send fanout
accept core must consume this same policy instance. The fanout core receives the policy as an
explicit dependency and checks it before dedup lookup or any database write.

When the development exception is active and a node franking key is available,
`GetE2eeCapability` reports `E2EE_CAPABILITY_STATE_ISOLATED_TEST_ONLY`, the actual protocol limits,
`patches-e2ee-v1`, and `patches-franking-v1`. It must never report `EXTERNAL_REVIEW_PENDING`,
`EXPERIMENTAL_CANARY`, or `ENABLED`. If the exception is off or the key ring cannot sign, it reports
`DISABLED` with the existing empty/zero fields. A send still fails closed when either the policy
rejects the profile or no signing key exists.

Any client surface that enables this state must show a persistent warning at conversation creation
and reading: **“Unreviewed development E2EE — for testing only; do not use for sensitive
conversations.”** The ordinary `E2EE_V1` disclosure about routing metadata still applies. The
isolated-test state must not be collapsed into an ordinary enabled boolean in client code.

Integration tests inject a small allow-only-`patches-franking-v1` policy directly into
`E2eeConversationService`; this is a constructor dependency, not an environment switch. They keep
a separate fail-closed test using the default policy, then restore the downstream accept-path and
malformed-input tests under the test policy. This test seam cannot alter a production process's
configuration or the domain approval list.

Removal conditions are explicit: delete `E2EE_UNREVIEWED_DEV_MODE`, its development policy branch,
and the warning copy when an independent external review of the exact protocol and implementation
has completed, all critical/high findings are remediated, and a later ADR authorizes a reviewed
profile and rollout state. Passing integration tests alone never satisfies those conditions.

## Consequences

The owner can exercise and deploy the complete E2EE path on a disposable development node, and the
integration suite again covers behavior below the ship gate. Capability negotiation truthfully
distinguishes the unreviewed development mode from a reviewed canary or enabled product.

The owner-authorized disposable node is deliberately exposed to unknown cryptographic and
implementation defects. Its data must be treated as disposable, it must have no real users, and
its E2EE output must not be described as production-secure or externally reviewed. CI and
deployment checks keep deployment manifests pinned to `NODE_ENV=production` for normal runtime
behavior; the explicit default-false flag, not `NODE_ENV`, is the opt-in boundary.

No production security control is relaxed: the global external-review list stays empty, the
default stays disabled, unknown profiles still fail, the franking-key requirement remains, and
create/send/replay continue to share one pre-write gate. `NODE_ENV=production` is not itself a
security review or deployment-trust claim.

## Alternatives considered

- Add `patches-franking-v1` to the global approval list. Rejected because it would falsely record
  an external review and enable the construction in production.
- Set or monkey-patch the frozen approval list in tests. Rejected because mutable global security
  policy is order-dependent and does not provide an honest live-development capability.
- Bypass the gate only inside the integration test file or seed accepted database rows directly.
  Rejected because it would not exercise the real accept transaction and would leave live
  development disabled.
- Remove the accept-path tests and test only fail-closed behavior. Rejected because it loses the
  persistence, deduplication, fanout, revocation, pagination, acknowledgement, and malformed-input
  regression coverage that the implementation needs before external review.
- Infer authorization from `NODE_ENV`. Rejected: `NODE_ENV` is a runtime setting, and conflating
  it with deployment trust both disables optimized disposable-node deployments and obscures the
  actual owner-controlled opt-in.
