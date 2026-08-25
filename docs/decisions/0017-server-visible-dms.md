# 0017. Direct messages are server-visible in v0, not end-to-end encrypted

**Status:** Superseded by 0030
**Date:** 2026-08-18

## Context

Amendment B (`INITIAL_VISION.md` §178) lifts §5's deferral of direct messages: the MVP is
stable and deployed, so DMs are in scope for Phase 11. That forces a decision that cannot be
deferred to implementation time, because it determines the data model, the moderation system,
and what every client is allowed to say to users.

The forcing function is §183.4's safety model. A DM report snapshots up to 10 surrounding
messages as evidence for moderator review. **A node that cannot read a report's evidence
cannot act on harassment.** DMs are the highest-risk private surface in the product — §183.2
exists entirely because unsolicited DMs are the harassment vector — and a reporting path that
produces unreadable evidence is a reporting path that does nothing.

The alternative posture, end-to-end encryption, is not a flag on this design. It is a
different system (§195.1), and Amendment B explicitly does **not** authorize it.

Two further constraints applied:

- §194 prohibits describing v0 DMs as encrypted, end-to-end, secure, or private in any
  client, document, or marketing surface, and prohibits writing DM bodies to logs, metrics,
  traces, or error payloads.
- §183.4 and §194 prohibit federating DMs in v0. Private addressing across nodes we do not
  operate, without E2E, multiplies the exposure (see `docs/research/activitypub-social-depth.md`
  §5 and `docs/architecture/federation.md` §7.6).

Precedent worth noting: Mastodon takes the same posture and says so in its own user
documentation — "Mastodon is not an encrypted messaging app like Signal or Matrix, and the
database administrators of the sender's and recipient's servers may obtain access to the
text" (<https://docs.joinmastodon.org/user/posting/>, accessed 2026-08-18). We are not
inventing a weaker standard; we are matching the fediverse norm and being louder about it.

## Decision

**v0 direct messages are stored in plaintext in PostgreSQL and are readable by the operators
of the node that hosts them. This is deliberate, and every client must say so.**

1. **Storage.** Message bodies are ordinary database rows, protected by TLS in transit,
   provider disk encryption at rest, and access control — the same protection as every other
   row, and no more. No application-layer message encryption is implemented, including
   server-held-key encryption.
2. **Labelling obligation.** Every client MUST display, on the screen where messages are
   read — not in a tooltip, not in a settings footnote — the sentence:

   > Not end-to-end encrypted — this node's operators can read these messages.

   This is a shipping requirement of the DM feature, not a polish item. A messages screen
   without this label is an incomplete implementation of §183.1.

3. **Vocabulary.** No Patches client, document, README, changelog, or marketing surface may
   describe v0 DMs as "encrypted", "secure", "end-to-end", or "private" (§194). The honest
   word is **direct**: direct, not secret.
4. **Handling.** DM bodies MUST NOT appear in logs, error messages, metrics, traces, or
   exception reports (§101, §103, §194). A DM body belongs in exactly two places: the
   database row and the authorized reader's terminal. The one authorized exception is the
   §183.4 report snapshot, which is retained for the lifetime of the report and no longer
   (§64).
5. **Not federated.** DMs are local-only in v0 (§183.4, §194).
6. **This ADR does not authorize E2E.** End-to-end encrypted DMs are **not** authorized by
   this decision and require explicit owner sign-off plus their own ADR before any code is
   written (§195.1). An implementer must not add key exchange, client-side encryption, or a
   "secret conversation" mode on the strength of this document.

### What E2E would actually require

Recorded here so the scope is not underestimated when it is next proposed (§195.1):

- **Key management and multi-device sync.** Per-device identity keys, session establishment,
  and a story for a user reading the same conversation from two terminals. Patches is a
  terminal client; "the key lives in the browser" is not available to us.
- **Federated key discovery.** Publishing and verifying keys across nodes we do not operate,
  with a trust model for key changes — the problem that has consumed years of fediverse
  effort and is still unsolved in practice.
- **Loss of server-side moderation evidence.** §183.4's report snapshot stops working. A
  replacement (client-submitted evidence, franking/attribution schemes) has to be designed,
  and it is strictly weaker: the node would be acting on evidence a party to the conversation
  chose to hand over.
- **Backup and recovery.** An account recovery that restores message history is
  incompatible with keys only the user holds; losing a device must mean losing history, and
  users must be told that before they rely on it.
- **Migration of existing plaintext conversations.** Every conversation created under this
  ADR is plaintext. A cutover has to decide whether to re-encrypt (the server can, which
  proves nothing), leave history readable, or discard it — and say which, honestly.
- **Group conversations.** §183.3 allows up to 8 members with joins and leaves; group E2E
  with membership changes is materially harder than 1:1.

### Owner sign-off items this ADR does not settle (§195)

- **§195.1 — End-to-end encrypted DMs.** Not authorized here. Needs an owner decision and
  its own ADR, with the moderation trade decided explicitly; it is the whole question, not a
  detail.
- **§195.4 — Whether the reference node enables DMs at launch**, and its `dm_retention_days`
  default. This ADR decides how DMs work if enabled; it does not decide that
  `patches.social` turns them on. `dm_enabled` and `dm_retention_days` are published via
  `GetNodeInfo` precisely so this stays an operator decision.
- **§195.6 — Federated DMs.** A separate security decision with its own gate. Shipping local
  DMs does not imply it.

## Consequences

**Positive.**

- DM harassment is actionable. A report carries readable evidence (§183.4), which is the
  only reason DM moderation exists at all.
- The security posture is stated, not implied. Users are told the truth on the screen where
  it matters, which is a stronger guarantee than an encryption claim they cannot verify.
- The implementation is small and reviewable: no key management, no device registry, no
  recovery flows, no crypto agility problem. Phase 11 can ship DMs as ordinary rows with
  ordinary access control.
- Node operators keep the ability to comply with legal process without being forced into a
  false claim about what they can and cannot produce.
- Retention is honest and configurable: a node MAY set a retention window, published via
  `GetNodeInfo` so clients can state it truthfully (§183.3).

**Negative — stated plainly rather than minimized.**

- **The node operator is a trust boundary, and users must accept it.** Anyone with database
  access, or a backup of it, can read every message. Access control and audit logging reduce
  who does this casually; they do not make it impossible.
- **A database compromise is a message-history compromise.** There is no second layer. This
  raises the stakes on §101–§104 controls, backup encryption, and operator access hygiene.
- **Patches cannot market privacy in DMs**, and must not (§194). Some users will
  (reasonably) choose Signal or Matrix for anything sensitive. That is the correct outcome.
- **The labelling obligation is permanent maintenance.** Every new client — TUI, web, React
  Native (§179) — inherits it, and a redesign that loses the label is a regression, not a
  cosmetic change.
- **Migration debt accrues with every message.** If E2E is ever adopted, the plaintext
  history problem grows for as long as this decision stands. That is a known, accepted cost
  of shipping DMs now rather than not shipping them.
- Making the messages screen carry a permanent negative-sounding label costs some product
  polish. Deliberate: the alternative is a user assuming protection they do not have.

## Alternatives considered

**End-to-end encryption in v0.** Rejected — and not ours to accept. §195.1 reserves it for
owner sign-off, and the scope above shows why: key management, multi-device, federated key
discovery, backup, group membership changes, and a replacement for §183.4's evidence model.
Shipping a partial version (1:1 only, single device, no recovery) would produce the worst
outcome available: a product that says "encrypted" while the guarantee has holes users cannot
see.

**Server-side encryption with server-held keys.** Rejected as security theatre. The node can
still decrypt, so the honest description of the posture is unchanged, but the label would
imply otherwise, operational complexity rises (key rotation, HSM or KMS, backup key
management), and moderation tooling gets harder for zero change in who can read a message.
Disk-level encryption at rest already covers the threat this actually addresses (stolen
disk), and it is provided by the platform.

**Don't ship DMs at all until E2E exists.** Rejected. §183 amends §5 deliberately: the gate
it named has passed, and the product's users need a private-ish channel. Indefinitely
deferring DMs pushes conversations to platforms Patches cannot moderate at all, which is
worse for the harassment problem than a labelled, moderatable, server-visible channel.

**Ship DMs quietly without the labelling obligation.** Rejected. This is the alternative that
makes everything else dishonest. Users infer end-to-end encryption from the word "message"
unless told otherwise; §183.1's label is the only thing that makes the rest of this decision
defensible, which is why it is a hard requirement here and a prohibition in §194.

**Federate DMs in v0 using private `Note` addressing.** Rejected — prohibited by §194 and
reserved to §195.6. The protocol shape exists and is documented
(`docs/research/activitypub-social-depth.md` §5), but without E2E it multiplies the set of
operators who can read a message from one to two-or-more, while ActivityPub's `bto`/`bcc`
handling and the absence of a conversation object add failure modes with privacy
consequences.
