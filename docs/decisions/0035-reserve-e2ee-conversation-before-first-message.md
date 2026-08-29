# 0035. An E2EE conversation is reserved before its first message, never with it

**Status:** Accepted
**Date:** 2026-08-26

## Context

[ADR 0033](./0033-one-e2ee-identity-transcript-family.md) removes the first of two blockers to
E2EE session bootstrap. This ADR removes the second, which is in the wire contract rather than in
the crypto, and which `apps/web/src/e2ee/web-e2ee.ts` states exactly:

> `CreateE2eeConversation` mints the conversation id server-side _after_ the client composes the
> initial message — but every envelope's AEAD associated data binds the conversation id the
> _recipient_ will read off the wire (`packages/crypto`'s `encodeDeviceEnvelopeAssociatedData`
> requires it non-empty). A client cannot seal an initial envelope for an id it cannot know;
> inventing one would produce envelopes no recipient can ever open.

Concretely: `CreateE2eeConversationRequest.message` (`e2ee.proto` field 4) carries a fully
fanned-out `E2eeLogicalMessage`, i.e. one sealed `E2eeDeviceEnvelope` per recipient device. Each
of those envelopes was sealed under associated data produced by
`encodeDeviceEnvelopeAssociatedData` (`packages/crypto/src/device-envelope.ts:137`), whose second
written field after the franking profile is `context.conversationId`, guarded by
`requireNonEmptyString`. The conversation id does not exist until
`e2ee-conversation.service.ts:160` inserts the `conversations` row, inside the same transaction
that then calls `acceptE2eeLogicalMessage` with the already-sealed envelopes. The sender cannot
have bound that id, so no recipient can reproduce the associated data, so every open fails
authentication.

This is not a client bug. Both clients already refuse to exercise the path: `apps/web`'s
`webE2eeSessionSetupAvailable()` is hard-`false` with fixed copy, and the TUI has no
`createE2eeConversation` call site at all. `CreateE2eeConversation` as specified is an operation
no honest client can construct — its only correct implementations are "don't call it" and "emit
ciphertext nobody can read".

Two facts from the surrounding code shape the answer.

- **The protocol already solved this once.** `E2eeLogicalMessage.logical_message_id` (field 6) is
  optional and **client-minted**, with the comment: "ADR 0025 binds THIS value into every
  envelope's AEAD associated data, so the node must store and return it verbatim — a node-minted
  surrogate would make every recipient-side open fail authentication." The transcript grew a
  second binding (ADR 0025's `logicalMessageId`) and the id moved to the client. The
  conversation-id binding predates that and never got the same treatment.
- **First contact is already narrow.** `mayMessageDirectly` is mutual-follow only:
  ADR 0030 deleted the `message_requests` store, so §183.2's second arm has no backing. A caller
  who cannot create a conversation with a mutual follower cannot create one with anybody.

Nothing here touches §183.1's disclosure copy: ADR 0030 §B-095 removed
`LEGACY_SERVER_VISIBLE`, made `E2EE_V1` the only conversation security mode, and removed every
client's §183.1 server-visible disclosure with the plaintext machinery it described. This ADR
changes when a conversation row appears, not what a client may call it.

## Decision

`CreateE2eeConversation` **reserves** a conversation: it establishes membership and returns the
id, and carries no message. The first message is an ordinary `SendEnvelopes` into the now-known
id, sealed against associated data the sender and every recipient can both derive.

### 1. The one-shot form is removed, not made optional

The weaker version of this decision — leave field 4 in place and let absence mean "reserve" —
was considered and is not taken. Under this ADR the one-shot form is _unconstructible by
construction_: there is no sequence of RPCs by which a client learns a conversation id before
`CreateE2eeConversation` returns, so any request that populates field 4 populates it with
envelopes that cannot open. A schema that advertises an operation whose every invocation produces
un-openable ciphertext is a footgun with no correct use, and it leaves a permanently dead branch
in `createE2eeConversation`, in the replay path, and in three response fields that can never be
set. It goes.

### 2. The exact proto edits

In `packages/proto/proto/patches/v1/e2ee.proto`:

```proto
message CreateE2eeConversationRequest {
  // Idempotency key (spec §45). Retrying returns the same conversation id and creates nothing.
  string client_request_id = 1;

  // Excludes the caller. 1 recipient makes a direct conversation, 2–7 a group (8 members
  // including the caller, spec §183.3).
  repeated string recipient_actor_ids = 2;

  // Must name an active certified device of the caller. Reserving a conversation you have no
  // device to send from is a client bug, caught here rather than at the first send.
  string sender_device_id = 3;

  // Removed by ADR 0035. This RPC used to carry the first `E2eeLogicalMessage`, which was
  // impossible to seal: the envelope AD binds the conversation id, and the node minted it
  // after the client composed. The first message is a `SendEnvelopes` into the reserved id.
  // Never reuse this number or name (spec §153).
  reserved 4;
  reserved "message";
}

message CreateE2eeConversationResponse {
  string conversation_id = 1;

  // Always `CONVERSATION_SECURITY_MODE_E2EE_V1`. Echoed so a client can assert the mode it got
  // rather than the mode it asked for before it renders any encryption wording.
  ConversationSecurityMode security_mode = 2;

  // Removed by ADR 0035 with the request's `message`: this RPC accepts no message, so it
  // issues no logical message id, no acceptance time, and no franking tag. Those come from
  // the `SendEnvelopes` that carries the first message. Never reuse these numbers or names.
  reserved 3, 4, 5;
  reserved "logical_message_id", "accepted_at", "franking_tag";
}
```

The `rpc CreateE2eeConversation` doc comment (`e2ee.proto:82`) is rewritten to describe a
reservation and to point at `SendEnvelopes` for the first message.

Deleting a field is not a `WIRE_JSON` violation: `buf config ls-breaking-rules` (run in
`packages/proto`) lists `FIELD_NO_DELETE` under `CSR, FILE, PACKAGE` and not under `WIRE_JSON`,
which is the only ruleset `packages/proto/buf.yaml` enables. `FIELD_SAME_NAME` _is_ a `WIRE_JSON`
rule, which is why the names are reserved alongside the numbers. The implementer still runs
`pnpm proto:breaking` and does not assume this paragraph is a substitute for it.

### 3. Server semantics

`E2eeConversationService.createE2eeConversation` keeps its current ordering — validate, replay,
budget, transact — with the fanout removed:

1. **Validate.** `client_request_id` non-empty; `recipient_actor_ids` deduplicated, not
   containing the caller, between 1 and `E2EE_GROUP_MAX_MEMBERS - 1`; `sender_device_id`
   non-empty. All `AppError.validation` (`INVALID_ARGUMENT`), unchanged.
2. **Replay** (§4 below). Returns before any budget is consumed.
3. **Budget.** `rateLimits.consumeConversationCreate(actorId, peer)` — same bucket, same
   `ENVELOPE_BUDGETS`, unchanged. Its docstring ("also accepts one logical message") is corrected.
4. **Transaction**, in this order, exactly the authorization path that runs today:
   a. every `recipient_actor_ids` entry resolves to an actor that is local and not soft-deleted;
   b. no block in either direction between any pair drawn from `[caller, ...recipients]`;
   c. `mayMessageDirectly(caller, recipient)` for every recipient;
   d. insert the `conversations` row (`kind` `DIRECT` for one recipient else `GROUP`,
   `security_mode` `E2EE_V1`, `membership_epoch` `1`, `created_by_actor_id` the caller,
   `creation_client_request_id` the request's key, `last_message_at` **NULL**);
   e. insert one `conversation_members` row per member.
5. **Nothing else.** No `e2ee_logical_messages` row, no `e2ee_mailbox_envelopes` rows, no
   `e2ee_group_control_events` row, and — because `#notifyRecipients` is called only on a
   non-replay accepted message — **no notification**. A reservation is silent by construction,
   not by a flag someone can flip.

The **sender-device check** moves up rather than disappearing. It runs today inside
`acceptE2eeLogicalMessage`, which no longer runs here, so `createE2eeConversation` performs it
itself, inside the transaction: `sender_device_id` must name a row in `e2ee_device_identities`
for the caller with `revoked_at IS NULL` and `expires_at > now()`, else `E2EE_DEVICE_NOT_FOUND`
(`NOT_FOUND`). This is the caller's own device, so it is not an oracle about anyone else.

**Error mapping.** Every recipient-availability failure — nonexistent actor, remote actor,
soft-deleted actor, block in either direction, absence of a mutual follow — throws the single
existing `actorNotFound()`, i.e. `E2EE_CONVERSATION_NOT_FOUND` / `NOT_FOUND` with the fixed
message "One or more recipients are unavailable for an E2EE conversation." (spec §62, §183.4 —
no block oracle). The set of distinguishable outcomes does not grow: these are the same branches,
with the same code, that ran before.

**Recipient E2EE capability is deliberately not checked here.** Whether a recipient has an active
device that advertises `E2EE_PROTOCOL_V1` is reported by `GetE2eeConversationState`'s
`supports_e2ee_v1`, to members only, after the reservation exists. Turning it into a
create-time rejection would give the caller a distinct, pre-authorization signal about a third
party's enrollment state, which is exactly the shape §62 prohibits.

### 4. Idempotency

`conversations` gains a nullable `creation_client_request_id text` column with a partial unique
index:

```sql
CREATE UNIQUE INDEX uq_conversations_creator_client_request_id
  ON conversations (created_by_actor_id, creation_client_request_id)
  WHERE creation_client_request_id IS NOT NULL;
```

A new column is required, not optional: the existing replay anchor is
`e2ee_logical_messages (sender_actor_id, client_request_id)`, and a reservation writes no logical
message. Without an anchor on the conversation itself, a retried reservation creates a second
conversation, which violates spec §45 and the field's own contract.

- **Replay.** Before consuming budget, look up
  `(created_by_actor_id = caller, creation_client_request_id = request.client_request_id)`. On a
  hit, return `{ conversation_id, security_mode: E2EE_V1 }` for that row without re-running
  authorization and without consuming budget. Same key ⇒ same id, for the life of the row.
- **Concurrent duplicate.** The insert may still raise a unique violation when two retries race.
  Catch it, re-read by the same pair, and return that row — the same shape
  `acceptE2eeLogicalMessage` already uses for its raced insert. If the re-read finds nothing,
  rethrow: an unexplained constraint violation is never swallowed.
- **Scope.** The key is scoped to the creator, so two actors may use the same string. The
  reservation's key and the first `SendEnvelopes`' `client_request_id` are independent values in
  independent tables; clients mint a fresh UUID per RPC.

`created_by_actor_id` is `ON DELETE SET NULL`, and Postgres does not enforce uniqueness across
NULLs, so a deleted creator's rows drop out of the index rather than blocking anything.

### 5. An empty conversation is not a visible product state

A reserved conversation is **invisible to every actor, including its creator**, until its first
message is accepted.

This is a spec requirement, not tidiness. §183.3 prohibits typing indicators because "they leak
presence". A conversation appearing in a recipient's list the moment someone opens a composer is
a coarse typing indicator: it discloses that the other party started writing and, if no message
follows, that they thought better of it. Patches does not ship that.

The marker is `conversations.last_message_at`, which becomes **nullable** and is NULL from
reservation until `acceptE2eeLogicalMessage` sets it (`e2ee-fanout.ts:562` already writes it on
every accepted message, and is the only writer). Then:

- `MessagesService.listConversations` adds `AND conversation.lastMessageAt IS NOT NULL` to its
  query builder. Keyset pagination is unchanged, because every listed row has a non-NULL ordering
  key and the cursor is `(last_message_at, id)`.
- `MessagesService.getConversation` treats `last_message_at IS NULL` as not found, through the
  existing `conversationNotFound()`.
- `ConversationView.lastMessageAt` stays non-nullable in `messages.dto.ts`: an empty conversation
  is never mapped.
- `GetE2eeConversationState`, `SendEnvelopes`, `AddE2eeMember`, `RemoveE2eeMember`,
  `ListE2eeGroupControlEvents` are **unaffected**. They are membership-scoped, the creator is a
  member from the reservation onward, and they are how the creator drives the flow.

**Reaping.** `E2eeRetentionSweepHandler` gains a fourth `RetentionKind`, `empty_conversation`,
with `E2EE_EMPTY_CONVERSATION_TTL_MS = 24 * 60 * 60 * 1000`. In one transaction per batch it
deletes `conversation_members` and then `conversations` for rows where
`last_message_at IS NULL AND created_at < now() - TTL` and no `e2ee_logical_messages` row and no
`e2ee_group_control_events` row references the conversation. The two `NOT EXISTS` guards are belt
and braces against the `last_message_at` marker ever drifting from reality; the group-control
guard also keeps a reserved-then-restructured conversation alive. Deletion is safe precisely
because the row is, by these predicates, carrying nothing: no ciphertext, no franking material,
no evidence. A creator whose reservation was reaped simply reserves again.

### 6. The client sequence

Every client — TUI, web, and the `@patches/e2ee-client` runtime ADR 0034 hoists them into —
implements exactly this, and nothing shorter:

1. `CreateE2eeConversation { client_request_id, recipient_actor_ids, sender_device_id }`
   → `conversation_id`. Persist `client_request_id` alongside the draft _before_ the call, so a
   crash between call and response resolves to the same conversation on retry.
2. `GetE2eeConversationState { conversation_id }` → `membership_epoch` (1),
   `group_control_digest` (genesis), and each member's `active_device_ids`, roster digest, and
   `supports_e2ee_v1`. If any member is not `supports_e2ee_v1`, stop and say so; never downgrade.
3. `ClaimPrekeyBundles { conversation_id, actor_ids }` → bundles + rosters; verify the chain and
   run X3DH per peer device (ADR 0033's unified transcripts).
4. Seal one envelope per target device with
   `encodeDeviceEnvelopeAssociatedData({ conversationId, membershipEpoch, senderActorId,
senderDeviceId, frankingProfile }, recipient, logicalMessageId, commitment)`, where
   `conversationId` is the id from step 1 and `logicalMessageId` is the client-minted UUID also
   sent in `E2eeLogicalMessage.logical_message_id`.
5. `SendEnvelopes { conversation_id, client_request_id (fresh), sender_device_id, message }`.

Recipients derive the identical associated data from the conversation id and logical message id
the node returns with the mailbox envelope. That is the whole fix: step 1 now precedes step 4.

`webE2eeSessionSetupAvailable()` and `WEB_E2EE_SESSION_UNAVAILABLE_COPY` are deleted, not
reworded, in the change that lands both this and ADR 0033 — the condition they describe is gone,
and a constant that says "retrying will not change that" must never outlive the reason.

### 7. Migration

One migration in `packages/database/src/migrations/`:

```sql
ALTER TABLE conversations ADD COLUMN creation_client_request_id text;
CREATE UNIQUE INDEX uq_conversations_creator_client_request_id
  ON conversations (created_by_actor_id, creation_client_request_id)
  WHERE creation_client_request_id IS NOT NULL;
ALTER TABLE conversations ALTER COLUMN last_message_at DROP NOT NULL;
```

No backfill: every existing conversation has a non-NULL `last_message_at` and stays visible.
`creation_client_request_id` is NULL for them, which the partial index tolerates and the replay
lookup never matches (the caller's key is always non-empty). This composes cleanly with ADR 0033
§5's deletion migration, which explicitly does not touch `conversations`.

`down()` is reversible and says what it destroys: it deletes conversations with
`last_message_at IS NULL` (and their `conversation_members`), restores `NOT NULL`, drops the
index, and drops the column. Those rows cannot exist under the previous schema and carry no
messages by definition.

### 8. Definition of done, and how it composes with ADR 0033 §7

ADR 0033 §7 requires "a server integration test in which two distinct enrolled devices establish
a session through the real RPCs and exchange a message that decrypts: `EnrollDevice` →
`ClaimPrekeyBundles` → X3DH → ratchet encrypt → `SendEnvelopes` → `ListMailboxEnvelopes` →
decrypt".

That sequence is **not constructible on today's schema**, and the gap is this ADR's subject: the
`SendEnvelopes` in step 5 needs a conversation to exist, and the only RPC that creates one demands
a message that cannot be sealed. A test could only close the gap by inserting the `conversations`
row through the repository, which would make the "through the real RPCs" clause false at the one
step that has never worked.

With this ADR the sequence is literally constructible, and §7's definition of done is amended to
name the reservation explicitly:

> `EnrollDevice` (×2) → **`CreateE2eeConversation` (reserve)** → **`GetE2eeConversationState`** →
> `ClaimPrekeyBundles` → X3DH → ratchet encrypt → `SendEnvelopes` → `ListMailboxEnvelopes` →
> decrypt, with franking verification intact.

Neither ADR discharges the other: 0033 makes the peer's key material verifiable, 0035 makes the
envelope's associated data derivable. Both must land before that test can pass, and the test is
the acceptance gate for both.

**The test.** One integration test in `apps/server/test/e2ee.integration.test.ts`, in the
`SendEnvelopes/CreateE2eeConversation fanout` describe block, is ADR 0033 §7's end-to-end test
extended with the assertions this ADR is responsible for:

1. After the reservation and before any send: `e2ee_logical_messages` has zero rows for the
   conversation, and the recipient has **no** `MESSAGE` notification and an unread count of zero.
2. The recipient's `ListConversations` does not contain the conversation while it is empty, and
   `GetConversation` on its id is `NOT_FOUND` for both members — then both change after the first
   `SendEnvelopes`.
3. Re-issuing the identical `CreateE2eeConversation` request returns the same `conversation_id`
   and leaves exactly one `conversations` row, and two such requests issued concurrently do the
   same.
4. The first `SendEnvelopes` into the reserved id is accepted, and the recipient device opens its
   mailbox envelope — associated data computed by `encodeDeviceEnvelopeAssociatedData` over the
   reserved conversation id on both sides, franking commitment verified. This is the assertion
   that proves the blocker is gone; it fails on any design where the sender guesses the id.
5. Reservations against a non-mutual-follower, a blocked peer (each direction), a soft-deleted
   actor, and a nonexistent actor id all fail with the identical `E2EE_CONVERSATION_NOT_FOUND`
   code and message.
6. A reservation naming a revoked or expired `sender_device_id` fails `E2EE_DEVICE_NOT_FOUND`.

The existing create-then-assert tests in that file (13 call sites) are rewritten as reserve +
`SendEnvelopes`, which is a mechanical change that also makes them exercise the sequence real
clients use.

## Consequences

**Positive.** The blocker `web-e2ee.ts` documents is gone, and gone structurally: after this
change there is no request a client can build whose envelopes bind an id the client does not have.
`CreateE2eeConversation` becomes an operation with one job — establish membership under the
authorization rules — instead of an operation that also performs an atomic fanout it has no way
to make openable. Failure modes separate usefully: a rejected fanout (revocation race, stale
epoch, missing device) no longer destroys the conversation and forces the caller back through
first-contact authorization; it just fails a send that can be recomposed and retried.
`ClaimPrekeyBundles` is now always called with a real `conversation_id`. No reviewed cryptography
changes at all: `encodeDeviceEnvelopeAssociatedData` is byte-for-byte untouched, so ADR 0020 §12's
independent-review gate is not re-opened by this ADR (ADR 0033 re-opens it on its own account).
And §183.3's presence-leak rule now covers the conversation-existence channel, which the one-shot
design never had to think about because a conversation could not exist without a message.

**Negative.** Creating a conversation and sending its first message stop being atomic. The window
between them is real: a crash, a revocation, or a permanent send failure leaves a reserved
conversation that reaches nobody, and correctness now rests on two idempotency keys and a reaper
instead of one transaction. Three moving parts pay for that — a new column and index, a nullable
`last_message_at` with a listing filter, and a fourth retention kind — where the previous design
had none. The wire contract loses four fields, so `pnpm proto:gen` output, both clients' create
paths, and thirteen server integration-test call sites all change in one sweep. Reserved numbers
`4` on the request and `3`–`5` on the response are permanently spent (spec §153). A client built
against the old schema that still sets field 4 has its message silently dropped as an unknown
field and believes it sent something; under ADR 0030 no such build exists outside this repo, and
clients land in the same change set, but the hazard is real for anyone who forks between the two.

**Sequencing.** This ADR is inert on its own: without ADR 0033 a client still cannot claim a
usable prekey bundle, so a reserved conversation has nothing to send into. Land 0033 first or
together; the shared acceptance test in §8 is what proves both. `apps/web/src/e2ee/**` is held by
another agent (ADR 0033's own sequencing note), and its `bindConversationCreate` transport —
which today builds the impossible `message` field — must be reduced to the reservation in the
same change that deletes `availability.ts`'s fail-closed constant.

## Alternatives considered

**Client-minted conversation id.** Add a field carrying a client-generated UUIDv4 and use it as
the `conversations` primary key. This has real precedent — `logical_message_id` is exactly this,
for exactly this reason — but the two cases differ where it matters. A logical message id is
minted inside a conversation the caller is already an authorized member of, and a collision is
confined to that caller's own message stream. A conversation id is a **global** namespace whose
rows the caller is not yet a member of, so a collision is a query about someone else's private
state: today's code path already shows the failure shape, since a colliding client-supplied
`logical_message_id` produces a unique violation whose handler looks up
`(sender, client_request_id)`, finds nothing, and rethrows the raw database error — an outcome
plainly distinguishable from `E2EE_CONVERSATION_NOT_FOUND`. Making that indistinguishable is
possible (map a PK collision onto the same generic failure) but it means a caller who genuinely
retries with a lost idempotency key gets "recipients unavailable", and the node cannot tell an
honest retry from a probe. Format validation does not help: a well-formed UUIDv4 is exactly what
a prober would send. Squatting is likewise not answered by validation — 122 bits of entropy makes
guessing an existing id infeasible, but the design's safety would then rest entirely on every
client's RNG being sound, and a client with a broken or replayed RNG would generate collisions
against its _own_ prior conversations, which is where a squat would actually land. Rejected: it
buys atomicity by moving a security-relevant uniqueness decision to the least trusted party.

**Two-step reserve, keeping the one-shot form as `message`-absent.** This is the decision, minus
§1. Rejected on the ground given there: proto3 message-field presence makes it free to express,
but it leaves an operation in the schema that no client can invoke correctly, a dead branch in the
service and the replay path, and three response fields that are permanently unset. Removing the
field costs one breaking-change sweep in a pre-alpha repo (ADR 0030) and buys a wire contract that
cannot be used wrongly.

**Derive the conversation id deterministically from the sorted member actor ids.** Both sides
could compute it without a round trip, which is genuinely attractive. Rejected on three counts.
It makes a second conversation with the same membership unrepresentable — fine for a 1:1, wrong
for groups, where nothing in §183.3 says one set of eight people gets one conversation forever,
and where the id would have to change on every `AddE2eeMember`/`RemoveE2eeMember`, breaking the
immutable identifier that group-control events, mailbox rows, and franking transcripts all bind.
It collides with the existing UUID primary key scheme: a derived id is a hash, and either it is
truncated into a UUID (birthday-bounded, in a namespace an attacker partly controls by choosing
membership) or the column stops being a UUID everywhere. And it turns the conversation id into a
_membership disclosure_ — anyone who guesses a member set can compute the id and probe for its
existence, which is the §62 oracle in its purest form.

**Change the AD transcript so the initial message does not bind the conversation id.** Analysed
seriously, and the verdict is no. The binding is what makes an envelope refuse to open when the
node files it under a different conversation; ADR 0025 and the 2026-08 audit hardening extended
that same treatment to the recipient `(actorId, deviceId)` pair and to `logicalMessageId`
precisely because unbound context is where cross-context confusion lives. Dropping it for "the
initial message" would mean either a second AD encoder — the exact defect ADR 0033 exists to
remove — or a variable-shape transcript whose first message is weaker than every subsequent one,
with the weaker form selected by a flag an attacking node controls. The first message is also the
_worst_ one to unbind: it is the message that establishes the session, so an envelope accepted
under the wrong conversation there mis-roots a ratchet rather than corrupting one frame. And the
transcript is inside ADR 0020 §12's independent-review scope, so weakening it would need that
review rather than an ADR. Rejected: the binding is correct, and the wire contract was wrong to
ask for a message before the id existed.

**Bind a client-minted `conversation_binding` (32 random bytes, immutable column) instead of the
conversation id.** The interesting hybrid: the AD binds a value the client chooses, uniqueness is
statistical rather than enforced, so there is no collision oracle and no squatting, and the id
stays server-minted. Rejected on cost and blast radius. It changes
`encodeDeviceEnvelopeAssociatedData`, which is reviewed crypto under §12 and is already being
rewritten by ADR 0033 — two concurrent changes to the same transcript is how a vector set ends up
disagreeing with itself. It adds a proto field, a database column, and a value every client must
carry through every seal and open, to buy back one round trip. And it does not remove the need for
`GetE2eeConversationState` before the first send anyway, since the sender needs the member device
set to build the fanout — so the round trip it saves was never on the critical path.

**Let `CreateE2eeConversation` return the id and accept the message in a second field of the same
response-then-request handshake (a new `FinalizeE2eeConversation` RPC).** Rejected as
`SendEnvelopes` under another name. The finalize RPC's body would be `conversation_id` +
`client_request_id` + `sender_device_id` + `E2eeLogicalMessage`, which is `SendEnvelopesRequest`
field for field, and its accept logic would be `acceptE2eeLogicalMessage`. A second RPC that
differs from an existing one only in when it is called is a second place for the fanout rules to
drift.

**Keep the conversation hidden from the recipient but visible to its creator.** Considered for
§5, and rejected as a distinction without a user. The creator's client drives the flow from the id
in hand and reaches the conversation through `GetE2eeConversationState`, not `GetConversation`; a
reservation surfaced in the creator's own list before it holds a message is an empty row the
client would have to special-case in the UI, and the reaper deletes it in a day regardless. One
rule — invisible until it has a message — is simpler to state and to test.
