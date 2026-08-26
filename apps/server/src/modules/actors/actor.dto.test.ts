import type { Actor as ActorEntity } from '@patches/database';
import { describe, expect, it } from 'vitest';

import { toActorProfile } from './actor.dto.js';

// Minimal fixture: only the columns `toActorProfile` reads. Cast is a test-fixture shortcut,
// never a production pattern — `toActorProfile` never sees this type at runtime.
function actorFixture(overrides: Partial<ActorEntity>): ActorEntity {
  return {
    id: 'actor-1',
    handle: 'alice',
    displayName: null,
    bio: null,
    locationText: null,
    websiteUrl: null,
    isLocal: true,
    createdAt: new Date('2024-01-01T00:00:00Z'),
    homeServer: null,
    nameplate: null,
    ...overrides,
  } as ActorEntity;
}

const zeroCounts = { followers: 0, following: 0, posts: 0 };

describe('toActorProfile', () => {
  it('carries a local actor’s null homeServer through unchanged (spec §163)', () => {
    const profile = toActorProfile(actorFixture({ isLocal: true, homeServer: null }), zeroCounts);
    expect(profile.homeServer).toBeNull();
  });

  it("carries a remote actor's homeServer domain through unchanged", () => {
    const profile = toActorProfile(
      actorFixture({ isLocal: false, homeServer: 'remote.example' }),
      zeroCounts,
    );
    expect(profile.homeServer).toBe('remote.example');
  });
});
