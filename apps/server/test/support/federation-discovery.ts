import { Actor } from '@patches/database';
import type { DataSource } from 'typeorm';

/**
 * A minimal, test-only WebFinger + actor-document discovery, mirroring `RemoteActorService
 * .resolveByAcct` (`apps/server/src/modules/federation/services/remote-actor.service.ts`) —
 * duplicated rather than reused because P8-008's two nodes now run as real child processes
 * (`federation-node.ts`'s doc comment explains why), so the test has no in-process
 * `RemoteActorService` instance to call. There is also no gRPC RPC yet for "discover a remote
 * actor by acct" (out of this task's proto-touching scope — see the task report); this stands
 * in for the not-yet-built client flow that would trigger that discovery.
 */
export async function discoverRemoteActor(
  dataSource: DataSource,
  handle: string,
  domain: string,
): Promise<Actor> {
  const resource = `acct:${handle}@${domain}`;
  const webfingerUrl = `http://${domain}/.well-known/webfinger?resource=${encodeURIComponent(resource)}`;
  const webfingerResponse = await fetch(webfingerUrl);
  if (webfingerResponse.status !== 200) {
    throw new Error(
      `WebFinger lookup for "${resource}" failed (${String(webfingerResponse.status)}).`,
    );
  }
  const jrd = (await webfingerResponse.json()) as { links?: { rel?: string; href?: string }[] };
  const selfLink = (jrd.links ?? []).find((link) => link.rel === 'self' && link.href !== undefined);
  if (selfLink?.href === undefined) {
    throw new Error(`WebFinger response for "${resource}" has no "self" link.`);
  }

  const actorResponse = await fetch(selfLink.href, {
    headers: { accept: 'application/activity+json' },
  });
  if (actorResponse.status !== 200) {
    throw new Error(`Actor fetch for "${selfLink.href}" failed (${String(actorResponse.status)}).`);
  }
  const document = (await actorResponse.json()) as {
    id: string;
    preferredUsername?: string;
    inbox: string;
    endpoints?: { sharedInbox?: string };
    publicKey?: { publicKeyPem?: string };
  };

  const repository = dataSource.getRepository(Actor);
  const existing = await repository.findOne({ where: { canonicalUri: document.id } });
  if (existing !== null) return existing;

  const homeServer = new URL(document.id).host;
  const resolvedHandle = document.preferredUsername ?? handle;
  const created = repository.create({
    userId: null,
    handle: resolvedHandle,
    handleNormalized: `${resolvedHandle.toLowerCase()}@${homeServer}`,
    clientRequestId: null,
    isLocal: false,
    homeServer,
    canonicalUri: document.id,
    inboxUri: document.inbox,
    sharedInboxUri: document.endpoints?.sharedInbox ?? null,
    publicKeyPem: document.publicKey?.publicKeyPem ?? null,
    outboxUri: null,
    federationState: null,
    lastFetchedAt: new Date(),
  });
  return repository.save(created);
}
