import { Code, ConnectError } from '@connectrpc/connect';

export interface ErrorDescription {
  code: string;
  title: string;
  /** Copy safe to show a user — never the raw server message for 5xx-ish codes. */
  message: string;
  /** True when retrying the exact same request might succeed (network blip, timeout). */
  retryable: boolean;
}

const COPY: Partial<Record<Code, { title: string; message: string; retryable: boolean }>> = {
  [Code.Unauthenticated]: {
    title: 'Signed out',
    message: 'Your session expired. Sign in again to continue.',
    retryable: false,
  },
  [Code.PermissionDenied]: {
    title: 'Not allowed',
    message: "You don't have permission to do that.",
    retryable: false,
  },
  [Code.NotFound]: {
    title: 'Not found',
    message: "That doesn't exist, or you can't see it.",
    retryable: false,
  },
  [Code.AlreadyExists]: {
    title: 'Already exists',
    message: 'That already exists.',
    retryable: false,
  },
  [Code.InvalidArgument]: {
    title: 'Invalid input',
    message: 'Some of that input was invalid. Double check and try again.',
    retryable: false,
  },
  [Code.ResourceExhausted]: {
    title: 'Slow down',
    message: "You're doing that too much. Try again in a moment.",
    retryable: true,
  },
  [Code.Unavailable]: {
    title: 'Connection problem',
    message: "Couldn't reach the server. Check your connection and try again.",
    retryable: true,
  },
  [Code.DeadlineExceeded]: {
    title: 'Timed out',
    message: 'That took too long. Try again.',
    retryable: true,
  },
  [Code.Canceled]: {
    title: 'Canceled',
    message: 'The request was canceled.',
    retryable: true,
  },
  [Code.FailedPrecondition]: {
    title: "Can't do that yet",
    message: 'That action needs something else to happen first.',
    retryable: false,
  },
};

/** Maps any thrown value from an RPC call into copy safe to render in a toast/banner. */
export function describeError(error: unknown): ErrorDescription {
  const connectError = ConnectError.from(error);
  const known = COPY[connectError.code];
  if (known) {
    return { code: Code[connectError.code], ...known };
  }
  return {
    code: Code[connectError.code],
    title: 'Something went wrong',
    message: 'An unexpected error occurred. Try again in a moment.',
    retryable: true,
  };
}

export function isConnectErrorWithCode(error: unknown, code: Code): boolean {
  return error instanceof ConnectError && error.code === code;
}
