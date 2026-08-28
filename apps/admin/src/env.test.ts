import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';

import { adminEnvSchema, loadAdminEnv } from './env.js';

describe('adminEnvSchema', () => {
  const baseEnv = { DATABASE_URL: 'postgres://user:pass@localhost:5432/patches' };

  it('accepts a trimmed, non-empty PATCHES_ADMIN_OPERATOR', () => {
    const result = adminEnvSchema.safeParse({ ...baseEnv, PATCHES_ADMIN_OPERATOR: 'alice' });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.PATCHES_ADMIN_OPERATOR).toBe('alice');
  });

  it('accepts a missing PATCHES_ADMIN_OPERATOR (it is optional)', () => {
    const result = adminEnvSchema.safeParse(baseEnv);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.PATCHES_ADMIN_OPERATOR).toBeUndefined();
  });

  it('rejects an empty PATCHES_ADMIN_OPERATOR', () => {
    const result = adminEnvSchema.safeParse({ ...baseEnv, PATCHES_ADMIN_OPERATOR: '' });
    expect(result.success).toBe(false);
  });

  it('rejects a whitespace-only PATCHES_ADMIN_OPERATOR after trimming', () => {
    const result = adminEnvSchema.safeParse({ ...baseEnv, PATCHES_ADMIN_OPERATOR: '   ' });
    expect(result.success).toBe(false);
  });

  it('fails loudly when DATABASE_URL is missing', () => {
    const result = adminEnvSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it('fails loudly when DATABASE_URL is not a valid URL', () => {
    const result = adminEnvSchema.safeParse({ DATABASE_URL: 'not-a-url' });
    expect(result.success).toBe(false);
  });
});

describe('loadAdminEnv (loadDotEnv walk-up + precedence)', () => {
  let tmpRoot: string;
  let nestedCwd: string;
  const originalEnv = { ...process.env };
  let cwdSpy: MockInstance<typeof process.cwd> | undefined;

  beforeEach(async () => {
    tmpRoot = await mkdtemp(join(tmpdir(), 'patches-admin-env-'));
    nestedCwd = join(tmpRoot, 'apps', 'admin');
    await mkdir(nestedCwd, { recursive: true });
  });

  afterEach(async () => {
    cwdSpy?.mockRestore();
    await rm(tmpRoot, { recursive: true, force: true });
    for (const key of Object.keys(process.env)) {
      if (!(key in originalEnv)) delete process.env[key];
    }
    Object.assign(process.env, originalEnv);
  });

  it('walks up from cwd to find pnpm-workspace.yaml and loads .env from there', async () => {
    await writeFile(join(tmpRoot, 'pnpm-workspace.yaml'), 'packages:\n  - "apps/*"\n');
    await writeFile(
      join(tmpRoot, '.env'),
      'DATABASE_URL=postgres://from-dotenv@localhost:5432/patches\nPATCHES_ADMIN_OPERATOR=dotenv-op\n',
    );
    cwdSpy = vi.spyOn(process, 'cwd').mockReturnValue(nestedCwd);
    delete process.env.DATABASE_URL;
    delete process.env.PATCHES_ADMIN_OPERATOR;

    const env = loadAdminEnv();

    expect(env.DATABASE_URL).toBe('postgres://from-dotenv@localhost:5432/patches');
    expect(env.PATCHES_ADMIN_OPERATOR).toBe('dotenv-op');
  });

  it('never overrides a variable the shell already set (??= semantics)', async () => {
    await writeFile(join(tmpRoot, 'pnpm-workspace.yaml'), 'packages:\n  - "apps/*"\n');
    await writeFile(
      join(tmpRoot, '.env'),
      'DATABASE_URL=postgres://from-dotenv@localhost:5432/patches\n',
    );
    cwdSpy = vi.spyOn(process, 'cwd').mockReturnValue(nestedCwd);
    process.env.DATABASE_URL = 'postgres://from-shell@localhost:5432/patches';

    const env = loadAdminEnv();

    expect(env.DATABASE_URL).toBe('postgres://from-shell@localhost:5432/patches');
  });

  it('throws loudly when no pnpm-workspace.yaml is found and DATABASE_URL is unset', () => {
    cwdSpy = vi.spyOn(process, 'cwd').mockReturnValue(nestedCwd);
    delete process.env.DATABASE_URL;

    expect(() => loadAdminEnv()).toThrow();
  });

  it('skips the .env walk entirely in production, even if DATABASE_URL is already set', async () => {
    await writeFile(join(tmpRoot, 'pnpm-workspace.yaml'), 'packages:\n  - "apps/*"\n');
    await writeFile(join(tmpRoot, '.env'), 'PATCHES_ADMIN_OPERATOR=should-not-be-loaded\n');
    cwdSpy = vi.spyOn(process, 'cwd').mockReturnValue(nestedCwd);
    process.env.DATABASE_URL = 'postgres://from-shell@localhost:5432/patches';
    process.env.NODE_ENV = 'production';
    delete process.env.PATCHES_ADMIN_OPERATOR;

    const env = loadAdminEnv();

    expect(env.PATCHES_ADMIN_OPERATOR).toBeUndefined();
  });
});
