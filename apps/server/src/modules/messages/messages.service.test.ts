import { ConversationSecurityMode } from '@patches/proto/nest';
import { describe, expect, it } from 'vitest';
import type { DataSource } from 'typeorm';

import { AppError } from '../../common/errors/app-error.js';
import { MessagesService } from './messages.service.js';

/**
 * ADR 0030 §B-095 leftovers, proven gone at the application layer. The wire-level proofs (the
 * trimmed `DirectMessageService` method list, the reserved enum number) live in
 * `packages/proto/src/proto-loading.test.ts`; the schema-level proofs (narrowed CHECK, dropped
 * tables, absent guard function) in `packages/database/test/phase13-e2ee.integration.test.ts`.
 */

/** Any property access must fail: `leaveConversation` rejects before touching persistence, and
 * a lookup would reintroduce the block-oracle surface §62 forbids. */
function untouchableDataSource(): DataSource {
  return new Proxy({} as DataSource, {
    get() {
      throw new Error('leaveConversation must not touch the DataSource');
    },
  });
}

describe('MessagesService.leaveConversation (ADR 0030 §B-095)', () => {
  it('rejects uniformly with NOT_IMPLEMENTED and never touches the database', async () => {
    const service = new MessagesService(untouchableDataSource());
    await expect(service.leaveConversation('actor-id', 'conversation-id')).rejects.toMatchObject({
      code: 'NOT_IMPLEMENTED',
    });
  });

  it('names the supported path in the client-visible message', async () => {
    const service = new MessagesService(untouchableDataSource());
    const rejection = service.leaveConversation('actor-id', 'conversation-id');
    await expect(rejection).rejects.toBeInstanceOf(AppError);
    await expect(rejection).rejects.toThrow(/RemoveE2eeMember/);
  });
});

describe('ConversationSecurityMode after the legacy purge (ADR 0030 §B-095)', () => {
  it('exposes only UNSPECIFIED and E2EE_V1 — no legacy value survives in client code', () => {
    const keys = Object.keys(ConversationSecurityMode).sort();
    expect(keys).toEqual([
      'CONVERSATION_SECURITY_MODE_E2EE_V1',
      'CONVERSATION_SECURITY_MODE_UNSPECIFIED',
      'UNRECOGNIZED',
    ]);
    expect(keys).not.toContain('CONVERSATION_SECURITY_MODE_LEGACY_SERVER_VISIBLE');
  });
});
