import { afterEach, describe, expect, it } from 'vitest';

import { getAmbientAccessToken, setAmbientAccessToken } from './ambient-token.js';

afterEach(() => {
  setAmbientAccessToken(undefined);
});

describe('ambient access token (B-040)', () => {
  it('is undefined until a session publishes one', () => {
    expect(getAmbientAccessToken()).toBeUndefined();
  });

  it('round-trips the published token and clears on sign-out', () => {
    setAmbientAccessToken('token-1');
    expect(getAmbientAccessToken()).toBe('token-1');
    setAmbientAccessToken('token-2');
    expect(getAmbientAccessToken()).toBe('token-2');
    setAmbientAccessToken(undefined);
    expect(getAmbientAccessToken()).toBeUndefined();
  });
});
