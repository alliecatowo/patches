import { describe, expect, it } from 'vitest';

import { DEFAULT_TARGET, parseArgs } from './args.js';

describe('parseArgs', () => {
  it('opens the TUI against the default local server with no arguments', () => {
    expect(parseArgs([])).toEqual({
      command: 'tui',
      target: DEFAULT_TARGET,
      insecure: false,
      plain: false,
      rest: [],
    });
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
      plain: false,
      rest: [],
    });
  });

  it('reads --plain and PATCHES_PLAIN', () => {
    expect(parseArgs(['--plain']).plain).toBe(true);
    expect(parseArgs([], { PATCHES_PLAIN: 'true' }).plain).toBe(true);
    expect(parseArgs([], { PATCHES_PLAIN: 'false' }).plain).toBe(false);
    expect(parseArgs([]).plain).toBe(false);
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

  it('recognises --node as an alias for --server', () => {
    expect(parseArgs(['--node', 'patches.social:443']).target).toBe('patches.social:443');
    expect(parseArgs(['--node=patches.social:443']).target).toBe('patches.social:443');
  });

  it('recognises the auth subcommands', () => {
    expect(parseArgs(['register']).command).toBe('register');
    expect(parseArgs(['login']).command).toBe('login');
    expect(parseArgs(['logout']).command).toBe('logout');
    expect(parseArgs(['accounts']).command).toBe('accounts');
    expect(parseArgs(['whoami']).command).toBe('whoami');
    expect(parseArgs(['keys']).command).toBe('keys');
    expect(parseArgs(['dm']).command).toBe('dm');
  });

  it('forwards dm subcommands and flags into rest', () => {
    const args = parseArgs(['dm', 'read', 'conversation-1', '--limit', '10']);
    expect(args.command).toBe('dm');
    expect(args.rest).toEqual(['read', 'conversation-1', '--limit', '10']);
  });

  it('forwards the keys subcommand and its own arguments into rest', () => {
    const args = parseArgs(['keys', 'add', '--ssh-key', 'SHA256:abc', '--yes']);
    expect(args.command).toBe('keys');
    expect(args.rest).toEqual(['add', '--ssh-key', 'SHA256:abc', '--yes']);
  });

  it('forwards community and tag subcommands for their own parsers', () => {
    expect(parseArgs(['community', 'post', 'community-1', '--body', 'hello'])).toMatchObject({
      command: 'community',
      rest: ['post', 'community-1', '--body', 'hello'],
    });
    expect(parseArgs(['tag', 'feed', '#typescript', '--limit', '5'])).toMatchObject({
      command: 'tag',
      rest: ['feed', '#typescript', '--limit', '5'],
    });
    expect(parseArgs(['tag', '--help'])).toMatchObject({ command: 'tag', rest: ['--help'] });
  });

  it('collects unrecognised flags after an auth subcommand into rest, instead of erroring', () => {
    const args = parseArgs(['register', '--handle', 'alice', '--email', 'alice@example.com']);
    expect(args.command).toBe('register');
    expect(args.error).toBeUndefined();
    expect(args.rest).toEqual(['--handle', 'alice', '--email', 'alice@example.com']);
  });

  it("still recognises --server/--insecure among an auth subcommand's flags", () => {
    const args = parseArgs(['login', '--ssh', '--server', 'patches.social:443']);
    expect(args.command).toBe('login');
    expect(args.target).toBe('patches.social:443');
    expect(args.rest).toEqual(['--ssh']);
  });

  it('lets an auth subcommand handle its own --help instead of the global one', () => {
    const args = parseArgs(['register', '--help']);
    expect(args.command).toBe('register');
    expect(args.rest).toEqual(['--help']);
  });

  it('still rejects an unknown argument for non-auth commands', () => {
    const args = parseArgs(['ping', '--wat']);
    expect(args.command).toBe('help');
    expect(args.error).toContain('--wat');
  });

  it('parses visit @handle into a visitTarget with an empty (index) slug', () => {
    const args = parseArgs(['visit', '@alice']);
    expect(args.command).toBe('tui');
    expect(args.visitTarget).toEqual({ handle: 'alice', slug: '' });
  });

  it('parses visit @handle/slug into a visitTarget with that sub-page', () => {
    const args = parseArgs(['visit', '@alice/about']);
    expect(args.visitTarget).toEqual({ handle: 'alice', slug: 'about' });
  });

  it('combines visit with connection flags', () => {
    const args = parseArgs(['visit', '@alice', '--server', '127.0.0.1:1234']);
    expect(args.visitTarget).toEqual({ handle: 'alice', slug: '' });
    expect(args.target).toBe('127.0.0.1:1234');
  });

  it('explains a visit with no target, or a target missing the leading @', () => {
    expect(parseArgs(['visit']).command).toBe('help');
    expect(parseArgs(['visit']).error).toContain('visit');
    expect(parseArgs(['visit', 'alice']).command).toBe('help');
  });
});
