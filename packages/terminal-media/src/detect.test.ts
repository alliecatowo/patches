import { EventEmitter } from 'node:events';

import { describe, expect, it, vi } from 'vitest';

import {
  DA1_QUERY,
  GRAPHICS_QUERY,
  detectTerminalGraphics,
  looksGraphicsCapable,
  parseProbeResponse,
  terminalHint,
  tmuxAllowsPassthrough,
  type ProbeStdin,
  type ProbeStdout,
} from './detect.js';

const ESC = '\x1b';
const GRAPHICS_OK_REPLY = `${ESC}_Gi=31;OK${ESC}\\`;
const GRAPHICS_ERROR_REPLY = `${ESC}_Gi=31;ENOTSUPPORTED:no graphics${ESC}\\`;
const DA1_REPLY = `${ESC}[?62;4;6;22c`;
const CELL_SIZE_REPLY = `${ESC}[6;34;14t`;

/** A stdin stand-in that records raw-mode transitions and replays a scripted reply. */
class FakeStdin extends EventEmitter implements ProbeStdin {
  isTTY = true;
  isRaw = false;
  readonly rawModeCalls: boolean[] = [];
  resumed = false;
  paused = false;

  setRawMode = (mode: boolean): void => {
    this.rawModeCalls.push(mode);
    this.isRaw = mode;
  };

  resume(): this {
    this.resumed = true;
    return this;
  }

  pause(): this {
    this.paused = true;
    return this;
  }
}

/** A stdout stand-in that answers the probe with a scripted reply. */
function fakeStdout(stdin: FakeStdin, reply: string | undefined): ProbeStdout {
  return {
    isTTY: true,
    columns: 120,
    rows: 40,
    write(data: string) {
      if (reply === undefined) return true;
      expect(data).toContain(GRAPHICS_QUERY);
      expect(data.endsWith(DA1_QUERY)).toBe(true);
      setImmediate(() => stdin.emit('data', Buffer.from(reply, 'latin1')));
      return true;
    },
  };
}

describe('parseProbeResponse', () => {
  it('recognises a graphics OK reply', () => {
    const result = parseProbeResponse(GRAPHICS_OK_REPLY + DA1_REPLY);
    expect(result.graphicsOk).toBe(true);
    expect(result.graphicsError).toBe(false);
    expect(result.da1).toBe(true);
  });

  it('recognises a graphics error reply as "protocol answered, but not OK"', () => {
    const result = parseProbeResponse(GRAPHICS_ERROR_REPLY + DA1_REPLY);
    expect(result.graphicsOk).toBe(false);
    expect(result.graphicsError).toBe(true);
  });

  it('treats a bare DA1 reply as no graphics support', () => {
    const result = parseProbeResponse(DA1_REPLY);
    expect(result.graphicsOk).toBe(false);
    expect(result.graphicsError).toBe(false);
    expect(result.da1).toBe(true);
  });

  it('parses CSI 16 t cell size as height-then-width', () => {
    const result = parseProbeResponse(CELL_SIZE_REPLY + GRAPHICS_OK_REPLY + DA1_REPLY);
    expect(result.cellHeightPx).toBe(34);
    expect(result.cellWidthPx).toBe(14);
  });

  it('leaves cell size absent when the terminal did not answer CSI 16 t', () => {
    const result = parseProbeResponse(GRAPHICS_OK_REPLY + DA1_REPLY);
    expect(result.cellWidthPx).toBeUndefined();
    expect(result.cellHeightPx).toBeUndefined();
  });

  it('ignores a zero-sized cell report', () => {
    const result = parseProbeResponse(`${ESC}[6;0;0t`);
    expect(result.cellWidthPx).toBeUndefined();
    expect(result.cellHeightPx).toBeUndefined();
  });

  it('finds replies interleaved with real keystrokes', () => {
    const result = parseProbeResponse(`jk${CELL_SIZE_REPLY}q${GRAPHICS_OK_REPLY}x${DA1_REPLY}`);
    expect(result).toMatchObject({ graphicsOk: true, da1: true, cellWidthPx: 14 });
  });
});

describe('looksGraphicsCapable', () => {
  it.each([
    [{ TERM: 'xterm-ghostty' }, true],
    [{ TERM: 'xterm-kitty' }, true],
    [{ TERM: 'xterm-256color', TERM_PROGRAM: 'ghostty' }, true],
    [{ TERM: 'xterm-256color', GHOSTTY_RESOURCES_DIR: '/usr/share/ghostty' }, true],
    [{ TERM: 'xterm-256color', KITTY_WINDOW_ID: '1' }, true],
    [{ TERM: 'xterm-256color', TERM_PROGRAM: 'WezTerm' }, true],
    [{ TERM: 'xterm-256color' }, false],
    [{}, false],
  ])('%o -> %s', (env, expected) => {
    expect(looksGraphicsCapable(env)).toBe(expected);
  });
});

describe('terminalHint', () => {
  it('names ghostty with its version', () => {
    expect(
      terminalHint({
        TERM: 'xterm-ghostty',
        TERM_PROGRAM: 'ghostty',
        TERM_PROGRAM_VERSION: '1.3.1',
      }),
    ).toBe('ghostty 1.3.1');
  });

  it('flags tmux before anything else, because tmux is what will eat the APC', () => {
    expect(terminalHint({ TERM: 'xterm-ghostty', TMUX: '/tmp/tmux-1000/default,1,0' })).toBe(
      'tmux (TERM=xterm-ghostty)',
    );
  });

  it('falls back to TERM', () => {
    expect(terminalHint({ TERM: 'dumb' })).toBe('TERM=dumb');
  });
});

describe('tmuxAllowsPassthrough', () => {
  it('is vacuously true outside tmux', () => {
    expect(tmuxAllowsPassthrough({})).toBe(true);
  });
});

describe('detectTerminalGraphics', () => {
  it('reports kitty support and cell size when the terminal answers OK', async () => {
    const stdin = new FakeStdin();
    const caps = await detectTerminalGraphics({
      stdin,
      stdout: fakeStdout(stdin, CELL_SIZE_REPLY + GRAPHICS_OK_REPLY + DA1_REPLY),
      env: { TERM: 'xterm-ghostty', TERM_PROGRAM: 'ghostty' },
      timeoutMs: 1000,
    });
    expect(caps.kitty).toBe(true);
    expect(caps.cellWidthPx).toBe(14);
    expect(caps.cellHeightPx).toBe(34);
    expect(caps.columns).toBe(120);
    expect(caps.rows).toBe(40);
  });

  it('restores the previous raw mode and pauses stdin afterwards', async () => {
    const stdin = new FakeStdin();
    await detectTerminalGraphics({
      stdin,
      stdout: fakeStdout(stdin, GRAPHICS_OK_REPLY + DA1_REPLY),
      env: {},
      timeoutMs: 1000,
    });
    expect(stdin.rawModeCalls).toEqual([true, false]);
    expect(stdin.isRaw).toBe(false);
    expect(stdin.paused).toBe(true);
    expect(stdin.listenerCount('data')).toBe(0);
  });

  it('reports no support when only DA1 comes back', async () => {
    const stdin = new FakeStdin();
    const caps = await detectTerminalGraphics({
      stdin,
      stdout: fakeStdout(stdin, DA1_REPLY),
      env: { TERM: 'xterm-256color' },
      timeoutMs: 1000,
    });
    expect(caps.kitty).toBe(false);
    expect(caps.termHint).toContain('no graphics reply');
  });

  it('gives up after the timeout when the terminal stays silent', async () => {
    const stdin = new FakeStdin();
    const caps = await detectTerminalGraphics({
      stdin,
      stdout: fakeStdout(stdin, undefined),
      env: {},
      timeoutMs: 20,
    });
    expect(caps.kitty).toBe(false);
    expect(caps.termHint).toContain('no reply before timeout');
    expect(stdin.rawModeCalls).toEqual([true, false]);
  });

  it('never throws on a non-TTY and never touches raw mode', async () => {
    const stdin = new FakeStdin();
    stdin.isTTY = false;
    const caps = await detectTerminalGraphics({
      stdin,
      stdout: { isTTY: false, write: () => true },
      env: { TERM: 'xterm-ghostty' },
    });
    expect(caps).toMatchObject({ kitty: false, columns: 80, rows: 24 });
    expect(caps.termHint).toContain('not a tty');
    expect(stdin.rawModeCalls).toEqual([]);
  });

  it('treats tmux without allow-passthrough as unsupported without probing', async () => {
    const stdin = new FakeStdin();
    const write = vi.fn(() => true);
    const caps = await detectTerminalGraphics({
      stdin,
      stdout: { isTTY: true, columns: 80, rows: 24, write },
      env: { TERM: 'xterm-ghostty', TMUX: '/tmp/tmux-1000/default,1,0' },
      tmuxPassthrough: () => false,
    });
    expect(caps.kitty).toBe(false);
    expect(caps.termHint).toContain('tmux without allow-passthrough');
    expect(write).not.toHaveBeenCalled();
  });

  it('probes normally inside tmux when passthrough is enabled', async () => {
    const stdin = new FakeStdin();
    const caps = await detectTerminalGraphics({
      stdin,
      stdout: fakeStdout(stdin, GRAPHICS_OK_REPLY + DA1_REPLY),
      env: { TERM: 'xterm-ghostty', TMUX: '/tmp/tmux-1000/default,1,0' },
      tmuxPassthrough: () => true,
      timeoutMs: 1000,
    });
    expect(caps.kitty).toBe(true);
  });

  it('flags tmux:true (B-007) once kitty is confirmed through tmux passthrough', async () => {
    const stdin = new FakeStdin();
    const caps = await detectTerminalGraphics({
      stdin,
      stdout: fakeStdout(stdin, GRAPHICS_OK_REPLY + DA1_REPLY),
      env: { TERM: 'xterm-ghostty', TMUX: '/tmp/tmux-1000/default,1,0' },
      tmuxPassthrough: () => true,
      timeoutMs: 1000,
    });
    expect(caps.tmux).toBe(true);
  });

  it('leaves tmux unset outside tmux', async () => {
    const stdin = new FakeStdin();
    const caps = await detectTerminalGraphics({
      stdin,
      stdout: fakeStdout(stdin, GRAPHICS_OK_REPLY + DA1_REPLY),
      env: { TERM: 'xterm-ghostty' },
      timeoutMs: 1000,
    });
    expect(caps.tmux).toBeUndefined();
  });

  it('leaves tmux unset when the probe never confirmed kitty, even inside tmux with passthrough on', async () => {
    const stdin = new FakeStdin();
    const caps = await detectTerminalGraphics({
      stdin,
      stdout: fakeStdout(stdin, GRAPHICS_ERROR_REPLY + DA1_REPLY),
      env: { TERM: 'xterm-ghostty', TMUX: '/tmp/tmux-1000/default,1,0' },
      tmuxPassthrough: () => true,
      timeoutMs: 1000,
    });
    expect(caps.kitty).toBe(false);
    expect(caps.tmux).toBeUndefined();
  });

  it('returns kitty:false when the stream refuses raw mode', async () => {
    const stdin = new FakeStdin();
    stdin.setRawMode = () => {
      throw new Error('EINVAL');
    };
    const caps = await detectTerminalGraphics({
      stdin,
      stdout: { isTTY: true, columns: 80, rows: 24, write: () => true },
      env: {},
    });
    expect(caps.kitty).toBe(false);
    expect(caps.termHint).toContain('probe failed');
  });
});
