import { EventEmitter } from 'node:events';

import { describe, expect, it, vi } from 'vitest';

import { installMediaCleanup } from './cleanup.js';
import type { TerminalMediaRenderer } from './renderer.js';

/** A renderer whose `releaseAll` is a spy we can hold onto separately. */
function stubRenderer(): { renderer: TerminalMediaRenderer; releaseAll: ReturnType<typeof vi.fn> } {
  const releaseAll = vi.fn();
  const renderer: TerminalMediaRenderer = {
    kind: 'kitty',
    prepare: () => Promise.reject(new Error('not used in these tests')),
    placeholderRows: () => [],
    release: () => undefined,
    releaseAll,
  };
  return { renderer, releaseAll };
}

/** Stands in for `process`; an EventEmitter is exactly the surface we use. */
function fakeProcess(): NodeJS.Process {
  return new EventEmitter() as unknown as NodeJS.Process;
}

describe('installMediaCleanup', () => {
  it('releases every image on process exit', () => {
    const { renderer, releaseAll } = stubRenderer();
    const proc = fakeProcess();
    installMediaCleanup(renderer, { proc, exit: () => undefined });
    proc.emit('exit', 0);
    expect(releaseAll).toHaveBeenCalledTimes(1);
  });

  it('unmounts Ink before releasing, so alternate-screen teardown cannot swallow the deletes', () => {
    const { renderer, releaseAll } = stubRenderer();
    const proc = fakeProcess();
    const order: string[] = [];
    releaseAll.mockImplementation(() => order.push('release'));
    installMediaCleanup(renderer, {
      proc,
      onSignal: () => order.push('unmount'),
      exit: () => order.push('exit'),
    });
    proc.emit('SIGINT', 'SIGINT');
    expect(order).toEqual(['unmount', 'release', 'exit']);
  });

  it('releases at most once across a signal followed by exit', () => {
    const { renderer, releaseAll } = stubRenderer();
    const proc = fakeProcess();
    installMediaCleanup(renderer, { proc, exit: () => undefined });
    proc.emit('SIGTERM', 'SIGTERM');
    proc.emit('exit', 0);
    expect(releaseAll).toHaveBeenCalledTimes(1);
  });

  it('handles SIGINT, SIGTERM and SIGHUP by default', () => {
    const { renderer } = stubRenderer();
    const proc = fakeProcess();
    installMediaCleanup(renderer, { proc, exit: () => undefined });
    for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP', 'exit']) {
      expect(proc.listenerCount(signal)).toBe(1);
    }
  });

  it('removes every listener when disposed', () => {
    const { renderer, releaseAll } = stubRenderer();
    const proc = fakeProcess();
    const dispose = installMediaCleanup(renderer, { proc, exit: () => undefined });
    dispose();
    expect(proc.eventNames()).toEqual([]);
    proc.emit('exit', 0);
    expect(releaseAll).not.toHaveBeenCalled();
  });
});
