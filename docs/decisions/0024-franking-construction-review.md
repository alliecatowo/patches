# ADR 0024 — Franking construction review (P13-016): rejected, do not enable

- **Status:** accepted (as a review verdict); the construction it reviews is **rejected**
- **Date:** 2026-08-20
- **Reviewer:** one internal reviewer (Claude Opus 5), reading the code and running the existing suites
- **Blocks:** P13-014 (production enablement of `E2EE_V1`)
- **Amends:** ADR 0020 §9, which explicitly left this construction undecided pending this review

## What this review is and is not

This is **one internal reviewer reading the code**. It is not the independent external
cryptographic review ADR 0020 §12.7 requires, and it does not discharge that gate. It did not
attempt cryptanalysis of HMAC-SHA256 — where it says "no attack found", that means "no attack
found by inspection", which is not a proof.

## Verdict

**Not acceptable. Do not enable. The blockers below need architect input, not an implementer.**

The HMAC-vs-committing-AEAD question the task posed turns out to be the _least_ of the problems.
The narrow question — is `HMAC-SHA256(32-byte opening, domain-separated(plaintext))` binding? — has
a defensible answer (contingently yes, because `requireKeyBytes` blocks the Grubbs/Lu/Ristenpart
key-length attack). But the franking guarantee ADR 0020 §9 claims is broken at the **protocol**
level, before any cryptography is reached.

`franking_commitment` is chosen entirely by the sender. The node length-checks it and does nothing
else (`apps/server/src/modules/e2ee/e2ee-fanout.ts:339`). It is not covered by `fanout_digest`, it
is not associated data for any device envelope, and **no code anywhere in the repo verifies a
commitment on the receiving side** — `verifyFrankingCommitment` has no caller in `apps/tui`,
`apps/web`, or `apps/admin`.

So a malicious sender repudiates any message deterministically, at zero cost, with no cryptography
involved: encrypt the abusive plaintext honestly to every recipient device (all fanout, roster and
epoch checks pass), and set `franking_commitment` to 32 random bytes. The honest recipient's genuine
report comes back `COMMITMENT_MISMATCH` / `UNVERIFIABLE` — indistinguishable from a fabricated one.

The codebase already says this, in its own words. `packages/domain/src/e2ee/franking.ts:39-43`
documents the contract `FrankingVerifier.verifyCommitment` must satisfy:

> `verifyCommitment` MUST be the _binding_ check of a committing AEAD… **An implementation that
> merely re-derived a MAC over the plaintext with the opening as the key would accept a second
> plaintext for the same commitment, which is precisely the attack franking exists to stop.**

`apps/server/src/modules/e2ee/report-evidence.ts:131` is that implementation, verbatim.

The existing integration test demonstrates the gap as its happy path:
`apps/server/test/e2ee.integration.test.ts:77` sends
`frankingCommitment: Buffer.from(sha256Hash(randomBytes(16)))` — a commitment unrelated to any
plaintext — and the send succeeds and is franked.

## The three questions P13-016 asked

### 1. Is `encodeReportTranscript` injective?

**Yes** — but the guarantee lives at the call sites, exactly as the task suspected.

`ByteWriter.fixed()` (`packages/crypto/src/codec.ts:36-38`) performs no length check and writes no
length prefix; it is a raw append. `encodeReportTranscript`
(`packages/crypto/src/franking.ts:94-133`) is injective only because all three of its `fixed()`
call sites are guarded by `requireKeyBytes` inside the function itself, and every variable-width
field goes through `string()` → `bytes()` → `u32(len) || bytes`.

The hazard is live in a **sibling** transcript that the task did not name.
`encodePrekeyBundleTranscript` (`apps/server/src/modules/e2ee/e2ee.codec.ts:214-230`) writes three
`fixed()` fields with zero validation in the encoder. It is injective today only because its three
callers read from columns carrying `octet_length(...) = 32` CHECK constraints. That is a **signed**
transcript whose canonicalization depends on a database constraint two layers away. Filed as B-051.

### 2. Can one commitment open to two plaintexts?

**The primitive: contingently no — for an undocumented reason.** The classic GLR attack on
Facebook's HMAC franking exploits RFC 2104 key reduction (`HMAC(K, M) == HMAC(SHA256(K), M)` for
`|K| > 64`). It is blocked by `requireKeyBytes` at `franking.ts:47`/`:60-61`, which force exactly
32 bytes on both sides. **That four-word length check is the entire binding defense, and its doc
comment presents it as ordinary input validation.** A future contributor widening it to accept a
64-byte opening — a perfectly reasonable-looking change — silently reintroduces the attack.

**The protocol: no, it is not binding at all**, for the reasons in the verdict above. There is also
a cheaper equivocation variant: the commitment is per-logical-message but each device gets its own
independently chosen `opening_ciphertext` and `ciphertext`, so a sender can send `P₁` to device A
and `P₂` to device B, with at most one able to produce a verifying report. The
single-commitment-per-message invariant is asserted in a doc comment
(`packages/domain/src/e2ee/envelopes.ts:57`) and enforced nowhere.

### 3. Domain separation

`COMMITMENT_CONTEXT` and `REPORT_CONTEXT` **cannot collide**. Both are written via `string()`, so
each input begins with a distinct `u32` length (36 vs 30) followed by distinct bytes — prefix-free.
Their key populations are disjoint (sender-generated per-message opening vs node-held per-era
secret), and no path passes one where the other is expected.

Every HMAC construction in the tree was enumerated: `primitives.ts:75` (the primitive),
`franking.ts:48` and `:146` (the two above), `double-ratchet.ts:117`/`:118` (chain keys, separated
by input shape — a single byte — rather than by a domain string, which is sound but implicit), and
`report-evidence.ts:143`. Non-HMAC domain constants checked: `x3dh.ts:33-34`,
`double-ratchet.ts:42-45`, `identity.ts:19-22`, `envelopes.ts:29`, `e2ee.codec.ts`'s
`PREKEY_BUNDLE_TRANSCRIPT_DOMAIN`, plus `patches-ssh-enroll-v1` and `ACTIVITYSTREAMS_CONTEXT`
outside e2ee.

Two defects fall out. `report-evidence.ts:143` calls raw `hmacSha256` under the node's long-term
franking key over untyped `Bytes`, bypassing `verifyNodeReportTag` — an unseparated equality oracle
in an exported function whose interface makes no claim about the transcript's provenance (B-050).
And `franking_profile` is bound into **neither** the commitment nor the report transcript, so it is
unauthenticated data that `verifyReportEvidence` nonetheless branches on, and a future
`patches-franking-v2` with a similar layout would be cross-acceptable with v1 (B-052). The only
"algorithm" string in the commitment is `E2EE_ALGORITHM`, which names the _ratchet suite_ — it
changes for reasons unrelated to franking and will not change when franking changes. It is the
wrong agility knob.

## What construction would be acceptable

In order of preference:

1. **A committing AEAD over the ciphertext** (CTX, or GLR's `CtE2`/`HFC`). Derive the franking tag
   from the AEAD key and ciphertext, so the commitment is a function of _what was actually sent_
   rather than a free-floating sender-chosen value. This closes the whole class in one move: there
   is no separate value left for the sender to lie about. This is what ADR 0020 §9 gestures at and
   what this review recommends.
2. **Failing that, three changes to the current shape, all required together:** bind
   `franking_commitment` into every device envelope's AEAD associated data; add it (and
   `opening_ciphertext`) to `canonicalFanoutTranscript`; and make recipient-side verification
   mandatory and specified. Without the third, the first two are decoration.

Either way the node's symmetric report tag is fine as-is — §9's deniability reasoning is sound and
`createNodeReportTag` implements it correctly.

## Findings

**Blocker** — B-045, B-046, B-047 (see `tasks.md`): the MAC-as-commitment implementation; the
unbound sender-chosen commitment; and the entirely absent recipient-side verification.

**Major** — B-050 (raw HMAC bypassing `verifyNodeReportTag`), B-051
(`encodePrekeyBundleTranscript`'s unvalidated `fixed()` fields), B-052 (`franking_profile` not
bound), B-053 (`franking.ts:67-68`'s claim that post-acceptance ciphertext tampering invalidates
the tag is **false** — `ciphertext_digest` is sender-asserted and never recomputed), B-054
(`attachReportEvidence` performs no conversation-membership check, which ADR 0020 §9 requires).

**Minor** — B-055 (`ByteWriter.fixed()` should take a required expected width, and `requireKeyBytes`
should be commented as the load-bearing anti-GLR invariant), B-056 (`TRANSCRIPT_MISMATCH` is in the
closed failure-code set but assigned by no code path), B-057 (`E2eeFrankingTagView.transcriptDigest`
carries the full transcript on one path and a 32-byte digest on the other).

**Suppressions audit:** clean. No `any`, `@ts-ignore`, `eslint-disable`, or unjustified empty
`catch {}` in any file read. The two bare `catch` blocks in `report-evidence.ts` each carry a
justification and are correct fail-closed behaviour.

## The gate stays closed

`E2EE_APPROVED_FRANKING_PROFILES` remains `Object.freeze([])` and `assertFrankingProfileApproved`
still throws unconditionally. That is currently the only thing standing between this construction
and production, and it is doing real work. Nothing may open it until B-045, B-046 and B-047 are
closed and an independent external review has run.
