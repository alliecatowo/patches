import { render } from 'ink-testing-library';

type RenderResult = ReturnType<typeof render>;

import { App, type AppProps } from '../src/app/App.js';
import { MemoryCredentialStore, type CredentialStore } from '../src/auth/credential-store.js';
import { MemoryDraftStore, type DraftStore } from '../src/compose/draft-store.js';
import { MemoryPageDraftStore } from '../src/pages/draft-store.js';
import { createFakeApi, type FakeApiHandle, type FakeApiOptions } from './fake-api.js';

/**
 * Raw byte sequences for the keys screens bind, for `press()`/`stdin.write()` —
 * mirrors `ink/build/parse-keypress.js`'s single-byte cases (escape 0x1b,
 * backspace 0x7f, Ctrl+S 0x13).
 */
export const KEY = {
  enter: '\r',
  escape: '',
  tab: '\t',
  backspace: '',
  ctrlS: '',
  ctrlA: '',
  /** CSI arrow keys, as a real terminal sends them. */
  up: '[A',
  down: '[B',
  pageUp: '[5~',
  pageDown: '[6~',
} as const;

export interface RenderAppOptions {
  /** Reuse a `FakeApiHandle` seeded before render (e.g. with `addUser`/`addPost`). */
  fake?: FakeApiHandle;
  /** Shorthand for `fake` when the caller doesn't need to keep a handle around. */
  fakeOptions?: FakeApiOptions;
  credentialStore?: CredentialStore;
  draftStore?: DraftStore;
  env?: NodeJS.ProcessEnv;
  pageEditorOptions?: AppProps['pageEditorOptions'];
}

export interface RenderAppResult extends RenderResult {
  fake: FakeApiHandle;
  /** Convenience alias for `stdin.write` — `press('c')`, `press(KEY.enter)`, etc. */
  press: (input: string) => void;
}

/**
 * Renders the real `App` against a `FakeApiHandle` instead of a live gRPC
 * server (B-015) — every TUI screen test should go through this rather than
 * hand-rolling a partial `PatchesApi` fake.
 */
export function renderApp(options: RenderAppOptions = {}): RenderAppResult {
  const fake = options.fake ?? createFakeApi(options.fakeOptions);
  const credentialStore = options.credentialStore ?? new MemoryCredentialStore();
  const draftStore = options.draftStore ?? new MemoryDraftStore();
  const env = options.env ?? {};

  const rendered = render(
    <App
      api={fake.api}
      credentialStore={credentialStore}
      draftStore={draftStore}
      env={env}
      pageDraftStore={new MemoryPageDraftStore()}
      pageEditorOptions={options.pageEditorOptions}
    />,
  );

  return {
    ...rendered,
    fake,
    press: (input: string) => rendered.stdin.write(input),
  };
}

/** Lets a pending promise settle and React flush the resulting state update. */
export async function flush(ms = 20): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Polls `lastFrame()` until `predicate` holds, instead of sleeping a fixed
 * duration — under load a fixed `flush()` can resolve before the pending
 * promise/render actually settles, which is the source of the intermittent
 * `screens.test.tsx` failures this replaces. Throws with the last observed
 * frame on timeout so failures are debuggable.
 */
export async function waitForFrame(
  lastFrame: () => string | undefined,
  predicate: (frame: string) => boolean,
  timeoutMs = 2000,
): Promise<string> {
  const stepMs = 10;
  const deadline = Date.now() + timeoutMs;
  let frame = lastFrame() ?? '';
  while (!predicate(frame)) {
    if (Date.now() >= deadline) {
      throw new Error(`waitForFrame: timed out after ${timeoutMs}ms. Last frame:\n${frame}`);
    }
    await new Promise((resolve) => setTimeout(resolve, stepMs));
    frame = lastFrame() ?? '';
  }
  return frame;
}

/** Shorthand: waits until the frame contains `text`, returns the frame. */
export async function expectFrame(
  lastFrame: () => string | undefined,
  text: string,
  timeoutMs = 2000,
): Promise<string> {
  return waitForFrame(lastFrame, (frame) => frame.includes(text), timeoutMs);
}

export { createFakeApi, type FakeApiHandle, type FakeApiOptions } from './fake-api.js';
