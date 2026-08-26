import type { Actor as ActorEntity } from '@patches/database';
import { describe, expect, it } from 'vitest';

import { toActorSummary } from './auth.dto.js';

// Minimal fixture: only the columns `toActorSummary` reads. Cast is a test-fixture shortcut,
// never a production pattern — `toActorSummary` never sees this type at runtime.
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
    ...overrides,
  } as ActorEntity;
}

describe('toActorSummary', () => {
  it('carries a local actor’s null homeServer through unchanged (spec §163)', () => {
    const summary = toActorSummary(actorFixture({ isLocal: true, homeServer: null }));
    expect(summary.homeServer).toBeNull();
  });

  it("carries a remote actor's homeServer domain through unchanged", () => {
    const summary = toActorSummary(actorFixture({ isLocal: false, homeServer: 'remote.example' }));
    expect(summary.homeServer).toBe('remote.example');
  });
});
