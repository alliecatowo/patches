# 0043. E2EE group membership is verified by the client against the signed transcript

**Status:** Accepted
**Date:** 2026-10-03
**Relates to:** [0020](./0020-e2ee-direct-messages.md) §7; audit finding P2-H3 (release audit 2026-10-02)

## Context

ADR 0020 §7 says root/device-certified group control events establish the membership, and the
transcript header says the node cannot rewrite it. Clients nevertheless took the member list and
device ids straight from `GetE2eeConversationState`; the signed events were only displayed. A node
or database operator that inserted a `conversation_members` row got every later message encrypted
to the accomplice. The client display verifier also did not check that the served `subject`,
`change` and `epoch` match the signed bytes, did not check the chain, and did not check that the
signer was a member.

## Decision

1. Each device pins, per conversation, the last membership it verified: epoch, member set and the
   digest of the newest event (`membership.ts`, one opaque vault record).
2. Before every send the served state is checked: the epoch may not go backwards; at the same epoch
   the member set and `group_control_digest` must equal the pin; at a higher epoch the events in
   between must chain from the pinned tip, match their signed bytes, be signed by the certified
   key of an active device of a current member, and apply legally, and the derived set and tip
   must equal the served ones. Then the pin advances. The derivation is `deriveGroupMembership` in
   `@patches/domain`.
3. A mismatch throws `MembershipMismatchError` and nothing is encrypted. A failed fetch is not
   reported as a mismatch. The user may explicitly accept the node's current list; never automatic.
4. Epoch 1 has no signed event, so the first membership a device sees is trust on first use.
5. The display verifier now also checks fields against bytes and the chain.

## Consequences

- A signer whose device was later revoked cannot be verified, so a conversation with such an
  event needs the explicit accept. Accepted trade-off; the alternative is trusting unverifiable keys.
- No wire change.
