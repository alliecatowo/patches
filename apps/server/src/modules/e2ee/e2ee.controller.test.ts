import { GUARDS_METADATA } from '@nestjs/common/constants.js';
import { describe, expect, it } from 'vitest';

import { RequirePrivacyAckGuard } from '../../common/guards/require-privacy-ack.guard.js';
import { E2eeController } from './e2ee.controller.js';

/** Method-level `@UseGuards(...)` metadata lives on the descriptor's `value` — mirrors the
 * wiring assertions in `require-privacy-ack.guard.test.ts`. */
function guardsOn(prototype: object, methodName: string): unknown[] {
  const method: unknown = Reflect.get(prototype, methodName);
  return (Reflect.getMetadata(GUARDS_METADATA, method as object) as unknown[] | undefined) ?? [];
}

describe('E2eeController privacy-ack wiring (audit P2)', () => {
  it('gates the two conversation-write RPCs behind an acknowledged privacy notice', () => {
    expect(guardsOn(E2eeController.prototype, 'sendEnvelopes')).toContain(RequirePrivacyAckGuard);
    expect(guardsOn(E2eeController.prototype, 'createE2EeConversation')).toContain(
      RequirePrivacyAckGuard,
    );
  });

  it('leaves reads and the device/prekey lifecycle ungated, matching the legacy policy', () => {
    for (const read of [
      'getE2EeConversationState',
      'listMailboxEnvelopes',
      'acknowledgeEnvelopes',
      'listE2EeGroupControlEvents',
      'claimPrekeyBundles',
      'uploadPrekeys',
    ] satisfies (keyof E2eeController)[]) {
      expect(guardsOn(E2eeController.prototype, read)).not.toContain(RequirePrivacyAckGuard);
    }
  });
});
