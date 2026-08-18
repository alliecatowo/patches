import { ACTIVITYSTREAMS_CONTEXT } from '../federation.constants.js';
import {
  localActorFollowersUri,
  localActorFollowingUri,
  localActorInboxUri,
  localActorKeyId,
  localActorOutboxUri,
  localActorUri,
  localSharedInboxUri,
} from './uris.js';

/** Loosely-typed AS2 document — every field this node reads/writes is named explicitly at the
 * call site instead of a rigid interface, because AS2/JSON-LD documents are open-world by
 * design (`docs/research/activitypub.md`) and a remote peer's document may carry properties
 * this node has no opinion about. */
export type ActivityStreamsDocument = Record<string, unknown>;

export interface LocalActorInput {
  handleNormalized: string;
  displayName: string | null;
  bio: string | null;
  publicKeyPem: string;
  /** Absolute URL, already resolved through media's public delivery path — the AS2 document
   * only ever gets a plain URL, never a media id. */
  avatarUrl?: string;
  /** P8-007: this actor's Page manifest, if it has one (`docs/architecture/federation.md`
   * §7.5) — slugs plus the fetch URL, nothing else. Omitted entirely (not even an empty
   * array) when the actor has no Page, so a plain ActivityPub server that ignores the
   * `patches:pageManifest` extension term sees an ordinary actor either way. */
  pageManifest?: { slug: string; url: string }[];
}

/** Builds this node's own actor document for `GET /users/:handle` (P8-001). */
export function buildActorDocument(
  origin: string,
  actor: LocalActorInput,
): ActivityStreamsDocument {
  const id = localActorUri(origin, actor.handleNormalized);
  const doc: ActivityStreamsDocument = {
    '@context': ACTIVITYSTREAMS_CONTEXT,
    id,
    type: 'Person',
    preferredUsername: actor.handleNormalized,
    name: actor.displayName ?? actor.handleNormalized,
    summary: actor.bio ?? undefined,
    inbox: localActorInboxUri(origin, actor.handleNormalized),
    outbox: localActorOutboxUri(origin, actor.handleNormalized),
    followers: localActorFollowersUri(origin, actor.handleNormalized),
    following: localActorFollowingUri(origin, actor.handleNormalized),
    endpoints: { sharedInbox: localSharedInboxUri(origin) },
    publicKey: {
      id: localActorKeyId(origin, actor.handleNormalized),
      owner: id,
      publicKeyPem: actor.publicKeyPem,
    },
  };
  if (actor.avatarUrl !== undefined) {
    doc.icon = { type: 'Image', url: actor.avatarUrl };
  }
  if (actor.pageManifest !== undefined && actor.pageManifest.length > 0) {
    doc.pageManifest = actor.pageManifest;
  }
  return prune(doc);
}

export interface LocalNoteInput {
  id: string;
  attributedTo: string;
  content: string;
  published: Date;
  /** AS2 object URI of the post this replies to, or `null` for a root post. */
  inReplyTo: string | null;
  /** `true` for `PUBLIC`, mapped to the AS2 public-addressing convention (`to`:
   * `https://www.w3.org/ns/activitystreams#Public`). Patches' `UNLISTED`/`FOLLOWERS`
   * visibilities are not federated in F1 — `FederationGateway.publishPost` only ever calls
   * this for `PUBLIC` posts. */
  followersUri: string;
}

export function buildNoteObject(note: LocalNoteInput): ActivityStreamsDocument {
  return prune({
    id: note.id,
    type: 'Note',
    attributedTo: note.attributedTo,
    content: note.content,
    published: note.published.toISOString(),
    inReplyTo: note.inReplyTo,
    to: ['https://www.w3.org/ns/activitystreams#Public'],
    cc: [note.followersUri],
  });
}

/** Wraps `object` in a `{type, id, actor, object}` activity — every AS2 side-effecting
 * message this node sends (`Follow`/`Accept`/`Undo`/`Create`/`Delete`/`Like`) has exactly
 * this shape (`docs/research/activitypub.md`). `id` is this activity's own URI, minted by the
 * caller (`ActivityIdService`) so every delivered activity is individually addressable and
 * dedupe-able by the receiving peer. */
export function buildActivity(input: {
  id: string;
  type: string;
  actor: string;
  object: string | ActivityStreamsDocument;
  to?: string[];
  cc?: string[];
}): ActivityStreamsDocument {
  return prune({
    '@context': ACTIVITYSTREAMS_CONTEXT,
    id: input.id,
    type: input.type,
    actor: input.actor,
    object: input.object,
    to: input.to,
    cc: input.cc,
  });
}

/** `Delete` carries a bare `Tombstone` object, per AS2 §6.4/AP §6.4 — not a full re-serialized
 * `Note`, since the point of a delete is that the content no longer exists. */
export function buildTombstone(id: string, formerType = 'Note'): ActivityStreamsDocument {
  return { id, type: 'Tombstone', formerType };
}

/** The outbox's top-level `OrderedCollection` (B-027: real pagination) — `totalItems` plus a
 * `first` link into `buildOutboxPage`'s keyset-paginated pages. AS2/AP convention (matching
 * Mastodon and other implementations) is that the collection itself never carries
 * `orderedItems` once paging is in play; a client always follows `first`/`next`. */
export function buildOutboxCollection(
  id: string,
  totalItems: number,
  firstPageUri: string,
): ActivityStreamsDocument {
  return {
    '@context': ACTIVITYSTREAMS_CONTEXT,
    id,
    type: 'OrderedCollection',
    totalItems,
    first: firstPageUri,
  };
}

/** One keyset page of the outbox (B-027) — `partOf` points back at the collection, `next` is
 * present only when another page exists (same "omit rather than null" convention as `prune`
 * gives every other AS2 document here). */
export function buildOutboxPage(input: {
  id: string;
  partOf: string;
  items: ActivityStreamsDocument[];
  next?: string | undefined;
}): ActivityStreamsDocument {
  return prune({
    '@context': ACTIVITYSTREAMS_CONTEXT,
    id: input.id,
    type: 'OrderedCollectionPage',
    partOf: input.partOf,
    orderedItems: input.items,
    next: input.next,
  });
}

/** RFC 7033 JRD for `GET /.well-known/webfinger` (P8-001). */
export function buildWebfingerJrd(
  acct: string,
  actorUri: string,
): { subject: string; links: { rel: string; type: string; href: string }[] } {
  return {
    subject: `acct:${acct}`,
    links: [{ rel: 'self', type: 'application/activity+json', href: actorUri }],
  };
}

/** Drops `undefined` values so the emitted JSON never carries an explicit `null`/`undefined`
 * for an AS2 property that should simply be absent (AS2 has no concept of "present but
 * empty" for most properties). `null` is preserved — `inReplyTo: null` is meaningful AS2
 * (Mastodon itself emits it for a root post). */
function prune(doc: ActivityStreamsDocument): ActivityStreamsDocument {
  const result: ActivityStreamsDocument = {};
  for (const [key, value] of Object.entries(doc)) {
    if (value !== undefined) result[key] = value;
  }
  return result;
}
