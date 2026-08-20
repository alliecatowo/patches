import { EventEmitter } from 'node:events';

import { render } from 'ink';
import type { ReactElement } from 'react';

import { App, type AppProps } from '../src/app/App.js';
import { MemoryCredentialStore, type CredentialStore } from '../src/auth/credential-store.js';
import { MemoryDraftStore, type DraftStore } from '../src/compose/draft-store.js';
import { clearListCache } from '../src/hooks/usePaginatedPosts.js';
import { MemoryPageDraftStore } from '../src/pages/draft-store.js';
import { MemoryPreferenceStore } from '../src/preferences/store.js';
import { createFakeApi, type FakeApiHandle, type FakeApiOptions } from './fake-api.js';

/**
 * `ink-testing-library` hard-codes a 100-column stdout and reports no rows at all, so
 * nothing in it can exercise a *tier boundary* — and the whole point of P12-020/021 is
 * that presentation changes with size while history does not. This harness is the same
 * shape, with the two numbers under the test's control and a real `resize` event.
 */
class TestStdout extends EventEmitter {
  columns: number;
  rows: number;
  readonly frames: string[] = [];
  private last: string | undefined = undefined;

  constructor(columns: number, rows: number) {
    super();
    this.columns = columns;
    this.rows = rows;
  }

  write = (frame: string): void => {
    this.frames.push(frame);
    this.last = frame;
  };

  lastFrame = (): string | undefined => this.last;

  resize(columns: number, rows: number): void {
    this.columns = columns;
    this.rows = rows;
    this.emit('resize');
  }
}

class TestStdin extends EventEmitter {
  isTTY = true;
  private data: string | null = null;

  write = (data: string): void => {
    this.data = data;
    this.emit('readable');
    this.emit('data', data);
  };

  setEncoding(): void {
    // no-op; Ink only calls this to configure a real tty
  }
  setRawMode(): void {
    // no-op
  }
  resume(): void {
    // no-op
  }
  pause(): void {
    // no-op
  }
  ref(): void {
    // no-op
  }
  unref(): void {
    // no-op
  }
  read = (): string | null => {
    const { data } = this;
    this.data = null;
    return data;
  };
}

export interface WindowAppOptions {
  fake?: FakeApiHandle;
  fakeOptions?: FakeApiOptions;
  credentialStore?: CredentialStore;
  draftStore?: DraftStore;
  env?: NodeJS.ProcessEnv;
}

export interface WindowAppResult {
  fake: FakeApiHandle;
  lastFrame: () => string | undefined;
  press: (input: string) => void;
  resize: (columns: number, rows: number) => void;
  size: () => { columns: number; rows: number };
  unmount: () => void;
}

export interface WindowRenderResult {
  lastFrame: () => string | undefined;
  press: (input: string) => void;
  resize: (columns: number, rows: number) => void;
  size: () => { columns: number; rows: number };
  unmount: () => void;
}

/** Renders any element into a terminal of an exact, changeable size. */
export function renderInWindow(
  element: ReactElement,
  columns: number,
  rows: number,
): WindowRenderResult {
  const stdout = new TestStdout(columns, rows);
  const stdin = new TestStdin();
  const stderr = new TestStdout(columns, rows);

  const instance = render(element, {
    // The stubs implement exactly the surface Ink uses; `ink-testing-library` casts the
    // same way. `as unknown as` keeps this honest rather than reaching for `any`.
    stdout: stdout as unknown as NodeJS.WriteStream,
    stderr: stderr as unknown as NodeJS.WriteStream,
    stdin: stdin as unknown as NodeJS.ReadStream,
    debug: true,
    exitOnCtrlC: false,
    patchConsole: false,
  });

  return {
    lastFrame: stdout.lastFrame,
    press: (input) => stdin.write(input),
    resize: (nextColumns, nextRows) => stdout.resize(nextColumns, nextRows),
    size: () => ({ columns: stdout.columns, rows: stdout.rows }),
    unmount: () => instance.unmount(),
  };
}

export function renderAppInWindow(
  columns: number,
  rows: number,
  options: WindowAppOptions = {},
): WindowAppResult {
  // B-043's background-snapshot cache (`hooks/usePaginatedPosts.ts`) is module-level
  // and keyed on `api.target`, which repeats across fakes (`patches.test:50051`) —
  // without this, one test's seeded feed leaks into the next test's fresh app, the
  // same reasoning `test/harness.tsx`'s `renderApp()` already applies.
  clearListCache();
  const fake = options.fake ?? createFakeApi(options.fakeOptions);
  const stdout = new TestStdout(columns, rows);
  const stdin = new TestStdin();
  const stderr = new TestStdout(columns, rows);

  const element: ReactElement = (
    <App
      api={fake.api}
      credentialStore={options.credentialStore ?? new MemoryCredentialStore()}
      draftStore={options.draftStore ?? new MemoryDraftStore()}
      env={options.env ?? {}}
      pageDraftStore={new MemoryPageDraftStore()}
      preferenceStore={new MemoryPreferenceStore()}
    />
  );

  const instance = render(element, {
    // The stubs implement exactly the surface Ink uses; `ink-testing-library` casts the
    // same way. `as unknown as` keeps this honest rather than reaching for `any`.
    stdout: stdout as unknown as NodeJS.WriteStream,
    stderr: stderr as unknown as NodeJS.WriteStream,
    stdin: stdin as unknown as NodeJS.ReadStream,
    debug: true,
    exitOnCtrlC: false,
    patchConsole: false,
  });

  return {
    fake,
    lastFrame: stdout.lastFrame,
    press: (input) => stdin.write(input),
    resize: (nextColumns, nextRows) => stdout.resize(nextColumns, nextRows),
    size: () => ({ columns: stdout.columns, rows: stdout.rows }),
    unmount: () => instance.unmount(),
  };
}

export type { AppProps };
