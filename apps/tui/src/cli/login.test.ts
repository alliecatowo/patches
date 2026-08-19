import { describe, expect, it } from 'vitest';

import { parseLoginFlags } from './login.js';

describe('parseLoginFlags', () => {
  it('defaults to no mode selected', () => {
    const flags = parseLoginFlags([]);
    expect('error' in flags).toBe(false);
    if ('error' in flags) return;
    expect(flags).toMatchObject({ ssh: false, password: false, recovery: false });
  });

  it('accepts --recovery (P15-003)', () => {
    const flags = parseLoginFlags(['--recovery', '--email-or-handle', 'alice']);
    expect('error' in flags).toBe(false);
    if ('error' in flags) return;
    expect(flags.recovery).toBe(true);
    expect(flags.emailOrHandle).toBe('alice');
  });

  it('rejects combining --recovery with --ssh or --password', () => {
    const first = parseLoginFlags(['--recovery', '--ssh']);
    expect('error' in first).toBe(true);
    const second = parseLoginFlags(['--recovery', '--password']);
    expect('error' in second).toBe(true);
  });

  it('still accepts the pre-existing --ssh/--password combination check', () => {
    const flags = parseLoginFlags(['--ssh', '--password']);
    expect('error' in flags).toBe(true);
  });
});
