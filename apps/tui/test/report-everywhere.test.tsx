import { describe, expect, it } from 'vitest';

import { hintsFor } from '../src/app/keymap.js';
import { createFakeApi, expectFrame, flush, KEY, renderApp } from './harness.js';

/**
 * B-112 follow-up: reporting is possible AT ANY TIME from ANY screen — `!` opens the
 * beta issue reporter (the same screen `:report` reaches) from everywhere the shell
 * owns the keyboard, suppressed only where free-typing needs `!` (legacy text-entry
 * screens consume their own printable input before the shell handler runs). Where a
 * screen gives `!` its targeted meaning — the focused post (`PostList`) or profile
 * (`ProfileScreen`) — that handler claims the keypress first and the global stands
 * down for exactly that keypress.
 *
 * Deliberately suppressed-by-design overlays are not regressions: the command palette
 * and preferences consume printable input in their own layers (typing), and a pending
 * y/n `ConfirmDialog` consumes everything until answered.
 */

async function loginAs(
  press: (input: string) => void,
  lastFrame: () => string | undefined,
): Promise<void> {
  press('L');
  await flush();
  press('alice');
  await flush();
  press(KEY.enter);
  await flush();
  press('x');
  await flush();
  press(KEY.enter);
  await expectFrame(lastFrame, '· @alice');
  await flush();
}

describe('global issue reporter (!)', () => {
  it('opens from the local timeline while signed out', async () => {
    const { press, lastFrame, unmount } = renderApp();
    await expectFrame(lastFrame, 'Reading as a guest');

    press('!');

    await expectFrame(lastFrame, 'Report an issue');
    unmount();
  });

  it('opens from home while signed in', async () => {
    const fake = createFakeApi();
    fake.addUser({ handle: 'alice', password: 'x', displayName: '', bio: '' });
    const { press, lastFrame, unmount } = renderApp({ fake });
    await flush();
    await loginAs(press, lastFrame);
    await expectFrame(lastFrame, 'Home');

    press('!');

    await expectFrame(lastFrame, 'Report an issue');
    unmount();
  });

  it('opens from the bookmarks screen — a third, non-text base screen', async () => {
    const fake = createFakeApi();
    fake.addUser({ handle: 'alice', password: 'x', displayName: '', bio: '' });
    const { press, lastFrame, unmount } = renderApp({ fake });
    await flush();
    await loginAs(press, lastFrame);
    press('g');
    await flush(60);
    press('b');
    await expectFrame(lastFrame, 'Bookmarks');
    await flush();

    press('!');

    await expectFrame(lastFrame, 'Report an issue');
    unmount();
  });

  it('falls through to the global reporter when the targeted one cannot open (signed out)', async () => {
    const fake = createFakeApi();
    const bob = fake.addUser({ handle: 'bob', password: 'x', displayName: '', bio: '' });
    fake.addPost(bob.id, 'Bob post');
    const { press, lastFrame, unmount } = renderApp({ fake });
    await expectFrame(lastFrame, 'Bob post'); // feed loaded, a row is selectable
    await flush(); // let Ink's raw-mode churn from the load settle before pressing
    press('p'); // open bob's profile
    await expectFrame(lastFrame, 'patches › Profile');
    await flush();

    // ProfileScreen's `!` targets the actor report, which needs a session — with
    // nothing to open, the keypress is not claimed and the global reporter fires.
    press('!');

    await expectFrame(lastFrame, 'Report an issue');
    unmount();
  });

  it('does not let a previous targeted report swallow the next unrelated !', async () => {
    const fake = createFakeApi();
    fake.addUser({ handle: 'alice', password: 'x', displayName: '', bio: '' });
    const bob = fake.addUser({ handle: 'bob', password: 'x', displayName: '', bio: '' });
    fake.addPost(bob.id, 'Bob spammy post');
    const { press, lastFrame, unmount } = renderApp({ fake });
    await flush();
    await loginAs(press, lastFrame);
    press('g');
    await flush(60);
    press('l');
    await expectFrame(lastFrame, 'Bob spammy post');
    await flush();

    press('!'); // targeted: reports Bob's post (the list has a selected row)
    await expectFrame(lastFrame, 'Report post');
    unmount();
  });

  it('reaches the shell reporter from an empty list, where no row can claim !', async () => {
    // The other half of the precedence story: with no selected row there is nothing
    // for a targeted `!` to open, so the keypress reaches the shell untouched — and
    // nothing a targeted report did on some *other* screen can leak into this one,
    // because the claim expires within the keypress that set it.
    const fake = createFakeApi();
    fake.addUser({ handle: 'alice', password: 'x', displayName: '', bio: '' });
    const bob = fake.addUser({ handle: 'bob', password: 'x', displayName: '', bio: '' });
    fake.addPost(bob.id, 'Bob spammy post');
    const { press, lastFrame, unmount } = renderApp({ fake });
    await flush();
    await loginAs(press, lastFrame);
    press('g');
    await flush(60);
    press('b'); // bookmarks — empty, never seeded
    await expectFrame(lastFrame, 'Bookmarks');
    await flush();

    press('!');

    await expectFrame(lastFrame, 'Report an issue');
    unmount();
  });

  it('keeps ! typing into compose instead of opening the reporter', async () => {
    const fake = createFakeApi();
    fake.addUser({ handle: 'alice', password: 'x', displayName: '', bio: '' });
    const { press, lastFrame, unmount } = renderApp({ fake });
    await flush();
    await loginAs(press, lastFrame);

    press('C'); // full compose
    await expectFrame(lastFrame, 'Ctrl+A attach');
    press('h');
    await flush();
    press('i');
    await flush();
    press('!');
    await flush();

    const frame = await expectFrame(lastFrame, 'hi!');
    expect(frame).toContain('Ctrl+A attach');
    expect(frame).not.toContain('Report an issue');
    unmount();
  });

  it('keeps ! typing into search instead of opening the reporter', async () => {
    const fake = createFakeApi();
    fake.addUser({ handle: 'alice', password: 'x', displayName: '', bio: '' });
    const { press, lastFrame, unmount } = renderApp({ fake });
    await flush();
    await loginAs(press, lastFrame);

    press('/');
    await expectFrame(lastFrame, 'people/posts');
    await flush();
    press('!');
    await flush();

    expect(lastFrame()).not.toContain('Report an issue');
    unmount();
  });

  it('defers to the targeted post report when a row is selected', async () => {
    const fake = createFakeApi();
    fake.addUser({ handle: 'alice', password: 'x', displayName: '', bio: '' });
    const bob = fake.addUser({ handle: 'bob', password: 'x', displayName: '', bio: '' });
    fake.addPost(bob.id, 'Bob spammy post');
    const { press, lastFrame, unmount } = renderApp({ fake });
    await flush();
    await loginAs(press, lastFrame);
    press('g');
    await flush(60);
    press('l');
    await expectFrame(lastFrame, 'Bob spammy post');

    press('!');

    const frame = await expectFrame(lastFrame, 'Report post');
    expect(frame).not.toContain('Report an issue');
    unmount();
  });

  it('shows the permanent ribbon affordance on every non-text screen', () => {
    for (const screen of ['home', 'local', 'bookmarks', 'thread', 'notifications'] as const) {
      const hints = hintsFor(screen, { authenticated: false, canGoBack: true });
      expect(hints, screen).toContain('! report');
    }
    // Text-entry screens stand down — their hint line must say so too.
    const composeHints = hintsFor('compose', { authenticated: true, canGoBack: true });
    expect(composeHints).not.toContain('! report');
  });
});
