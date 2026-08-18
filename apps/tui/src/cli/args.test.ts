import { describe, expect, it } from 'vitest';

import { DEFAULT_TARGET, parseArgs } from './args.js';

describe('parseArgs', () => {
  it('opens the TUI against the default local server with no arguments', () => {
    expect(parseArgs([])).toEqual({ command: 'tui', target: DEFAULT_TARGET, insecure: false });
  });

  it('reads the server from --server and --server=', () => {
    expect(parseArgs(['--server', 'example.com:443']).target).toBe('example.com:443');
    expect(parseArgs(['--server=example.com:443']).target).toBe('example.com:443');
  });

  it('reads the server and insecure flag from the environment', () => {
    const args = parseArgs([], { PATCHES_SERVER: 'box.local:50051', PATCHES_INSECURE: 'true' });
    expect(args.target).toBe('box.local:50051');
    expect(args.insecure).toBe(true);
  });

  it('lets an explicit flag override the environment', () => {
    const args = parseArgs(['--server', 'cli.example:50051'], {
      PATCHES_SERVER: 'env.example:50051',
    });
    expect(args.target).toBe('cli.example:50051');
  });

  it('ignores an empty PATCHES_SERVER rather than connecting to nothing', () => {
    expect(parseArgs([], { PATCHES_SERVER: '   ' }).target).toBe(DEFAULT_TARGET);
  });

  it('treats only explicit truthy values as insecure', () => {
    expect(parseArgs([], { PATCHES_INSECURE: 'false' }).insecure).toBe(false);
    expect(parseArgs([], { PATCHES_INSECURE: '0' }).insecure).toBe(false);
    expect(parseArgs([], { PATCHES_INSECURE: 'yes' }).insecure).toBe(true);
    expect(parseArgs(['--insecure']).insecure).toBe(true);
  });

  it('recognises the non-interactive commands', () => {
    expect(parseArgs(['ping']).command).toBe('ping');
    expect(parseArgs(['--once']).command).toBe('ping');
    expect(parseArgs(['--version']).command).toBe('version');
    expect(parseArgs(['-v']).command).toBe('version');
    expect(parseArgs(['--help']).command).toBe('help');
  });

  it('combines a command with connection flags', () => {
    expect(parseArgs(['ping', '--server', '127.0.0.1:1234', '--insecure'])).toEqual({
      command: 'ping',
      target: '127.0.0.1:1234',
      insecure: true,
    });
  });

  it('explains an unknown argument instead of failing silently', () => {
    const args = parseArgs(['--wat']);
    expect(args.command).toBe('help');
    expect(args.error).toContain('--wat');
  });

  it('explains a --server flag with no value', () => {
    const args = parseArgs(['--server']);
    expect(args.command).toBe('help');
    expect(args.error).toContain('--server');
  });
});
