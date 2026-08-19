import { Code, ConnectError } from '@connectrpc/connect';
import { describe, expect, it } from 'vitest';

import { describeError } from './errors.js';

const TARGET = 'patches-social.fly.dev';

describe('describeError', () => {
  it('names the unreachable server so the user knows what to fix', () => {
    const described = describeError(new ConnectError('', Code.Unavailable), { target: TARGET });
    expect(described.message).toContain(TARGET);
    expect(described.message).toContain("Can't reach");
    expect(described.retryable).toBe(true);
  });

  it('reports a timeout as a timeout', () => {
    const described = describeError(new ConnectError('', Code.DeadlineExceeded));
    expect(described.message).toMatch(/took too long/i);
    expect(described.retryable).toBe(true);
  });

  it('passes the server message through for FailedPrecondition, where the message is the point', () => {
    const message =
      'This Patches client (0.0.1) is too old for this server, which requires 0.1.0 or newer.';
    const described = describeError(new ConnectError(message, Code.FailedPrecondition));
    expect(described.message).toBe(message);
    expect(described.retryable).toBe(false);
  });

  it('treats an expired session as non-retryable with a next step', () => {
    const described = describeError(new ConnectError('', Code.Unauthenticated));
    expect(described.retryable).toBe(false);
    expect(described.message).toMatch(/sign in again/i);
  });

  it('maps Unauthenticated in a credentials context to a wrong-password message (B-016)', () => {
    const error = new ConnectError('', Code.Unauthenticated);
    expect(describeError(error, { context: 'credentials' }).message).toBe(
      'Wrong handle/email or password.',
    );
    expect(describeError(error).message).toMatch(/session is no longer valid/i);
  });

  it('surfaces AlreadyExists with the server message (e.g. HANDLE_TAKEN)', () => {
    const described = describeError(new ConnectError('That handle is taken.', Code.AlreadyExists));
    expect(described.message).toBe('That handle is taken.');
    expect(described.retryable).toBe(false);
  });

  it('falls back to a generic message when the server sent none, for message-first codes', () => {
    expect(describeError(new ConnectError('', Code.PermissionDenied)).message).toMatch(
      /permission/i,
    );
    expect(describeError(new ConnectError('', Code.NotFound)).message).toMatch(/no longer exists/i);
    expect(describeError(new ConnectError('', Code.InvalidArgument)).message).toMatch(/rejected/i);
  });

  it('reports resource exhaustion as retryable, with a wait-and-retry hint', () => {
    const described = describeError(new ConnectError('', Code.ResourceExhausted));
    expect(described.message).toMatch(/going a bit fast/i);
    expect(described.retryable).toBe(true);
  });

  it('reports Unimplemented as a client-version problem, not retryable', () => {
    const described = describeError(new ConnectError('', Code.Unimplemented), { target: TARGET });
    expect(described.message).toContain(TARGET);
    expect(described.message).toMatch(/does not support this feature/i);
    expect(described.retryable).toBe(false);
  });

  it('never surfaces a stack trace, even if the server sends one', () => {
    const leaky = 'boom\n    at Object.<anonymous> (/srv/app/main.js:1:1)';
    const described = describeError(new ConnectError(leaky, Code.Internal));
    expect(described.message).not.toContain('    at ');
  });

  it('handles a plain Error (e.g. a fetch/DNS failure) without a Connect code', () => {
    const described = describeError(new TypeError('fetch failed'), { target: TARGET });
    expect(described.code).toBe(Code.Unknown);
    expect(described.retryable).toBe(true);
  });

  it('handles a thrown non-Error without crashing', () => {
    expect(() => describeError('nope')).not.toThrow();
    expect(describeError(undefined).code).toBe(Code.Unknown);
  });
});
