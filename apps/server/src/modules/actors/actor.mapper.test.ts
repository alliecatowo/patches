import { describe, expect, it } from 'vitest';

import type { ActorProfile } from './actor.dto.js';
import { toProtoActor } from './actor.mapper.js';

function profileFixture(overrides: Partial<ActorProfile>): ActorProfile {
  return {
    id: 'actor-1',
    handle: 'alice',
    displayName: null,
    bio: null,
    locationText: null,
    websiteUrl: null,
    isLocal: true,
    homeServer: null,
    joinedAt: new Date('2024-01-01T00:00:00Z'),
    counts: { followers: 0, following: 0, posts: 0 },
    nameplate: null,
    flair: null,
    pinnedPostIds: [],
    profileBannerUrl: null,
    profileFrame: null,
    nameTagStyle: null,
    accentColor: null,
    ...overrides,
  };
}

describe('toProtoActor (actors)', () => {
  it('renders a local actor’s null homeServer as the wire’s empty string', () => {
    const proto = toProtoActor(profileFixture({ isLocal: true, homeServer: null }));
    expect(proto.homeServer).toBe('');
  });

  it('renders a remote actor’s homeServer domain unchanged', () => {
    const proto = toProtoActor(profileFixture({ isLocal: false, homeServer: 'remote.example' }));
    expect(proto.homeServer).toBe('remote.example');
  });
});
