import { describe, expect, it } from 'vitest';

import { formatServerVersion } from './server-build.js';

describe('formatServerVersion', () => {
  it('appends the short source revision as semver build metadata', () => {
    expect(formatServerVersion('0.1.0', '7857891AABBCCDDEEFF')).toBe('0.1.0+7857891');
  });

  it.each([undefined, '', 'unknown', 'abc123', 'abc123!'])(
    'ignores an absent or invalid source revision: %s',
    (buildSha) => {
      expect(formatServerVersion('0.1.0', buildSha)).toBe('0.1.0');
    },
  );
});
