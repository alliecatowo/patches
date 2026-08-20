import { Code, ConnectError } from '@connectrpc/connect';
import { describe, expect, it } from 'vitest';

import { describeError, isPrivacyAckRequired, isSignInRequired } from './errors.js';

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

  it('recognises PUBLIC_READ=false rejections via the x-patches-error-code metadata (2026-08-19)', () => {
    const error = new ConnectError('', Code.Unauthenticated, {
      'x-patches-error-code': 'SIGN_IN_REQUIRED',
    });
    expect(isSignInRequired(error)).toBe(true);
    expect(isSignInRequired(new ConnectError('', Code.Unauthenticated))).toBe(false);

    const described = describeError(error);
    expect(described.retryable).toBe(false);
    expect(described.message).toMatch(/requires sign-in to read/i);
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

  // A-053 (spec §197.1, §197.5, §197.6): REQUIRE_PRIVACY_ACK's RequirePrivacyAckGuard
  // rejection points at the settings route instead of just repeating the server's raw
  // "must acknowledge" message.
  it('recognises PRIVACY_NOTICE_NOT_ACKNOWLEDGED via the x-patches-error-code metadata and points at Settings → Privacy', () => {
    const error = new ConnectError('', Code.FailedPrecondition, {
      'x-patches-error-code': 'PRIVACY_NOTICE_NOT_ACKNOWLEDGED',
    });
    expect(isPrivacyAckRequired(error)).toBe(true);
    expect(isPrivacyAckRequired(new ConnectError('', Code.FailedPrecondition))).toBe(false);

    const described = describeError(error);
    expect(described.retryable).toBe(false);
    expect(described.message).toMatch(/privacy notice changed/i);
    expect(described.message).toMatch(/settings.*privacy/i);
  });

  // ADR 0023 slice 9 (P10-016): `title`/`hint` are new surface, but `message` (still
  // `combine(title, hint)`) must be byte-identical to what `describeError` returned before this
  // change, for every case the switch handles — this is the actual proof, not an assumption.
  describe('message is byte-identical to the pre-P10-016 combine(title, hint) output', () => {
    it('Unavailable', () => {
      expect(
        describeError(new ConnectError('', Code.Unavailable), { target: TARGET }).message,
      ).toBe(
        "Can't reach the Patches server at patches-social.fly.dev. Check that it is running and reachable.",
      );
    });

    it('DeadlineExceeded', () => {
      expect(
        describeError(new ConnectError('', Code.DeadlineExceeded), { target: TARGET }).message,
      ).toBe(
        `${TARGET} took too long to answer. The server may be overloaded. Try again in a moment.`,
      );
    });

    it('Unauthenticated (SIGN_IN_REQUIRED)', () => {
      const error = new ConnectError('', Code.Unauthenticated, {
        'x-patches-error-code': 'SIGN_IN_REQUIRED',
      });
      expect(describeError(error).message).toBe(
        'This node requires sign-in to read. Sign in or create an account to continue.',
      );
    });

    it('Unauthenticated, credentials context', () => {
      expect(
        describeError(new ConnectError('', Code.Unauthenticated), { context: 'credentials' })
          .message,
      ).toBe('Wrong handle/email or password.');
    });

    it('Unauthenticated, no context', () => {
      expect(describeError(new ConnectError('', Code.Unauthenticated)).message).toBe(
        'Your session is no longer valid. Sign in again to continue.',
      );
    });

    it('PermissionDenied, no server message', () => {
      expect(describeError(new ConnectError('', Code.PermissionDenied)).message).toBe(
        'You do not have permission to do that.',
      );
    });

    it('PermissionDenied, with server message', () => {
      expect(describeError(new ConnectError('Not your post.', Code.PermissionDenied)).message).toBe(
        'Not your post.',
      );
    });

    it('FailedPrecondition, no server message', () => {
      expect(describeError(new ConnectError('', Code.FailedPrecondition)).message).toBe(
        'The server refused this request in its current state.',
      );
    });

    it('FailedPrecondition, with server message', () => {
      expect(
        describeError(new ConnectError('Client too old.', Code.FailedPrecondition)).message,
      ).toBe('Client too old.');
    });

    it('FailedPrecondition (PRIVACY_NOTICE_NOT_ACKNOWLEDGED)', () => {
      const error = new ConnectError('', Code.FailedPrecondition, {
        'x-patches-error-code': 'PRIVACY_NOTICE_NOT_ACKNOWLEDGED',
      });
      expect(describeError(error).message).toBe(
        "This node's privacy notice changed — review and acknowledge it. Go to Settings → Privacy.",
      );
    });

    it('ResourceExhausted', () => {
      expect(describeError(new ConnectError('', Code.ResourceExhausted)).message).toBe(
        'You are going a bit fast for the server. Wait a few seconds and try again.',
      );
    });

    it('InvalidArgument, no server message', () => {
      expect(describeError(new ConnectError('', Code.InvalidArgument)).message).toBe(
        'The server rejected that request.',
      );
    });

    it('InvalidArgument, with server message', () => {
      expect(
        describeError(new ConnectError('Handle too long.', Code.InvalidArgument)).message,
      ).toBe('Handle too long.');
    });

    it('NotFound, no server message', () => {
      expect(describeError(new ConnectError('', Code.NotFound)).message).toBe(
        'That no longer exists.',
      );
    });

    it('NotFound, with server message', () => {
      expect(describeError(new ConnectError('Post not found.', Code.NotFound)).message).toBe(
        'Post not found.',
      );
    });

    it('AlreadyExists, no server message', () => {
      expect(describeError(new ConnectError('', Code.AlreadyExists)).message).toBe(
        'That is already taken.',
      );
    });

    it('AlreadyExists, with server message', () => {
      expect(
        describeError(new ConnectError('That handle is taken.', Code.AlreadyExists)).message,
      ).toBe('That handle is taken.');
    });

    it('Unimplemented', () => {
      expect(
        describeError(new ConnectError('', Code.Unimplemented), { target: TARGET }).message,
      ).toBe(
        `${TARGET} does not support this feature. It may be running an older version of Patches.`,
      );
    });

    it('Canceled', () => {
      expect(describeError(new ConnectError('', Code.Canceled)).message).toBe('Request cancelled.');
    });

    it('Internal, no server message', () => {
      expect(describeError(new ConnectError('', Code.Internal)).message).toBe(
        'The server hit an unexpected problem. Try again; if it keeps happening, report it.',
      );
    });

    it('Internal, with server message', () => {
      expect(describeError(new ConnectError('Out of memory.', Code.Internal)).message).toBe(
        'The server hit an unexpected problem. Out of memory.',
      );
    });

    it('Unknown', () => {
      expect(describeError(new ConnectError('', Code.Unknown)).message).toBe(
        'The server hit an unexpected problem. Try again; if it keeps happening, report it.',
      );
    });

    it('default (e.g. DataLoss), no server message', () => {
      expect(describeError(new ConnectError('', Code.DataLoss), { target: TARGET }).message).toBe(
        `Could not talk to ${TARGET}. Check the address and your network connection.`,
      );
    });

    it('default (e.g. DataLoss), with server message', () => {
      expect(
        describeError(new ConnectError('Disk full.', Code.DataLoss), { target: TARGET }).message,
      ).toBe('Could not talk to patches-social.fly.dev. Disk full.');
    });
  });

  // ADR 0023 slice 9: `title`/`hint` are new first-class fields, not just an implementation
  // detail of `message` — a client can render them separately.
  it('exposes title and hint as first-class fields alongside message', () => {
    const described = describeError(new ConnectError('', Code.Unavailable), { target: TARGET });
    expect(described.title).toBe("Can't reach the Patches server at patches-social.fly.dev.");
    expect(described.hint).toBe('Check that it is running and reachable.');
    expect(described.message).toBe(`${described.title} ${described.hint}`);
  });

  // ADR 0023 slice 9: a client-specific copy override only replaces its named slot — every
  // other slot (and every other case) keeps the shared default.
  it('lets a caller override only the client-specific copy slots', () => {
    const described = describeError(new ConnectError('', Code.Unavailable), {
      target: TARGET,
      copy: { unavailableHint: 'Check that it is running and that --server points at it.' },
    });
    expect(described.title).toBe("Can't reach the Patches server at patches-social.fly.dev.");
    expect(described.hint).toBe('Check that it is running and that --server points at it.');

    const untouched = describeError(new ConnectError('', Code.DeadlineExceeded), {
      target: TARGET,
    });
    expect(untouched.hint).toBe('The server may be overloaded. Try again in a moment.');
  });
});
