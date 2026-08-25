import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdtemp, readFile, rm, stat, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { once } from 'node:events';

import { describe, expect, it } from 'vitest';

import { MAX_PASSWORD_STDIN_BYTES, readPasswordStdin } from './cli.js';

interface Result {
  readonly code: number;
  readonly stdout: string;
  readonly stderr: string;
}

const live = process.env['PATCHES_HARNESS_LIVE'] === '1' ? it : it.skip;

describe('password stdin bounds', () => {
  it('accepts the exact byte boundary and rejects an overflow before accumulation', async () => {
    async function* chunks(...values: string[]): AsyncGenerator<string> {
      await Promise.resolve();
      yield* values;
    }

    await expect(
      readPasswordStdin(chunks('a'.repeat(MAX_PASSWORD_STDIN_BYTES))),
    ).resolves.toHaveLength(MAX_PASSWORD_STDIN_BYTES);
    await expect(
      readPasswordStdin(chunks('a'.repeat(MAX_PASSWORD_STDIN_BYTES), 'b')),
    ).rejects.toThrow('password stdin is too large');
  });
});

async function run(command: string, args: readonly string[], cwd: string): Promise<Result> {
  const child = spawn(command, [...args], { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (chunk: Buffer) => (stdout += chunk.toString('utf8')));
  child.stderr.on('data', (chunk: Buffer) => (stderr += chunk.toString('utf8')));
  const [code] = (await once(child, 'close')) as [number | null];
  return { code: code ?? 1, stdout, stderr };
}

live(
  'journals an induced process failure, resumes in a new CLI, reapplies exactly, and refuses drift',
  async () => {
    const root = resolve(process.cwd(), '../..');
    const cli = resolve(root, 'packages/harness/dist/cli.js');
    const runtime = resolve(root, 'infra/lab/.run/harness');
    const temporary = await mkdtemp(join(tmpdir(), 'patches-harness-live-'));
    const worldPath = join(temporary, 'world.json');
    const suffix = randomUUID().replaceAll('-', '').slice(0, 8);
    const world = {
      users: [
        { key: `alice-${suffix}`, handle: `alice${suffix}`, email: `alice${suffix}@harness.local` },
        { key: `bob-${suffix}`, handle: `bob${suffix}`, email: `bob${suffix}@harness.local` },
      ],
      posts: [{ key: `post-${suffix}`, author: `alice-${suffix}`, body: 'live journal proof' }],
    };
    await writeFile(worldPath, JSON.stringify(world));
    const invoke = (args: readonly string[]) => run(process.execPath, [cli, ...args], root);
    const initial = await invoke(['status']);
    expect(initial.code).toBe(0);
    expect((JSON.parse(initial.stdout) as { status: string }).status).toBe('down');
    let started = false;
    try {
      await Promise.all([
        unlink(join(runtime, 'world-seed')).catch(() => undefined),
        unlink(join(runtime, 'world-manifest.json')).catch(() => undefined),
      ]);
      expect((await invoke(['up'])).code).toBe(0);
      started = true;
      const failed = await invoke(['world-ensure', '--file', worldPath, '--fail-after', '1']);
      expect(failed.code).not.toBe(0);
      expect(failed.stderr).toContain('operation failed');

      for (const name of ['world-seed', 'world-manifest.json']) {
        const metadata = await stat(join(runtime, name));
        expect(metadata.isFile()).toBe(true);
        expect(metadata.isSymbolicLink()).toBe(false);
        expect(metadata.mode & 0o777).toBe(0o600);
      }
      const journal = JSON.parse(await readFile(join(runtime, 'world-manifest.json'), 'utf8')) as {
        completedKeys: string[];
      };
      expect(journal.completedKeys).toEqual([`alice-${suffix}`]);

      const resumed = await invoke(['world-ensure', '--file', worldPath]);
      const reapplied = await invoke(['world-ensure', '--file', worldPath]);
      expect(resumed.code).toBe(0);
      expect(reapplied.code).toBe(0);
      const resumedResult = JSON.parse(resumed.stdout) as {
        posts: { id: string }[];
        sessionsRevoked: boolean;
      };
      const reappliedResult = JSON.parse(reapplied.stdout) as {
        posts: { id: string }[];
        sessionsRevoked: boolean;
      };
      expect(reappliedResult.posts[0]?.id).toBe(resumedResult.posts[0]?.id);
      expect(resumedResult.sessionsRevoked).toBe(true);
      expect(reappliedResult.sessionsRevoked).toBe(true);

      await writeFile(worldPath, JSON.stringify({ ...world, posts: [] }));
      const drift = await invoke(['world-ensure', '--file', worldPath]);
      expect(drift.code).not.toBe(0);
      expect(drift.stderr).toContain('operation failed');
    } finally {
      if (started) await invoke(['down']);
      await Promise.all([
        unlink(join(runtime, 'world-seed')).catch(() => undefined),
        unlink(join(runtime, 'world-manifest.json')).catch(() => undefined),
      ]);
      await rm(temporary, { recursive: true, force: true });
    }
  },
  120_000,
);
