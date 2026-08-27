import { describe, expect, it } from 'vitest';

import {
  assertConversationModeNegotiation,
  assertE2eeGroupBounds,
  assertImmutableConversationMode,
  E2EE_MAX_DEVICE_ENVELOPES_PER_LOGICAL_MESSAGE,
  E2EE_ONE_TIME_PREKEY_TARGET,
  E2EE_PROTOCOL_V1,
  E2EE_REPORT_MAX_SURROUNDING_MESSAGES,
  E2EE_SIGNED_PREKEY_ROTATION_MS,
  E2EE_UNREVIEWED_DEV_MODE_WARNING,
} from './modes.js';

describe('E2EE domain contract', () => {
  it('keeps legacy and E2EE modes immutable', () => {
    expect(() => assertImmutableConversationMode('E2EE_V1', 'LEGACY_SERVER_VISIBLE')).toThrow(
      'immutable',
    );
    expect(() => assertImmutableConversationMode('LEGACY_SERVER_VISIBLE', 'E2EE_V1')).toThrow(
      'immutable',
    );
    expect(() => assertImmutableConversationMode('E2EE_V1', 'E2EE_V1')).not.toThrow();
  });

  it('never falls back when the capability or a participant is unavailable', () => {
    expect(() =>
      assertConversationModeNegotiation({
        requestedMode: 'E2EE_V1',
        capabilityState: 'EXTERNAL_REVIEW_PENDING',
        isolatedTestNode: false,
        participantProtocols: [E2EE_PROTOCOL_V1, E2EE_PROTOCOL_V1],
      }),
    ).toThrow('not enabled');
    expect(() =>
      assertConversationModeNegotiation({
        requestedMode: 'E2EE_V1',
        capabilityState: 'EXPERIMENTAL_CANARY',
        isolatedTestNode: false,
        participantProtocols: [E2EE_PROTOCOL_V1, null],
      }),
    ).toThrow('Every participant');
  });

  it('permits E2EE only on isolated test nodes or post-review rollout states', () => {
    expect(() =>
      assertConversationModeNegotiation({
        requestedMode: 'E2EE_V1',
        capabilityState: 'ISOLATED_TEST_ONLY',
        isolatedTestNode: true,
        participantProtocols: [E2EE_PROTOCOL_V1, E2EE_PROTOCOL_V1],
      }),
    ).not.toThrow();
  });

  it('pins bounded fanout, prekey rotation, and report context', () => {
    expect(E2EE_MAX_DEVICE_ENVELOPES_PER_LOGICAL_MESSAGE).toBe(64);
    expect(E2EE_ONE_TIME_PREKEY_TARGET).toBe(100);
    expect(E2EE_SIGNED_PREKEY_ROTATION_MS).toBe(7 * 24 * 60 * 60 * 1_000);
    expect(E2EE_REPORT_MAX_SURROUNDING_MESSAGES).toBe(10);
    expect(() => assertE2eeGroupBounds(8, 64)).not.toThrow();
    expect(() => assertE2eeGroupBounds(9, 64)).toThrow('membership');
    expect(() => assertE2eeGroupBounds(8, 65)).toThrow('fanout');
  });

  it('pins the ADR 0027 unreviewed-dev-mode warning byte-for-byte', () => {
    expect(E2EE_UNREVIEWED_DEV_MODE_WARNING).toBe(
      'Unreviewed development E2EE — for testing only; do not use for sensitive conversations.',
    );
  });
});
