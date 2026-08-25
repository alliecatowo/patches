import { describe, expect, it } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  readBoundedLogTail,
  safeLogLine,
  safeLogOutput,
  writeSafeLogOutput,
} from './log-redaction.js';

describe('structured harness log redaction', () => {
  it('fails closed for non-JSON and omits arbitrary nested objects', () => {
    expect(safeLogLine('plain text password=hunter2')).toBeUndefined();
    const line = safeLogLine(
      JSON.stringify({
        time: 1,
        level: 'info',
        event: 'ready',
        requestId: 'request-a',
        arbitrary: { body: 'private DM body', token: 'secret-token' },
      }),
    );
    expect(line).toBe(JSON.stringify({ time: 1, level: 'info', event: 'ready' }));
  });

  it('scrubs hostile strings and filters by exact request ID with bounded output', () => {
    const wanted = '123e4567-e89b-42d3-a456-426614174000';
    const content = [
      JSON.stringify({ requestId: 'other', msg: 'safe' }),
      JSON.stringify({
        requestId: wanted,
        msg: 'email a@example.com Bearer abc password=hunter2 https://x.test/?token=bad 123e4567-e89b-12d3-a456-426614174000',
      }),
      JSON.stringify({ requestId: wanted, msg: 'direct message body hello' }),
    ].join('\n');
    const source = { service: 'server', content, truncated: false, bytesRead: content.length };
    const output = safeLogOutput([source], {
      requestId: wanted,
      limit: 1,
    });
    expect(output).toHaveLength(1);
    expect(output[0]).not.toMatch(/example|hunter2|token=bad|message body/iu);
    let stdout = '';
    writeSafeLogOutput([source], { requestId: wanted, limit: 2 }, (chunk) => {
      stdout += chunk;
    });
    expect(stdout).not.toMatch(/example|hunter2|token=bad|message body/iu);
  });

  it('omits invalid secret-bearing correlation fields', () => {
    const line = safeLogLine(
      JSON.stringify({
        event: 'rpc.completed',
        requestId: 'secret-token-material',
        traceId: 'hunter2hunter2hunter2hunter2hunt',
      }),
    );
    expect(line).toBe(JSON.stringify({ event: 'rpc.completed' }));
  });

  it('reads only a bounded tail and emits an explicit truncation record', async () => {
    const root = await mkdtemp(join(tmpdir(), 'patches-log-tail-'));
    try {
      const path = join(root, 'large.log');
      await writeFile(
        path,
        `${'not-json\n'.repeat(100_000)}${JSON.stringify({ event: 'server.ready' })}\n`,
      );
      const source = await readBoundedLogTail(path, { maxBytes: 4_096, maxLines: 20 });
      expect(source.bytesRead).toBe(4_096);
      expect(source.truncated).toBe(true);
      const output = safeLogOutput([source], { limit: 10 });
      expect(output[0]).toBe(JSON.stringify({ event: 'logs.truncated', status: 'truncated' }));
      expect(output.at(-1)).toBe(JSON.stringify({ event: 'server.ready' }));
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
