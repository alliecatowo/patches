import { render } from 'ink-testing-library';

type RenderResult = ReturnType<typeof render>;

import { App } from '../src/app/App.js';
import { MemoryCredentialStore, type CredentialStore } from '../src/auth/credential-store.js';
import { MemoryDraftStore, type DraftStore } from '../src/compose/draft-store.js';
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
} as const;

export interface RenderAppOptions {
  /** Reuse a `FakeApiHandle` seeded before render (e.g. with `addUser`/`addPost`). */
  fake?: FakeApiHandle;
  /** Shorthand for `fake` when the caller doesn't need to keep a handle around. */
  fakeOptions?: FakeApiOptions;
  credentialStore?: CredentialStore;
  draftStore?: DraftStore;
  env?: NodeJS.ProcessEnv;
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
    <App api={fake.api} credentialStore={credentialStore} draftStore={draftStore} env={env} />,
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

export { createFakeApi, type FakeApiHandle, type FakeApiOptions } from './fake-api.js';
