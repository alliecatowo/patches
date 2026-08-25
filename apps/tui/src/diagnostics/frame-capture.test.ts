import { describe, expect, it, vi } from 'vitest';

import { attachFrameCapture } from './frame-capture.js';
import type { DiagnosticsReporter } from './reporter.js';

function fakeReporter(): DiagnosticsReporter & { frames: string[] } {
  const frames: string[] = [];
  return {
    frames,
    recordBreadcrumb: vi.fn(),
    recordRpcFailure: vi.fn(),
    recordEvent: vi.fn(),
    setFrame: vi.fn((text: string) => {
      frames.push(text);
    }),
    snapshot: vi.fn(),
  } as unknown as DiagnosticsReporter & { frames: string[] };
}

interface WritableFake {
  write: (chunk: string | Uint8Array) => boolean;
  writes: string[];
}

function fakeStream(): WritableFake {
  const stream: WritableFake = {
    writes: [],
    write(chunk) {
      stream.writes.push(typeof chunk === 'string' ? chunk : '');
      return true;
    },
  };
  return stream;
}

describe('attachFrameCapture', () => {
  it('forwards every write untouched', () => {
    const stream = fakeStream();
    const reporter = fakeReporter();
    attachFrameCapture(stream, { reporter });
    expect(stream.write('hello\n')).toBe(true);
    expect(stream.writes).toEqual(['hello\n']);
  });

  it('captures the visible text of written frames, ANSI stripped', async () => {
    const stream = fakeStream();
    const reporter = fakeReporter();
    attachFrameCapture(stream, { reporter });
    stream.write('\u001B[31mhome timeline\u001B[0m — newest first\n');
    await vi.waitFor(() => {
      expect(reporter.frames).toContain('home timeline — newest first');
    });
  });

  it('batches multiple writes of one render into one frame entry', async () => {
    const stream = fakeStream();
    const reporter = fakeReporter();
    attachFrameCapture(stream, { reporter });
    stream.write('row one\n');
    stream.write('row two\n');
    stream.write('row three\n');
    await vi.waitFor(() => {
      expect(reporter.frames.length).toBe(1);
    });
    expect(reporter.frames[0]).toBe('row one\nrow two\nrow three');
  });

  it('holds back a partial trailing line until its newline arrives', async () => {
    const stream = fakeStream();
    const reporter = fakeReporter();
    attachFrameCapture(stream, { reporter });
    stream.write('com');
    stream.write('pose\n');
    await vi.waitFor(() => {
      expect(reporter.frames).toContain('compose');
    });
    expect(reporter.frames).toHaveLength(1);
  });

  it('is idempotent per stream and detach restores the original write', () => {
    const stream = fakeStream();
    const reporter = fakeReporter();
    const first = attachFrameCapture(stream, { reporter });
    const second = attachFrameCapture(stream, { reporter });
    expect(second).toBe(first);
    first.detach();
    const before = stream.writes.length;
    expect(stream.write('after detach\n')).toBe(true);
    expect(stream.writes.length).toBe(before + 1);
  });
});
