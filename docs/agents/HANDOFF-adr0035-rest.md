# Handoff: finishing ADR 0035 (issue #255)

## Status: done, pending final `mise run check server` + integration run

## Findings from the sweep (job 1)

All already-landed in `51a1e2ca`/`fb3311fb`, before this session started — no code change was
needed for the sweep itself, only verification + one new test:

- `MessagesService.tryBuildConversationView` (private helper both `listConversations` and
  `getConversation` funnel through) already returns `null` for `lastMessageAt === null`
  (`apps/server/src/modules/messages/messages.service.ts:203-207`), and `getConversation` maps a
  `null` view to the existing `conversationNotFound()`. So `GetConversation` was already covered,
  contrary to the issue text — it shares the helper `listConversations` uses, it wasn't a second
  copy that needed the filter added.
- `unreadCountFor` is only ever called after the `lastMessageAt` guard already returned `null`, so
  it can never run against a reserved conversation — structurally unreachable, no guard needed.
- `NotificationsService`/`notification.mapper.ts`: a `MESSAGE` notification's `conversationId` only
  ever comes from `E2eeConversationService.#notifyRecipients`, called only from `sendEnvelopes`
  on a non-replay accept. A reservation never calls it. Structurally unreachable; documented in the
  new test rather than a code guard, since there's nothing to guard.
- `moderation.service.ts`'s only `conversationId` reference comes off an `E2eeLogicalMessage` row,
  which likewise cannot exist for a reservation.
- No search module touches conversations/DMs (grepped, none found).
- `direct-messages/**` does not exist as a separate path — `messages.service.ts`/`.controller.ts`
  _is_ `patches.v1.DirectMessageService`'s implementation (see its own top-of-file doc comment).

## Job 2 (sender-device check)

Already implemented in `51a1e2ca` (before this session), inside
`E2eeConversationService.createE2eeConversation`'s transaction, after the eligibility checks and
before the insert: looks up `e2ee_device_identities` by `(actorId, deviceId)`, rejects `null`,
non-null `revokedAt`, or `expiresAt <= now` with `E2EE_DEVICE_NOT_FOUND` / `NOT_FOUND`. Kept as a
distinct error code from `actorNotFound()`, matching the ADR's carve-out. A test for the revoked/
expired-device case already existed at `apps/server/test/e2ee.integration.test.ts:581`.

## Job 3 (zero-notification test) — added this session

New test in `apps/server/test/e2ee.integration.test.ts`, in the
`SendEnvelopes/CreateE2eeConversation fanout` describe block, right before the "creates an E2EE
conversation..." test: `'a bare reservation writes no notification and stays invisible to every
member, including its creator (ADR 0035 §3.5, §5)'`. Reserves only (no `sendEnvelopes`), then
asserts zero `NotificationEntity` rows for the conversation, `MessagesService.getConversation`
throws `CONVERSATION_NOT_FOUND` for both recipient and creator, and neither's `listConversations`
page contains the id.

## Next step if this handoff is picked up mid-way

1. Run `mise run check server` (workspace: `apps/server`).
2. Run the integration suite against the compose stack:
   `mise run compose -- up -d`, `pnpm db:migrate`, then
   `pnpm --filter @patches/server test apps/server/test/e2ee.integration.test.ts` (one file at a
   time — this machine OOMs on parallel integration runs).
3. If green, commit `apps/server/test/e2ee.integration.test.ts` and this handoff doc, paths only
   (no `git add -A`), report the sha.
