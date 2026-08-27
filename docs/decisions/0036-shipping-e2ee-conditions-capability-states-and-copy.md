# 0036. Shipping E2EE: the conditions, the capability ladder, and the copy that survives it

**Status:** Accepted
**Date:** 2026-08-26
**Amends:** [0020](./0020-e2ee-direct-messages.md) §12.7 and §12.9 (what discharges the review gate),
§14.8 (where the approval list lives and what can move it); [0027](./0027-unreviewed-e2ee-development-mode.md)
(scope of the 2026-08-22 owner authorization, and the flag's removal conditions)
**Relates to:** [0024](./0024-franking-construction-review.md), [0025](./0025-franking-commitment-binding.md),
[0030](./0030-pre-alpha-consolidation-policy.md), [0033](./0033-one-e2ee-identity-transcript-family.md),
[0034](./0034-shared-client-e2ee-runtime.md), [0035](./0035-reserve-e2ee-conversation-before-first-message.md);
epic #250
**Needs explicit owner sign-off before step 9 of §7 executes:** the §2.3 substitution for ADR 0020 §12.9.

## Amendment (2026-08-26, owner override — same day as the decision above)

Later the same day, the owner overrode the staged plan this ADR records, for the same reason
stated in the Context below (a pre-alpha, invite-only node with six test accounts and zero real
conversations does not need a multi-week staged rollout designed for real users): E2EE ships as
an ordinary always-on feature. Concretely, **superseded**:

- §1's nine conditions (S1–S9) and §2's review-gate discharge mechanism (the three-reviewer
  adversarial review, ADR 0037) — no longer a precondition for anything, because there is no
  rollout ladder left to climb. Nothing here says the work S1–S9 named is worthless; it is simply
  no longer gating.
- §3's four-state capability ladder and §7's eleven-step sequencing. The node now reports
  `ENABLED` whenever it has an approved franking profile and a signing key for its current era,
  and `DISABLED` otherwise. `ISOLATED_TEST_ONLY` and `EXPERIMENTAL_CANARY` remain defined in the
  proto enum (never reuse a field/enum number, spec §153) as a home for a future unreviewed
  protocol change, but nothing produces them.
- §3.4's table and §3.5's canary-triggered disposability sunset — moot once there is no canary
  state to reach; `packages/domain`'s `E2EE_APPROVED_FRANKING_PROFILES` now includes
  `patches-franking-v1` directly, not as a step gated on ADR 0037.
- `E2EE_UNREVIEWED_DEV_MODE` (the flag, its `ISOLATED_TEST_ONLY`-warning wiring, and ADR 0027's
  scope for it) is deleted end to end, not merely defaulted off — §3.3 point 3's "remains the
  only widening mechanism" no longer applies because there is nothing left for it to widen past.

**Retained, unchanged:** §3.3's fix to the environment-widening hole (`E2EE_APPROVED_FRANKING_PROFILES`
(env) may only narrow the domain constant, never widen it) — implemented directly rather than as
a "lands now, at ISOLATED_TEST_ONLY" interim step, since there is no longer an interim state to
land it at. §4.2's per-state notice table collapses to just `DISABLED`/`ENABLED` (empty), for the
same reason. §4.3's standing disclosures — the always-true facts about routing metadata, reporter
disclosure, node-forgeable receipts, server-served device lists, irrecoverable loss, and the
browser key tier — are **retained in full and remain mandatory**; nothing in this Amendment
touches them, and no new warning text is introduced. §4.1's §183.1/CLAUDE.md finding is unaffected
by this Amendment and is tracked separately (issue #198).

The rest of this ADR below is left intact as the record of what was considered and why — including
why a staged ladder originally looked like the right shape for this decision. It is superseded,
not deleted, so a reader can see the reasoning that preceded the override.

## Context

On 2026-08-26 the owner said, of the current E2EE posture:

> "lets toss any bullshit 'needs review and approval' 'untrusted dev node' thats FINE lets build it
> out PROPER instead of presenting half baked work as finished because its hiding behind a million
> gating caveats"

The objection is correct and it is not an objection to the caveats. Every caveat on the board today
is **true**, which is the actual problem: a node that has never completed a single E2EE handshake is
displaying a banner that accurately describes it. Deleting the banner would leave the sentence
"presenting half baked work as finished" exactly as apt. So this ADR does the other thing — it
writes down what would have to become true for each caveat to be false, and the mechanism that
flips the node when they are.

### Verified state of the tree and the node, 2026-08-26

- `docs/decisions/0027` created `E2EE_UNREVIEWED_DEV_MODE` (`apps/server/src/config/env.schema.ts:85`,
  default `false`), the `ISOLATED_TEST_ONLY` capability state, and the mandatory client string
  `E2EE_UNREVIEWED_DEV_MODE_WARNING` (`packages/domain/src/e2ee/modes.ts:20`). The live node sets the
  flag at `infra/fly/fly.toml:26`.
- `E2EE_V1_ENABLED` (`env.schema.ts:96`) defaults `false` and is absent from `fly.toml`.
- `apps/server/src/modules/e2ee/e2ee-capability.service.ts` computes `DISABLED` /
  `ISOLATED_TEST_ONLY` / `EXPERIMENTAL_CANARY` / `ENABLED` from the runtime approval policy, the
  franking key ring, and `e2eeV1Enabled`.
- ADR 0033's `@patches/crypto` half has landed (`packages/crypto/src/identity-transcript.ts` exists),
  but the server and client halves have not: `apps/server/src/modules/e2ee/e2ee.codec.ts` still owns
  its own encoder and still carries its "not yet hoisted into `@patches/domain`" comment, and both
  `apps/tui/src/e2ee/node-transcripts.ts` and `apps/web/src/e2ee/node-transcripts.ts` still exist.
  Epic #250 stages 3–7 are open.
- The 2026-08 audit that ADR 0024/0025 rest on read transcripts ADR 0033 has since replaced. ADR
  0033's own Consequences says so and says it does not discharge ADR 0020 §12.
- ADR 0035 changed the conversation-creation wire contract (reserve, then send).
- Owner-verified on the live node the same day, and taken here as reported rather than re-run:
  franking key era 1 exists; every `e2ee_*` table is empty, including `e2ee_report_evidence`; six
  non-deleted actors; no conversations.

### Three findings that are not in the framing, and that change the answer

**1. `E2EE_APPROVED_FRANKING_PROFILES` is an environment variable, not only a frozen constant.**
ADR 0020 §14.8, ADR 0024, ADR 0025 and `docs/architecture/e2ee.md` §5 all say the approval list is
`Object.freeze([])` in `packages/domain/src/e2ee/modes.ts` and that opening it "requires amending
this ADR, not editing a constant in a feature branch." That is not what the running node does.
`env.schema.ts:87` defines `E2EE_APPROVED_FRANKING_PROFILES: z.string().default('')`;
`app-config.service.ts:56` splits it; `e2ee-runtime-approval.module.ts` feeds it to
`E2eeRuntimeApprovalPolicy`, whose `isProfileApproved` consults **only** that env-derived set. The
domain constant is reached solely by `assertFrankingProfileApproved` as a fallback throw.

So today, anyone with deploy access could set two `[env]` values and move the reference node to
`E2EE_CAPABILITY_STATE_ENABLED` — past a gate three ADRs describe as unmovable without an ADR. The
gate everyone has been treating as the load-bearing one is a string comparison against an env var.
This is not a hypothetical: `infra/scripts/e2ee-lab.sh` documents exactly that two-line prod flip in
its header. Fixing this is part of this decision, not a follow-up.

**2. The capability state enforces nothing.** `assertConversationModeNegotiation`
(`packages/domain/src/e2ee/modes.ts:60`), the function that consumes `capabilityState` and
`isolatedTestNode`, has **no production caller** — only tests. The capability service's own comment
concedes the adjacent half of this ("Canary and enabled accept identical send traffic; this is
disclosure, not a new gate"). The single real pre-write gate is
`E2eeRuntimeApprovalPolicy.assertProfileApproved` in the fanout accept path. Any honest model of the
ladder has to say this out loud rather than leave a five-state enum implying five enforcement tiers.

**3. §183.1 no longer has a subject.** ADR 0030 §B-095 deleted `LEGACY_SERVER_VISIBLE`
(`e2ee.proto:137` reserves the enum value and name; migration
`packages/database/src/migrations/1787660000000-RemoveLegacyServerVisibleDms.ts` deletes the rows).
`E2EE_V1` is the only conversation security mode. §183.1 and §194's DM clause are both scoped to "v0
DMs", meaning the server-visible mode, which no longer exists on any node. `docs/architecture/e2ee.md`
§6 already records this. `CLAUDE.md`'s hard-rules paragraph does not, and still states the
prohibition unconditionally. That is a live contradiction between the harness and the tree.

## Decision

### 1. What "properly shipped" concretely requires

Nine conditions. Each is a thing that is checkable by someone other than its author. `EXPERIMENTAL_CANARY`
requires S1–S8; `ENABLED` additionally requires S9. Nothing here is satisfied by a plan, an issue
being closed, or a passing suite that does not exercise the named path.

**S1 — the protocol completes a session over real RPCs.** ADR 0033 §7's definition of done, landed
as an integration test under `apps/server/test/`: two distinct enrolled devices walk
`EnrollDevice` → `GetIdentityRoot` → `GetDeviceRoster` → `ClaimPrekeyBundles` → `initiateX3dh` /
`respondX3dh` → `ratchetEncrypt` → `CreateE2eeConversation` (ADR 0035's reserve form) →
`SendEnvelopes` → `ListMailboxEnvelopes` → `openDeviceEnvelope`, and the recovered plaintext is
byte-identical to the sent plaintext with franking verification intact. Both directions. Plus one
case per: replay of the initial envelope, an envelope delivered to the wrong device's mailbox, and a
send after the peer rotated its roster.

**S2 — cross-client interop, at two levels.**

- _Byte level (mandatory, mechanical):_ the ADR 0033 §6 vectors under `packages/crypto/src/vectors/`
  are the single fixture, and `apps/tui`, `apps/web`, and `apps/server` each assert that their own
  enrollment/adaptation path reproduces the vector's bytes exactly for the vector's seed. Three
  copies of a fixture is not interop evidence; one file read three times is.
- _Live level:_ one recorded session between a device enrolled by `apps/tui`'s code path and a device
  enrolled by `apps/web`'s code path, against one node, message opened in both directions. Executing
  `apps/web`'s modules under Node with a stubbed storage adapter satisfies S2 for canary entry; a
  real browser run is required for S9, not for S8.

**S3 — prekey replenishment and signed-prekey rotation exist (#252).** Both clients call
`GetPrekeyInventory`, top up via `UploadPrekeys` to `E2EE_ONE_TIME_PREKEY_TARGET` when remaining
one-time prekeys reach `E2EE_ONE_TIME_PREKEY_REPLENISH_THRESHOLD`, persist private halves before
publishing public halves, and rotate the signed prekey on `E2EE_SIGNED_PREKEY_ROTATION_MS`. The
initiator handles `one_time_prekey_exhausted` explicitly rather than treating an absent one-time
prekey as normal. Test obligation: a case that drains a device's inventory past the threshold through
real claims and observes the top-up, and a case that asserts the exhausted-bundle path is surfaced,
not silently downgraded.

**S4 — franking re-checked against the ADR 0033 transcripts.** ADR 0025's binding and hiding
arguments were made by inspection over transcript bytes that no longer exist. Re-derive and record,
in ADR 0037 (§2 below), at minimum: that `T_c` and `AD_d` are unaffected (they bind conversation
metadata, not identity transcripts, so the expected answer is "unchanged" — but it must be _checked_,
not assumed); that the equivocation argument still reduces to a SHA-256 collision under the
regenerated vectors; and an explicit verdict on ADR 0033's own flagged trade — the prekey bundle
transcript no longer binds a roster digest, and roster membership is enforced by the verifier and by
the initiator's self-computed handshake binding instead. ADR 0033 asked a reviewer to check that
specifically; S4 is where that gets answered.

**S5 — a written threat model.** A new `docs/architecture/e2ee-threat-model.md`, in plain language, on
one page, stating what an operator of _this_ node — malicious, compromised, or legally compelled —
can and cannot do. It must assert at least:

_Can:_ see who messages whom, when, how often, and in what coarse size bucket; see device counts,
enrollment times, prekey-claim timing, mailbox-fetch timing, IP and request metadata; deny service;
withhold, delay, or reorder mailbox delivery; serve a substituted or stale device roster to a peer at
first contact (defeated only by out-of-band safety-number comparison, never by anything the node
says); forge its own franking node tag, so evidence is node-local and never transferable; read
exactly and only what a reporter chooses to disclose.

_Cannot:_ read message bodies; recover past bodies from a seized database or a backup; decrypt via an
account-password reset; add a device to a roster without the actor's messaging-root signature;
un-revoke a device; roll a roster back past a sequence a client has already verified without that
client noticing; obtain a client's ratchet or identity private keys from anything the node stores.

**S6 — each vault adapter reviewed on its own terms.** ADR 0020 §4: "A browser or React Native
integration is not approved merely because the primitives compile there." `apps/web/src/e2ee/vault.ts`
already documents four browser-specific weakenings in its own header, including that it "does NOT
defend against anything with this origin's localStorage (notably XSS)". S6 is the review reaching a
verdict on each adapter and each named weakening, and the surviving ones appearing in user-facing
copy (§4.3) rather than only in a source comment.

**S7 — no-plaintext-egress assertions still hold post-ADR-0033/0035.**
`apps/server/test/e2ee-privacy-scan.integration.test.ts` re-run and extended over the new wire shape:
no body, key, opening, or ratchet byte in logs, metrics, traces, error payloads, outbox rows,
notifications, backups, or any admin surface.

**S8 — the capability model, the copy, and the docs are in their shipped shape** (§3 and §4 below),
landed and green, _before_ the review reads the tree. The review must read the code that will ship,
not a predecessor.

**S9 — canary exit, for `ENABLED` only.** All of: at least 14 days at `EXPERIMENTAL_CANARY`; at least
two actors with two or more enrolled devices each; one real-browser cross-client session recorded;
one report walked end to end (`ReportE2eeMessage` → `AttachReportEvidence` → verified evidence) with
the moderator disclosure rendered; zero unexplained `UNVERIFIABLE` opens or "could not be verified"
placeholders in the period; and #212 (the TUI passphrase-KDF vault tier, an open ADR 0020 §4
obligation) landed, so a machine without an OS keyring is not silently on the weaker guarded-file
tier.

### 2. Who discharges ADR 0020 §12's review gate, and how

#### 2.1 What an in-repo review by a strong model is

It is a real review. ADR 0024 is the proof: one internal reviewer found a protocol-level repudiation
hole — sender-chosen commitment, uncovered by the fanout digest, unverified by any recipient — that
had survived design, implementation, and a passing test suite whose happy path demonstrated the bug.
That is not a rubber stamp; it is better coverage of implementation-level defects than most paid
engagements deliver, and it is available on demand.

It is also, honestly, **not independent**. It shares the project's context, its vocabulary, its
assumptions, and its blind spots. It is not accountable to anyone. It cannot certify that it did not
miss the class of thing it is bad at, and it cannot be reproduced by a third party. When the same
harness that wrote the code reviews it, "adversarial" is a word, not a property. And it decays
silently: the 2026-08 audit is already void because ADR 0033 rewrote the bytes it read, and nothing
in the repo noticed.

#### 2.2 The bar: an adversarial multi-agent security review, specified

For a self-hosted pre-alpha with six actors, this is the realistic bar and it is a genuine one. It is
sufficient to make the word "unreviewed" false. It is **not** sufficient to make "independently
audited" true, and §4's canary copy says so in as many words.

**Composition.** At least three reviewers of the strongest available capability class, run
**independently** — no shared context, no visibility of each other's findings until all three have
reported. At least one gets an explicitly adversarial brief: _produce a working attack, not a list of
concerns; a finding without an attempted exploit is a note, not a finding._ None may be the agent
that authored the code under review. The review is re-run **from scratch**, not incrementally, if the
transcript bytes or the franking construction change — that is the ADR 0033 lesson made procedural.

**Scope, enumerated.** Each item gets an explicit verdict. "Not examined" is a permitted answer and
it blocks the gate for that item.

1. The ADR 0033 identity transcripts: prefix/tag injectivity, cross-type confusion, decoder
   strictness against every negative vector, the dropped T4 roster binding and its compensating
   verifier check, and whether the branded `Verified*` types have a constructible escape hatch.
2. X3DH with the certificate chain: transcript binding, low-order X25519 inputs, replay of the
   initial message, the no-one-time-prekey fallback, `one_time_prekey_exhausted` handling.
3. Double Ratchet rev-4 header encryption: skipped-key bounds and DoS, out-of-order and
   simultaneous-initiation convergence, and key/nonce non-reuse across crash, rollback, and
   duplicate-owner scenarios **on each vault adapter separately**.
4. Franking: S4's re-derivation; the 32-byte-opening anti-GLR invariant and whether anything can
   relax it; equivocation across devices; node-tag forgeability and therefore what evidence _is_.
5. Every server call site: fanout atomicity and digest checks, roster and revocation races, epoch
   staleness, authorization on every E2EE RPC — explicitly including B-054 (`attachReportEvidence`
   performs no conversation-membership check) and B-053 (`ciphertext_digest` is sender-asserted and
   never recomputed), both still open and both named in ADR 0025's "what this does not solve".
6. Both vault adapters against ADR 0020 §4, naming what each does not defend against.
7. No-plaintext egress (S7), read adversarially rather than by re-running the suite.
8. Supply chain: noble release provenance, lockfile integrity, and the transitive dependency set of
   every module on the crypto path.
9. The copy in §4: does every sentence a user is shown hold under items 1–8?

**Evidence it must produce.** One ADR, **0037, "E2EE adversarial security review"**, containing: the
reviewer roster and each one's brief; the **exact commit SHA** reviewed; a per-scope-item verdict;
every finding with severity and `file:line`; for each critical/high, the remediating commit and the
re-review verdict _on that commit_; and, for every scope item, at least one attempted attack written
up with what was tried and why it failed. A "no findings" item with no attempted attack does not
count as reviewed.

**Zero unremediated critical or high findings.** Mediums may be accepted with a written rationale in
ADR 0037 and a filed issue.

**The review must not decay silently.** ADR 0037 records the reviewed SHA, and this rule binds from
the day it lands: any diff to `packages/crypto/src/**`, `packages/domain/src/e2ee/**`,
`apps/server/src/modules/e2ee/**`, `apps/tui/src/e2ee/**`, or `apps/web/src/e2ee/**` after that SHA
either (a) carries a re-review note appended to ADR 0037, or (b) returns the node to
`ISOLATED_TEST_ONLY` until one exists. The 2026-08 audit went stale because nothing said this.

#### 2.3 Where this is weaker than ADR 0020 §12.9, stated plainly

§12.9 requires "a threat model and independent security audit… all critical/high findings fixed and
reviewed", and §12.7 requires independent _external_ cryptographic review of the franking
construction. A third-party audit of a solo, unfunded, self-hosted node is not obtainable. Requiring
it means the gate never opens, the code never runs, nobody ever finds the next defect, and the
project's security posture becomes "nothing ships" — which is not actually a security posture.

**This ADR therefore substitutes §2.2's adversarial review for §12.7's and §12.9's third-party
requirement, under a ceiling, and the original requirement reactivates the moment the ceiling is
crossed.** The ceiling: the node stays invite-only (`INVITE_ONLY=true`), stays under **50 actors with
an enrolled E2EE device**, and never advertises itself to outsiders as a service to rely on for
confidentiality. Crossing any of those, or introducing a new franking profile string, or federating
DMs (already prohibited by ADR 0020 §13), reactivates §12.7/§12.9 in full and returns the node to
`EXPERIMENTAL_CANARY` until a third-party audit exists.

This is the one place this ADR trades down from ADR 0020, it is a deliberate deviation from a §153
ship gate, and per `CLAUDE.md` it needs the owner's explicit sign-off before §7 step 9 runs. It is
called out here rather than buried so the owner can veto it knowingly.

### 3. The capability-state model

#### 3.1 States

Four survive. `E2EE_CAPABILITY_STATE_EXTERNAL_REVIEW_PENDING` (`e2ee.proto:163`, value 3) is
**removed and reserved** — value and name, never reused (§153). ADR 0027 already forbade any node
from reporting it, and it describes a condition — implementation complete, review not finished — that
is indistinguishable in every user-visible respect from an isolated test node. A ladder rung no node
may stand on is a rung that misleads a reader about how many gates exist.

| State                 | What it asserts                                                                                                                                                                  | Required notice                                                                   |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `DISABLED`            | This node offers no DM function at all. Since ADR 0030 there is no plaintext fallback.                                                                                           | `E2EE_CAPABILITY_NOTICE.DISABLED` (§4.2)                                          |
| `ISOLATED_TEST_ONLY`  | The E2EE path runs, and the franking profile is permitted by an owner-set bypass rather than by review. Disposable data, no real users.                                          | `E2EE_CAPABILITY_NOTICE.ISOLATED_TEST_ONLY` (§4.2) — unchanged from ADR 0027      |
| `EXPERIMENTAL_CANARY` | S1–S8 pass, ADR 0037 exists with zero unremediated critical/high, the reviewed profile is in the domain approval constant. Reviewed in-project; not audited by an outside party. | `E2EE_CAPABILITY_NOTICE.EXPERIMENTAL_CANARY` (§4.2)                               |
| `ENABLED`             | S9 additionally passes. This is the shipped state.                                                                                                                               | none — `''`; the standing disclosures of §4.3 carry everything that is still true |

`ISOLATED_TEST_ONLY` is deliberately **kept**, against the temptation to delete it along with the
banner. A future protocol change — a `patches-franking-v2`, a PQXDH profile, a v2 transcript family —
needs an honest state to run in, and the alternative to keeping it is a future change either shipping
unreviewed under `ENABLED` or not being testable at all.

#### 3.2 The state is disclosure; enforcement is one pre-write gate

Recorded so no future reader infers four enforcement tiers from four states. The only thing that
decides whether a send is accepted is `E2eeRuntimeApprovalPolicy.assertProfileApproved`, called before
dedup lookup and before any write. The capability state is derived from the same policy instance, so
it cannot describe a posture the accept path does not have — but it does not itself gate anything.

`assertConversationModeNegotiation`'s `isolatedTestNode` branch and the `E2eeModeNegotiation.isolatedTestNode`
field are deleted: the function has no production caller, and a rule that nothing runs is not a rule.
Its participant-protocol check moves to `assertDeviceSupportsProtocol`, which does have callers.

#### 3.3 The approval list stops being movable from the environment

This is the fix for the finding above. Three changes, all in the server:

1. `packages/domain`'s `E2EE_APPROVED_FRANKING_PROFILES` becomes the **sole production authority**
   again, as ADR 0020 §14.8 has always claimed.
2. `E2EE_APPROVED_FRANKING_PROFILES` (env) may only **narrow**, never widen.
   `E2eeRuntimeApprovalPolicy.isProfileApproved(p)` returns true iff
   `E2EE_APPROVED_FRANKING_PROFILES` (domain constant) includes `p` **and** (the env list is empty
   **or** the env list includes `p`). The env var becomes an operator kill-switch and subset
   selector — useful for disabling a profile fast without a code change, incapable of enabling one.
3. `E2EE_UNREVIEWED_DEV_MODE` remains the **only** widening mechanism, and it is exactly the bit the
   `ISOLATED_TEST_ONLY` banner discloses. The banner and the bypass become one bit: the warning cannot
   be removed while the bypass is live, and the bypass cannot be live without the warning. Additionally,
   `E2EE_UNREVIEWED_DEV_MODE=true` together with `E2EE_V1_ENABLED=true` is a **boot failure**, not a
   precedence rule — an unreviewed node must not be able to reach a state that describes a reviewed
   one, even transiently, even by misconfiguration.

`infra/scripts/e2ee-lab.sh`'s header currently documents the two-line prod flip through the env
approval list. It must be rewritten to the §7 sequence; a runbook that describes the bypass as the
rollout path is how the bypass gets used.

#### 3.4 How this node reaches the shipped state

| Setting                                                                 | Today                | At `EXPERIMENTAL_CANARY`                 | At `ENABLED`                   |
| ----------------------------------------------------------------------- | -------------------- | ---------------------------------------- | ------------------------------ |
| `E2EE_UNREVIEWED_DEV_MODE` (`fly.toml:26`)                              | `"true"`             | **line deleted** (default `false`)       | absent                         |
| `E2EE_APPROVED_FRANKING_PROFILES` (env)                                 | unset                | unset                                    | unset                          |
| `E2EE_APPROVED_FRANKING_PROFILES` (`packages/domain/src/e2ee/modes.ts`) | `Object.freeze([])`  | `Object.freeze(['patches-franking-v1'])` | unchanged                      |
| `E2EE_V1_ENABLED`                                                       | unset (`false`)      | unset (`false`)                          | `"true"` in `fly.toml` `[env]` |
| Reported state                                                          | `ISOLATED_TEST_ONLY` | `EXPERIMENTAL_CANARY`                    | `ENABLED`                      |

The domain-constant edit is a code change that lands **in the same commit as ADR 0037** and cites its
reviewed SHA in the constant's doc comment. The two `fly.toml` edits are the owner's, as node
operator: an agent may prepare the commit, the owner merges and deploys. `E2EE_UNREVIEWED_DEV_MODE`
itself is **not deleted** — ADR 0027's removal condition is amended accordingly, because §3.1 keeps
the state it serves.

#### 3.5 ADR 0030's disposability sunsets for E2EE data at canary

ADR 0030 makes persistence disposable "until the app is genuinely in production", triggering on the
first real external registration. E2EE needs a sharper line, because a transcript change after a real
user has readable history is a different event from one before. **Reaching `EXPERIMENTAL_CANARY` is
the sunset trigger for every `e2ee_*` table and for `conversations`.** From that point a transcript,
profile, or envelope-format change requires either a real migration or an explicit, announced,
user-visible reset — never a silent `DELETE` in FK order the way ADR 0033 §5 correctly does _today_.

### 4. Copy in the shipped state

#### 4.1 §183.1 does not bind, and `CLAUDE.md` must say so

§183.1 ("v0 DMs are not end-to-end encrypted. The node can read them.") and §194's clause forbidding
the words _encrypted / end-to-end / secure / private_ are both scoped to v0 server-visible DMs. ADR
0030 §B-095 deleted that mode; the enum value and name are reserved and no row can carry it. The
prohibition is therefore **spent, not repealed** — it still forbids calling a server-visible DM
encrypted, and Patches no longer has one. `mayDescribeAsEndToEndEncrypted('E2EE_V1') === true` already
encodes this, and `docs/architecture/e2ee.md` §6 already records it.

`CLAUDE.md`'s hard-rules paragraph still states it unconditionally: _"v0 DMs are **server-visible** and
every client must say so — never call them encrypted/secure/private (§183.1)"_. **This ADR amends that
hard rule.** Replacement text, exact:

> DMs are `E2EE_V1`-only (ADR 0030 §B-095 deleted `LEGACY_SERVER_VISIBLE`); §183.1's server-visible
> disclosure is spent. A client may say "end-to-end encrypted" **only** via
> `mayDescribeAsEndToEndEncrypted` / `requiredConversationDisclosure`, never with a "mostly", "soon",
> or "effectively" qualifier, and never shortened to "private"; the §4.3 standing disclosures (ADR 0036) are mandatory in every state that offers DMs; no DM bodies in logs/metrics/errors.

Issue #198 ("Reconcile INITIAL_VISION.md with ADR 0030 E2EE changes") is the spec-side half and should
cite this section.

#### 4.2 State notices

`E2EE_UNREVIEWED_DEV_MODE_WARNING` is replaced by a state-keyed lookup in
`packages/domain/src/e2ee/modes.ts`, so a client renders a notice for the state the node actually
reports rather than for a boolean it inferred. Exact strings, verbatim:

```ts
export const E2EE_CAPABILITY_NOTICE = Object.freeze({
  DISABLED: 'Direct messages are not available on this node.',
  ISOLATED_TEST_ONLY:
    'Unreviewed development E2EE — for testing only; do not use for sensitive conversations.',
  EXPERIMENTAL_CANARY:
    'Experimental end-to-end encryption. This node reviewed it in-project; no outside party has audited it.',
  ENABLED: '',
} as const);
```

The `ISOLATED_TEST_ONLY` string is ADR 0027's, unchanged, because it is still exactly true when it
shows. Where a notice is non-empty it is persistent at conversation creation and at reading, as ADR
0027 required — not a tooltip, not a settings footnote. `ENABLED` renders nothing: in the shipped
state there is no banner-worthy caveat left, and everything still true lives in §4.3.

#### 4.3 Standing disclosures — mandatory in `EXPERIMENTAL_CANARY` and `ENABLED` alike

This is the half that must **not** be deleted along with the banner. `requiredConversationDisclosure('E2EE_V1')`
keeps its current text verbatim and stays on the messages screen:

> `'End-to-end encrypted. This node cannot read these messages, but it can see who you message and when.'`

Alongside it, a new `E2EE_STANDING_DISCLOSURES` in `packages/domain/src/e2ee/modes.ts` — one screen
away, reachable from the disclosure line by a labelled affordance in every client including the TUI
(no browser, no QR scanner, per ADR 0020 §3). Exact strings, verbatim:

```ts
export const E2EE_STANDING_DISCLOSURES = Object.freeze({
  metadata:
    'This node cannot read your messages. It can see who you message, when, how often, and roughly how large each message is.',
  reporting:
    'If you report a message, you choose exactly what plaintext to disclose, and this node can then read what you disclosed. The receipt this node attaches is proof to this node only — it is not proof to anyone else, and this node could produce one itself.',
  deviceTrust:
    'Patches shows you which devices belong to a contact, but this node serves that list. Compare safety numbers with your contact over another channel to be sure no device was substituted.',
  loss: 'If you lose every device and your recovery key, your message history is gone. Nobody can restore it.',
  browserKeys:
    "In a browser, your keys are protected by this site's storage. Anything that can run script on this site can reach them. The terminal client stores them in your operating system's keychain instead.",
} as const);
```

`browserKeys` renders in `apps/web` only, and only while `apps/web/src/e2ee/vault.ts`'s localStorage
wrapping tier is what ships. It is the user-facing form of a weakness that currently lives only in a
source comment. If S6's review concludes the tier is unacceptable, the web client does not enter
canary; it does not get to enter with the disclosure suppressed.

Every string above is a fact that remains true in the shipped state. **A caveat that stops being true
gets deleted; a disclosure that stays true gets kept, in the shipped state, permanently.** That
distinction is the whole content of this ADR.

## Consequences

**Positive.** There is now a finite, checkable list between the current state and a shipped one, so
"when does the banner come down" has an answer that is not a judgement call. The banner and the
franking bypass become one bit, so the dishonest intermediate state — bypass live, warning gone — is
unrepresentable rather than merely discouraged. The env-var escalation path that could have moved the
reference node to `ENABLED` in two `[env]` lines is closed, and the approval constant becomes what
three ADRs already said it was. The review gains an anti-decay rule, so the next ADR-0033-shaped
change cannot silently void it the way the 2026-08 audit was voided. `ENABLED` renders no banner at
all, which is what the owner asked for, and it arrives with the true disclosures intact, which is what
the owner asked for in the same sentence.

**Negative.** Nothing flips today. The reference node keeps showing the `ISOLATED_TEST_ONLY` warning
through roughly ten ordered steps, and this ADR makes that duration explicit rather than shortening
it. §2.3 is a real weakening of ADR 0020 §12.7/§12.9 — an in-project review is not an external audit,
the substitution is bounded by a ceiling the node could plausibly cross, and if the owner declines to
sign it, the ladder stops at `EXPERIMENTAL_CANARY` indefinitely. `browserKeys` tells users something
about the web client that is unflattering and true, and it will look worse next to the "end-to-end
encrypted" line than a silent source comment does. Removing `EXTERNAL_REVIEW_PENDING` burns an enum
value permanently for a state nobody ever used. And the anti-decay rule imposes a real ongoing tax:
every future touch of five directories has to either carry a re-review note or knock the node back a
state.

**Sequencing.** §7 below is the order. Two items are worth pulling out because they are cheap and
independent of everything else: the §3.3 approval-list fix should land **now**, at
`ISOLATED_TEST_ONLY`, because it closes a live escalation path and does not depend on any of S1–S9;
and `packages/domain/src/e2ee/modes.ts:2` still lists `'LEGACY_SERVER_VISIBLE'` in
`CONVERSATION_SECURITY_MODES`, a leftover ADR 0030 §B-095 should have removed, which should go with
the §3.2 edit to the same file.

## 7. The order

1. Epic #250 stages 3–6: server codec adopts `@patches/crypto`'s codec, the ADR 0033 §5 migration
   lands, both `node-transcripts.ts` mirrors are deleted, ADR 0035's reserve-then-send wire change
   lands, `apps/web` is enabled with the ADR 0027 warning (#249, #165, #166, #175, #233, #238). Node
   stays `ISOLATED_TEST_ONLY`; the banner stays; every caveat remains true.
2. §3.3's approval-list fix, plus the §3.2 and §3.1 mechanical edits and the §4 copy constants. Lands
   at `ISOLATED_TEST_ONLY`. This is S8.
3. Epic #250 stage 7 = **S1**.
4. #252 (**S3**), #251, #212, and B-053/B-054 remediation.
5. **S2** byte-level and Node-hosted live interop.
6. **S5** threat model; **S7** privacy-scan extension; **S4**'s inputs prepared.
7. Freeze the five E2EE directories to bugfix-only.
8. **S7 (the review)** per §2.2 → ADR 0037, remediation, re-review on the remediating commits.
9. _Owner sign-off on §2.3._ Then: add `patches-franking-v1` to the domain constant citing ADR 0037's
   SHA, delete `fly.toml:26`, deploy. Node reports `EXPERIMENTAL_CANARY`; ADR 0030 disposability
   sunsets for E2EE data (§3.5).
10. **S9** canary exit.
11. Set `E2EE_V1_ENABLED = "true"` in `fly.toml` `[env]`, deploy. Node reports `ENABLED`. No banner.
    §4.3 disclosures remain, permanently.

## Alternatives considered

**Delete `E2EE_UNREVIEWED_DEV_MODE`, the banner, and the approval gate now, and call E2EE shipped.**
This is the literal reading of the owner's message and it is rejected on the owner's own stated
grounds. The banner is currently _accurate_: no two devices have ever completed a handshake, the
franking construction has been reviewed only by its own authors, the transcripts the 2026-08 audit
read no longer exist, and neither client replenishes prekeys. Removing the sentence would not change
any of that; it would only remove the reader's ability to know it. "Half baked work presented as
finished" is precisely what that produces.

**Keep ADR 0020 §12.9 literally and wait for a third-party audit.** Rejected: unobtainable for a
solo unfunded node, so it is not a gate but a permanent stop. A permanently unshipped implementation
gets no operational exposure, no real-world bug reports, and no maintenance pressure; it rots, and
the rot is invisible because nothing runs. §2.3's ceilinged substitution is the smallest change that
lets the gate open at all while reactivating the original the moment the stakes rise.

**Accept a single strong in-repo reviewer, as with ADR 0024.** Rejected as the _gate_ standard, though
ADR 0024 shows the value. One reviewer, sharing the project's context, cannot cover nine scope areas
adversarially, and has no way to distinguish "checked and sound" from "did not think to look". Three
independent reviewers with one explicitly adversarial brief and a mandatory attempted-attack-per-item
requirement is the cheapest structure that produces evidence rather than reassurance.

**Collapse to two states, `DISABLED` and `ENABLED`, and drop the ladder entirely.** Attractive, and
rejected because it removes the only honest home for future unreviewed protocol work. A
`patches-franking-v2` would then have to run either as `ENABLED` (a lie) or nowhere (untestable). The
correction actually needed was removing the rung no node may stand on (`EXTERNAL_REVIEW_PENDING`), not
flattening the ladder.

**Leave `E2EE_APPROVED_FRANKING_PROFILES` (env) able to widen, and rely on the ADRs' prose.** Rejected:
three ADRs and an architecture doc already assert the constant is unmovable without an ADR, and the
env var has quietly made that false since it was added. A control every document describes and no code
enforces is worse than no control, because it consumes the reviewer attention a real control would
have received.

**Make the capability state a real pre-write gate rather than disclosure, by wiring
`assertConversationModeNegotiation` into the accept path.** Rejected as scope this ADR should not
create: it duplicates the profile-approval decision at a second point, and ADR 0027 was explicit that
create/send/replay must share **one** pre-write gate. Deleting the dead branch (§3.2) and saying
plainly that the state is disclosure is the honest resolution; two gates that must agree is how they
come to disagree.

**Ship `ENABLED` with no standing disclosures at all, since the banner is gone.** Rejected: this is
the failure mode the owner's message is aimed at, inverted. Routing metadata, reporter disclosure,
node-forgeable receipts, server-served device lists, irrecoverable loss, and the browser key tier are
all still true at `ENABLED`. A caveat that becomes false gets deleted; a disclosure that stays true
gets kept.

**Suppress `browserKeys` and let the web client ship on parity claims with the TUI.** Rejected under
ADR 0020 §4, which requires each client's vault adapter to be reviewed rather than assumed, and
because the weakness is already written down in `apps/web/src/e2ee/vault.ts`'s own header — a project
that documents a limitation to itself and hides it from users has chosen which audience it is honest
with.
