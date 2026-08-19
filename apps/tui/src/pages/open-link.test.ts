import { describe, expect, it, vi } from 'vitest';

import { openLinkExternally } from './open-link.js';

describe('openLinkExternally (P45-004, A-045)', () => {
  it('opens a plain https URL', () => {
    const spawnFn = vi.fn();
    const opened = openLinkExternally('https://example.test/page', {
      env: {},
      spawnFn,
      platform: 'linux',
    });
    expect(opened).toBe(true);
    expect(spawnFn).toHaveBeenCalledTimes(1);
    const [command, args] = spawnFn.mock.calls[0] as [string, readonly string[]];
    expect(command).toBe('xdg-open');
    expect(args).toEqual(['https://example.test/page']);
  });

  it('opens a plain http URL', () => {
    const spawnFn = vi.fn();
    const opened = openLinkExternally('http://example.test/page', {
      env: {},
      spawnFn,
      platform: 'linux',
    });
    expect(opened).toBe(true);
    expect(spawnFn).toHaveBeenCalledTimes(1);
  });

  it('is a no-op under PATCHES_NO_OPEN but still reports success (test/CI safety)', () => {
    const spawnFn = vi.fn();
    const opened = openLinkExternally('https://example.test/page', {
      env: { PATCHES_NO_OPEN: '1' },
      spawnFn,
    });
    expect(opened).toBe(true);
    expect(spawnFn).not.toHaveBeenCalled();
  });

  it.each([
    ['javascript: scheme', 'javascript:alert(1)'],
    ['file: scheme', 'file:///etc/passwd'],
    ['data: scheme', 'data:text/html,<script>alert(1)</script>'],
    ['a leading-dash argument-injection attempt', '-flag'],
    ['a leading-dash host-looking string', '--exec=evil'],
    ['not a URL at all', 'not a url'],
    ['a relative path', '/etc/passwd'],
    ['too long a URL', `https://example.test/${'a'.repeat(2048)}`],
  ])('rejects %s without spawning', (_label, url) => {
    const spawnFn = vi.fn();
    const opened = openLinkExternally(url, { env: {}, spawnFn, platform: 'linux' });
    expect(opened).toBe(false);
    expect(spawnFn).not.toHaveBeenCalled();
  });
});
