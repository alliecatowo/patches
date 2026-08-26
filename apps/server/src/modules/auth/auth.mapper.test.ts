import { describe, expect, it } from 'vitest';

import type { ActorSummary } from './auth.dto.js';
import { toProtoActor } from './auth.mapper.js';

function summaryFixture(overrides: Partial<ActorSummary>): ActorSummary {
  return {
    id: 'actor-1',
    handle: 'alice',
    displayName: null,
    bio: null,
    locationText: null,
    websiteUrl: null,
    isLocal: true,
    joinedAt: new Date('2024-01-01T00:00:00Z'),
    homeServer: null,
    ...overrides,
  };
}

describe('toProtoActor (auth)', () => {
  it('renders a local actor’s null homeServer as the wire’s empty string', () => {
    const proto = toProtoActor(summaryFixture({ isLocal: true, homeServer: null }));
    expect(proto.homeServer).toBe('');
  });

  it('renders a remote actor’s homeServer domain unchanged', () => {
    const proto = toProtoActor(summaryFixture({ isLocal: false, homeServer: 'remote.example' }));
    expect(proto.homeServer).toBe('remote.example');
  });
});
