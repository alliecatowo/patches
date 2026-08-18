import {
  Actor,
  FederationKey,
  claimOutboxJobs,
  decryptFederationPrivateKeyPem,
  federationDeliverPayloadSchema,
  markOutboxJobFailed,
  markOutboxJobSucceeded,
} from '@patches/database';
import type { DataSource } from 'typeorm';

import { computeDigestHeader } from '../../src/modules/federation/signatures/digest.js';
import { signRequest } from '../../src/modules/federation/signatures/http-signature.js';

/**
 * P8-008's "job runner driving `FEDERATION_DELIVER` inline": claims and delivers every
 * currently-`PENDING` `FEDERATION_DELIVER` job on `dataSource` synchronously, using the same
 * signing code the real worker handler does (`apps/worker/src/federation/delivery-client.js`
 * duplicates the same primitives from `apps/server`'s copy — this test drives the `apps/
 * server` copy directly rather than spinning up a real `apps/worker` process, since the point
 * of P8-008 is proving the HTTP/signature protocol end to end, not exercising the worker's own
 * claim loop, which already has its own integration coverage).
 *
 * Uses the platform `fetch` rather than `safeFetch` — this drives requests between two
 * `127.0.0.1` test nodes, exactly the loopback traffic `safeFetch` exists to reject outside
 * lab mode, so re-hardening it here would just be testing the guard against itself.
 */
export async function drainFederationDeliveries(
  dataSource: DataSource,
  workerId = 'test-relay',
  /** B-026: the same `FEDERATION_KEY_ENCRYPTION_KEY` the node owning `dataSource` was
   * started with (`FederationTestNode.federationKeyEncryptionKey`) — required to decrypt that
   * node's own `federation_keys` rows. */
  federationKeyEncryptionKey?: string,
): Promise<number> {
  let delivered = 0;
  for (;;) {
    const claimed = await dataSource.transaction((manager) =>
      claimOutboxJobs(manager, { workerId, limit: 10 }),
    );
    if (claimed.length === 0) return delivered;

    for (const job of claimed) {
      if (job.type !== 'FEDERATION_DELIVER') {
        // Not this relay's concern — release it back to PENDING immediately so nothing else
        // in the suite waits on it.
        await markOutboxJobFailed(dataSource.manager, job.id, { error: 'not a federation job' });
        continue;
      }
      try {
        await deliverOne(dataSource, job.payload, requireEncryptionKey(federationKeyEncryptionKey));
        await markOutboxJobSucceeded(dataSource.manager, job.id);
        delivered += 1;
      } catch (error) {
        await markOutboxJobFailed(dataSource.manager, job.id, {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }
}

function requireEncryptionKey(value: string | undefined): string {
  if (value === undefined) {
    throw new Error(
      'drainFederationDeliveries: federationKeyEncryptionKey is required to decrypt federation_keys rows.',
    );
  }
  return value;
}

async function deliverOne(
  dataSource: DataSource,
  rawPayload: unknown,
  federationKeyEncryptionKey: string,
): Promise<void> {
  const { actorId, inboxUrl, activity } = federationDeliverPayloadSchema.parse(rawPayload);
  const [actor, key] = await Promise.all([
    dataSource.getRepository(Actor).findOneOrFail({ where: { id: actorId } }),
    dataSource.getRepository(FederationKey).findOneOrFail({ where: { actorId } }),
  ]);
  const privateKeyPem = decryptFederationPrivateKeyPem(
    { ciphertext: key.privateKeyCiphertext, iv: key.privateKeyIv, tag: key.privateKeyTag },
    federationKeyEncryptionKey,
  );

  const body = JSON.stringify(activity);
  const target = new URL(inboxUrl);
  const date = new Date().toUTCString();
  const digest = computeDigestHeader(body);
  const actorOrigin = new URL(String(activity.actor)).origin;
  const keyId = `${actorOrigin}/users/${actor.handleNormalized}#main-key`;
  const signature = signRequest({
    method: 'POST',
    target: `${target.pathname}${target.search}`,
    host: target.host,
    date,
    digest,
    keyId,
    privateKeyPem,
  });

  const response = await fetch(inboxUrl, {
    method: 'POST',
    headers: {
      host: target.host,
      date,
      digest,
      signature,
      'content-type': 'application/activity+json',
    },
    body,
  });
  if (response.status < 200 || response.status >= 300) {
    throw new Error(`Delivery to "${inboxUrl}" failed with status ${String(response.status)}.`);
  }
}
