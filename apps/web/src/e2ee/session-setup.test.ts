import { describe, expect, it } from 'vitest';

import setupBlockVector from '@patches/crypto/vectors/setup-block.json' with { type: 'json' };

import { isInitialEnvelopeHeader, splitInitialHeader } from './session-setup.js';

/**
 * ADR 0034 Stage 0(a) / issue #155: replays the cross-client setup-block vector — the web port's
 * copy of `apps/tui`'s first `session-setup` test. A drift between this copy's framing and the
 * TUI's (or the shared `@patches/crypto/setup-block.ts` both now import) fails here, not against
 * a real peer.
 */
describe('session-setup framing (ADR 0034 Stage 0(a) vector)', () => {
  it('recognizes and splits the recorded cross-client envelope framing', () => {
    const envelope = Uint8Array.from(
      Buffer.from(setupBlockVector.withOneTimePreKey.envelopeHeaderHex, 'hex'),
    );
    expect(isInitialEnvelopeHeader(envelope)).toBe(true);
    const { setup, ratchetHeader } = splitInitialHeader(envelope);
    expect(Buffer.from(ratchetHeader).toString('hex')).toBe(
      setupBlockVector.withOneTimePreKey.ratchetHeaderHex,
    );
    expect(setup.senderActorId).toBe(setupBlockVector.identity.actorId);
    expect(setup.senderDeviceId).toBe(setupBlockVector.identity.deviceId);
  });
});
