import type { PatchesPage } from '@patches/domain';
import { describe, expect, it } from 'vitest';

import { createFakeApi, expectFrame, flush, KEY, renderApp, waitForFrame } from './harness.js';

/**
 * Client halves of B-024 (`Friends` page block via `ListMutualFollows`) and B-028
 * (following a remote `user@domain` account via `ResolveActor`).
 */

async function loginAs(
  press: (input: string) => void,
  lastFrame: () => string | undefined,
  handle: string,
  password: string,
): Promise<void> {
  press('L');
  await flush();
  press(handle);
  await flush();
  press(KEY.enter);
  await flush();
  press(password);
  await flush();
  press(KEY.enter);
  // Login runs a real Promise chain — wait for the status bar's badge rather than a
  // fixed sleep (same reasoning as `apps/tui/test/pages.test.tsx`'s `loginAs`).
  await expectFrame(lastFrame, `· @${handle}`);
  await flush();
}

/** Opens the caller's own page (`g v`) — the shortest path to `PageScreen` in a test. */
async function openOwnPage(press: (input: string) => void): Promise<void> {
  press('g');
  await flush();
  press('v');
  await flush(60);
}

describe('Friends page block (B-024)', () => {
  it('lists mutual follows, not a one-directional follow', async () => {
    const fake = createFakeApi();
    const alice = fake.addUser({ handle: 'alice', password: 'x', displayName: '', bio: '' });
    const bob = fake.addUser({ handle: 'bob', password: 'y', displayName: '', bio: '' });
    const carol = fake.addUser({ handle: 'carol', password: 'z', displayName: '', bio: '' });
    fake.addFollow(alice.id, bob.id);
    fake.addFollow(bob.id, alice.id); // mutual
    fake.addFollow(carol.id, alice.id); // one-directional: carol -> alice, not back
    const doc: PatchesPage = {
      version: 1,
      pages: [{ slug: 'index', title: 'Home', blocks: [{ type: 'Friends', limit: 8 }] }],
    };
    fake.addPage('alice', 'index', doc);

    const { press, lastFrame, unmount } = renderApp({ fake });
    await flush();
    await loginAs(press, lastFrame, 'alice', 'x');
    await openOwnPage(press);

    const frame = await expectFrame(lastFrame, '@bob');
    expect(frame).not.toContain('@carol');
    unmount();
  });

  it('shows an empty state with no mutual follows', async () => {
    const fake = createFakeApi();
    fake.addUser({ handle: 'alice', password: 'x', displayName: '', bio: '' });
    const doc: PatchesPage = {
      version: 1,
      pages: [{ slug: 'index', title: 'Home', blocks: [{ type: 'Friends', limit: 8 }] }],
    };
    fake.addPage('alice', 'index', doc);

    const { press, lastFrame, unmount } = renderApp({ fake });
    await flush();
    await loginAs(press, lastFrame, 'alice', 'x');
    await openOwnPage(press);

    await expectFrame(lastFrame, 'No mutual follows yet.');
    unmount();
  });
});

describe('Resolve a remote actor by acct (B-028)', () => {
  it('resolves user@domain and Enter opens the profile', async () => {
    const fake = createFakeApi();
    fake.addUser({ handle: 'alice', password: 'x', displayName: '', bio: '' });
    fake.addRemoteActor('bob@remote.example', {
      id: 'actor-remote-bob',
      handle: 'bob@remote.example',
      displayName: 'Remote Bob',
      bio: '',
      locationText: '',
      websiteUrl: '',
      avatar: undefined,
      isLocal: false,
      joinedAt: undefined,
      counts: undefined,
      nameplate: undefined,
      flair: undefined,
      pinnedPostIds: [],
    });

    const { press, lastFrame, unmount } = renderApp({ fake });
    await flush();
    await loginAs(press, lastFrame, 'alice', 'x');
    press('/');
    await expectFrame(lastFrame, 'Search');

    press('bob@remote.example');
    await flush();
    press(KEY.enter);
    await expectFrame(lastFrame, '@bob@remote.example');

    press(KEY.enter);
    const profileFrame = await waitForFrame(lastFrame, (text) => text.includes('Remote Bob'));
    expect(profileFrame).toContain('@bob@remote.example');
    unmount();
  });

  it('shows a friendly message when the node has federation disabled', async () => {
    const fake = createFakeApi({ federationEnabled: false });
    fake.addUser({ handle: 'alice', password: 'x', displayName: '', bio: '' });

    const { press, lastFrame, unmount } = renderApp({ fake });
    await flush();
    await loginAs(press, lastFrame, 'alice', 'x');
    press('/');
    await expectFrame(lastFrame, 'Search');

    press('bob@remote.example');
    await flush();
    press(KEY.enter);

    await expectFrame(lastFrame, 'This node has federation disabled.');
    unmount();
  });

  it('surfaces the server-side local-domain rejection', async () => {
    // Default `FakeApiHandle` local domain is derived from `target`
    // (`patches.test:50051` -> `patches.test`) — an acct on that domain isn't
    // "remote" at all, and the real `ActorService.resolveActor` rejects it.
    const fake = createFakeApi();
    fake.addUser({ handle: 'alice', password: 'x', displayName: '', bio: '' });

    const { press, lastFrame, unmount } = renderApp({ fake });
    await flush();
    await loginAs(press, lastFrame, 'alice', 'x');
    press('/');
    await expectFrame(lastFrame, 'Search');

    press('carol@patches.test');
    await flush();
    press(KEY.enter);

    await expectFrame(lastFrame, 'remote domain');
    unmount();
  });

  it('asks a signed-out viewer to sign in before resolving a remote acct', async () => {
    const fake = createFakeApi();

    const { press, lastFrame, unmount } = renderApp({ fake });
    await flush();
    press('/');
    await expectFrame(lastFrame, 'Search');

    press('bob@remote.example');
    await flush();
    press(KEY.enter);

    await expectFrame(lastFrame, 'Sign in to look up a remote account.');
    unmount();
  });
});
