import { Code, ConnectError } from '@connectrpc/connect';

/**
 * The node's refusal code by name (`NotFound`, `PermissionDenied`, `Unavailable`, …).
 *
 * Safe to show and to log: it is the transport-level status the node already put on the wire,
 * never a `ConnectError.message` (which can quote request data) and never anything derived
 * from a DM body or key material (§183.1, §194). Deliberately its own module with no API or
 * E2EE imports so any layer can reach for it.
 */
export function connectCodeName(error: unknown): string {
  return error instanceof ConnectError ? Code[error.code] : 'unknown';
}
