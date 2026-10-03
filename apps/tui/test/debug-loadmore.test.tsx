import { describe, expect, it } from 'vitest';
import { createFakeApi, flush, renderApp } from './harness.js';

describe('debug', () => {
  it('load more debug longer flush', async () => {
    const fake = createFakeApi({ pageSize: 2 });
    const alice = fake.addUser({ handle: 'alice', password: 'x', displayName: '', bio: '' });
    fake.addPost(alice.id, 'Post 1');
    fake.addPost(alice.id, 'Post 2');
    fake.addPost(alice.id, 'Post 3');
    const { press, lastFrame, unmount } = renderApp({ fake });
    await flush();
    press('g');
    await flush();
    press('l');
    await flush();
    press('n');
    await flush(300);
    console.log('FRAME', lastFrame());
    unmount();
  });
});
