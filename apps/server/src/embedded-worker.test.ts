import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { embeddedWorkerEnabled, startEmbeddedWorker } from './embedded-worker.js';

describe('embeddedWorkerEnabled', () => {
  it('is off unless WORKER_IN_PROCESS is exactly "true"', () => {
    expect(embeddedWorkerEnabled({})).toBe(false);
    expect(embeddedWorkerEnabled({ WORKER_IN_PROCESS: 'false' })).toBe(false);
    expect(embeddedWorkerEnabled({ WORKER_IN_PROCESS: 'true' })).toBe(true);
  });
});

describe('startEmbeddedWorker', () => {
  it('spawns the entrypoint with metrics disabled and stops it on SIGTERM', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'embedded-worker-'));
    const script = join(dir, 'main.js');
    writeFileSync(
      script,
      "console.log('metrics=' + process.env.METRICS_ENABLED);\n" +
        "process.on('SIGTERM', () => process.exit(0));\n" +
        'setInterval(() => {}, 1000);\n',
    );
    const logs: string[] = [];
    const worker = startEmbeddedWorker({ entrypoint: script, log: (m) => logs.push(m) });
    await new Promise((r) => setTimeout(r, 500));
    await worker.stop();
    expect(logs[0]).toContain('embedded worker started');
    expect(logs.some((m) => m.includes('code=0'))).toBe(true);
  });
});
