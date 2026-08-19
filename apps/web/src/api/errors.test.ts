import { Code, ConnectError } from '@connectrpc/connect';
import { describe, expect, it } from 'vitest';

import { describeError, isConnectErrorWithCode } from './errors.js';

describe('describeError', () => {
  it('maps Unauthenticated to a sign-out message that never leaks server internals', () => {
    const described = describeError(new ConnectError('token expired', Code.Unauthenticated));
    expect(described.title).toBe('Signed out');
    expect(described.retryable).toBe(false);
  });

  it('maps Unavailable to a retryable connection-problem message', () => {
    const described = describeError(new ConnectError('fetch failed', Code.Unavailable));
    expect(described.retryable).toBe(true);
    expect(described.title).toBe('Connection problem');
  });

  it('falls back to generic copy for an unmapped code', () => {
    const described = describeError(new ConnectError('huh', Code.DataLoss));
    expect(described.title).toBe('Something went wrong');
  });

  it('normalizes a non-ConnectError thrown value', () => {
    const described = describeError(new Error('plain error'));
    expect(described.code).toBe('Unknown');
  });
});

describe('isConnectErrorWithCode', () => {
  it('matches only the given code', () => {
    const error = new ConnectError('nope', Code.PermissionDenied);
    expect(isConnectErrorWithCode(error, Code.PermissionDenied)).toBe(true);
    expect(isConnectErrorWithCode(error, Code.NotFound)).toBe(false);
  });

  it('is false for a non-ConnectError', () => {
    expect(isConnectErrorWithCode(new Error('x'), Code.NotFound)).toBe(false);
  });
});
