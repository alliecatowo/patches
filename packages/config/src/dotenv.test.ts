import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readDotEnvFile } from './dotenv.js';

describe('readDotEnvFile', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'patches-config-test-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  function write(contents: string): string {
    const path = join(dir, '.env');
    writeFileSync(path, contents, 'utf8');
    return path;
  }

  it('parses simple KEY=VALUE pairs', () => {
    const path = write('FOO=bar\nBAZ=qux\n');
    expect(readDotEnvFile(path)).toEqual({ FOO: 'bar', BAZ: 'qux' });
  });

  it('skips blank lines and comments', () => {
    const path = write('\n# a comment\nFOO=bar\n  # indented comment\nBAZ=qux\n');
    expect(readDotEnvFile(path)).toEqual({ FOO: 'bar', BAZ: 'qux' });
  });

  it('strips matching double quotes and expands escapes', () => {
    const path = write('FOO="bar baz"\nMULTI="line1\\nline2"\n');
    expect(readDotEnvFile(path)).toEqual({ FOO: 'bar baz', MULTI: 'line1\nline2' });
  });

  it('strips matching single quotes literally (no escape expansion)', () => {
    const path = write("FOO='bar \\n baz'\n");
    expect(readDotEnvFile(path)).toEqual({ FOO: 'bar \\n baz' });
  });

  it('strips trailing inline comments on unquoted values', () => {
    const path = write('FOO=bar # this is a comment\n');
    expect(readDotEnvFile(path)).toEqual({ FOO: 'bar' });
  });

  it('handles values containing = signs', () => {
    const path = write('DATABASE_URL=postgres://user:pass@host/db?sslmode=require\n');
    expect(readDotEnvFile(path)).toEqual({
      DATABASE_URL: 'postgres://user:pass@host/db?sslmode=require',
    });
  });

  it('returns {} when the file does not exist', () => {
    expect(readDotEnvFile(join(dir, 'does-not-exist.env'))).toEqual({});
  });
});
