import { describe, expect, it, vi } from 'vitest';

import { printJson, printTable, type Row } from './output.js';

function captureStdout(): { calls: string[]; restore: () => void } {
  const calls: string[] = [];
  const spy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk: unknown) => {
    calls.push(String(chunk));
    return true;
  });
  return { calls, restore: () => spy.mockRestore() };
}

describe('printJson', () => {
  it('writes pretty-printed JSON followed by a newline', () => {
    const { calls, restore } = captureStdout();
    printJson({ id: '1' });
    restore();
    expect(calls.join('')).toBe('{\n  "id": "1"\n}\n');
  });
});

describe('printTable', () => {
  it('prints "(none)" for an empty row set', () => {
    const { calls, restore } = captureStdout();
    printTable([]);
    restore();
    expect(calls.join('')).toBe('(none)\n');
  });

  it('right-pads columns to their widest value, with a header and separator', () => {
    const rows: Row[] = [
      { id: 'a', status: 'ACTIVE' },
      { id: 'longer-id', status: 'SUSPENDED' },
    ];
    const { calls, restore } = captureStdout();
    printTable(rows);
    restore();
    const lines = calls.join('').trimEnd().split('\n');
    expect(lines[0]).toBe('id         status');
    expect(lines[1]).toBe('---------  ---------');
    expect(lines[2]).toBe('a          ACTIVE');
    expect(lines[3]).toBe('longer-id  SUSPENDED');
  });

  it('renders null as "-" and a Date as its ISO string', () => {
    const date = new Date('2026-01-01T00:00:00.000Z');
    const { calls, restore } = captureStdout();
    printTable([{ note: null, createdAt: date }]);
    restore();
    const lines = calls.join('').trimEnd().split('\n');
    expect(lines[2]).toBe('-     2026-01-01T00:00:00.000Z');
  });
});
