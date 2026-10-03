# 0042. E2EE session recovery: per-handshake sessions, deterministic glare, explicit reset

**Status:** Accepted
**Date:** 2026-10-03
**Relates to:** [0020](./0020-e2ee-direct-messages.md) §5, §8, [0034](./0034-shared-client-e2ee-runtime.md);
audit finding P2-H1 (release audit 2026-10-02)

## Context

One vault session existed per (conversation, peer actor, peer device), and the id is symmetric. Two
ordinary situations left a pair permanently unable to read each other, with every failure shown as
"unverifiable" and acknowledged (so dropped):

- **Glare.** Both sides send first. Each holds an initiator session, opens the other's initial
  envelope against it, fails authentication, and every later message fails the same way.
- **Lost first-send response.** The node stored the first message but the response timed out. The
  sender deleted its new session and ran a fresh X3DH next time; the responder, which had committed
  the first session, took the new initial envelope for a redelivery of the old one.

## Decision

1. **A handshake has an id**: SHA-256 of the exact setup prefix an initial envelope carries. Each
   handshake gets its own vault session (`<base>#<id>`); a pair may hold up to four. The index
   (`session-index.ts`, one opaque vault record) records the sender, each entry's role and whether
   an initiator was answered, and a bounded seen-set (64) of handshake ids.
2. **An initiator session is never deleted on a failed send.** While the peer has not answered in
   it, every envelope carries the setup block, so a retry after an ambiguous failure resends under
   the same handshake. The first reply that opens in it confirms it.
3. **Glare is settled deterministically.** When an initial envelope arrives for an unseen
   handshake and our primary is an unanswered initiator, the lower (actor id, device id) in UTF-8
   byte order keeps its own initiator session as the sender; the other adopts the winner's. The
   loser's extra session is kept to open the other side's still-setup-bearing messages. In every
   other case (a peer that restarted) the newest handshake becomes the sender.
4. **A fresh responder session is built speculatively** and committed only if the first message
   authenticates, so a forged or mismatched initial envelope never disturbs a live session.
5. **A retired handshake never rebuilds a session.** An initial envelope whose id is in the seen-set
   but no longer held is dropped as a replay. This matters most for handshakes without a one-time
   prekey, which can be re-derived indefinitely.
6. **Explicit reset.** "Reset secure session" drops the conversation's sessions (keeping the
   seen-set) so the next send runs a fresh X3DH that the peer adopts. History is untouched.
7. Sessions from before the index (stored at the bare base id) are adopted as a confirmed `legacy`
   entry the first time the pair is touched. Send, drain and reset run under one operation lock per
   runtime, which also closes the in-runtime part of P2-M1.

## Consequences

- No wire change; web and TUI interoperate with older peers, which see ordinary initial envelopes.
- An unanswered initiator repeats the setup block (about 300 bytes) on every message.
- A renewal or any device-id change clears the index with the sessions (ADR 0041).
- Not done: resending the same sealed envelopes under the same client request id. The staged state
  is adopted, so a retried message is a new message; the node cannot dedupe it.
