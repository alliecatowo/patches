import { describe, expect, it } from 'vitest';

import { queryClient } from './query-client.js';

describe('queryClient', () => {
  it('can be cleared, dropping every cached query (used on session change)', () => {
    queryClient.setQueryData(['feed', 'home'], ['a post']);
    expect(queryClient.getQueryData(['feed', 'home'])).toEqual(['a post']);
    queryClient.clear();
    expect(queryClient.getQueryData(['feed', 'home'])).toBeUndefined();
  });
});
