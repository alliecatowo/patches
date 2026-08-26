import { describe, expect, it } from 'vitest';

import { formatActorHandle } from './format.js';

describe('formatActorHandle (B-180)', () => {
  it('renders the bare handle for a locally-owned actor (empty home_server)', () => {
    expect(formatActorHandle({ handle: 'allie', homeServer: '' })).toBe('allie');
  });

  it('renders the bare handle when home_server is absent entirely', () => {
    expect(formatActorHandle({ handle: 'allie' })).toBe('allie');
  });

  it('renders the canonical @handle@domain form (spec §163) for a remote actor', () => {
    expect(formatActorHandle({ handle: 'nomad', homeServer: 'other.example' })).toBe(
      'nomad@other.example',
    );
  });

  it('returns an empty string for an absent actor', () => {
    expect(formatActorHandle(undefined)).toBe('');
  });
});
