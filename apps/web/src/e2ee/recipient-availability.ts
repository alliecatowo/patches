import { Code, ConnectError } from '@connectrpc/connect';
import { FollowState } from '@patches/proto/es';

import { api } from '../api/client.js';
import { connectCodeName } from '../lib/connect-error.js';
import { logger } from '../lib/log.js';

/**
 * Why the compose flow pre-checks a recipient instead of just letting the node refuse
 * (issue #320):
 *
 * `CreateE2eeConversation` answers every unavailable-recipient case with one uniform
 * `not_found` — blocked, deleted, ineligible and "no messaging identity" are deliberately
 * indistinguishable on the wire (spec §62). That is correct for the node and useless for the
 * person typing: the owner-reported P0 was two enrolled accounts that were not mutual
 * follows, refused with a blind "The conversation could not be started."
 *
 * Both checks here read only facts the viewer may already see for themselves, so neither
 * turns into a new oracle:
 *
 * - `GetRelationship` returns the *caller's own* follow edges with the target, which the
 *   profile page already renders as a Follow/Following button.
 * - `GetIdentityRoot` is first-contact material any client fetches before it can send
 *   anything at all (`e2ee.proto`: "the current messaging root of any actor the caller may
 *   message"), and is not eligibility-gated server-side.
 *
 * A failure to determine either one resolves to `unknown`, which never blocks the attempt —
 * a probe outage must not become a second way to be unable to message someone.
 */
export type RecipientAvailability =
  | { readonly kind: 'ready' }
  /** §183.2: a conversation may only be opened between mutual follows. */
  | { readonly kind: 'not-mutual' }
  /** The actor exists but has never published a messaging identity root. */
  | { readonly kind: 'no-messaging-identity' }
  | { readonly kind: 'unknown' };

const log = logger('recipient-availability');

/** Inline copy for a recipient who cannot be messaged yet. Names the actor and the one thing
 * that would change the answer — never a raw error code, and never message content. */
export function describeRecipientAvailability(
  availability: RecipientAvailability,
  handle: string,
): string | undefined {
  switch (availability.kind) {
    case 'not-mutual':
      return `@${handle} has to follow you back before you can start a conversation.`;
    case 'no-messaging-identity':
      return `@${handle} hasn't set up messaging yet.`;
    case 'ready':
    case 'unknown':
      return undefined;
  }
}

export async function checkRecipientAvailability(actorId: string): Promise<RecipientAvailability> {
  let mutual: boolean;
  try {
    const { relationship } = await api.socialGraph.getRelationship({ actorId });
    mutual = relationship?.state === FollowState.FOLLOWING && relationship.followedBy;
  } catch (error) {
    log.warn('relationship probe failed', { code: connectCodeName(error) });
    return { kind: 'unknown' };
  }
  if (!mutual) return { kind: 'not-mutual' };

  try {
    await api.e2ee.getIdentityRoot({ actorId });
    return { kind: 'ready' };
  } catch (error) {
    if (error instanceof ConnectError && error.code === Code.NotFound) {
      return { kind: 'no-messaging-identity' };
    }
    log.warn('identity-root probe failed', { code: connectCodeName(error) });
    return { kind: 'unknown' };
  }
}
