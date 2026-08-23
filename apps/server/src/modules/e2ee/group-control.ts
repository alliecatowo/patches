import {
  E2eeDeviceIdentity as E2eeDeviceIdentityEntity,
  E2eeGroupControlEvent as E2eeGroupControlEventEntity,
} from '@patches/database';
import {
  assertGroupControlShape,
  assertGroupControlSucceeds,
  bytesEqual,
  canonicalGroupControlTranscript,
  E2eeContractError,
  groupControlGenesisTip,
  verifyGroupControlSignature,
  type E2eeGroupControlEventView,
  type E2eeGroupChangeKind,
} from '@patches/domain';
import {
  dateToTimestamp,
  type E2eeGroupControlEvent as E2eeGroupControlEventProto,
} from '@patches/proto';
// Value (not type-only) import from the nest entry, deliberately: `@patches/proto`'s root
// entry re-exports this enum as a *type* only, so a value import through it is `undefined`
// at runtime — the same trap `e2ee.mapper.ts`'s own import comment documents.
import { E2eeGroupChangeKind as E2eeGroupChangeKindProto } from '@patches/proto/nest';
import { IsNull, type EntityManager } from 'typeorm';

import { AppError } from '../../common/errors/app-error.js';
import { e2eeDigest, e2eeSignatureVerifier } from './e2ee-crypto.adapter.js';
import { toBytes } from './e2ee.codec.js';

/**
 * The conversation-level counterpart of `roster-chain.ts`: the one place the monotonic,
 * device-signed group-control transcript is enforced (ADR 0020 §7, P13-008).
 *
 * Where a device roster chains an actor's *devices*, this chain chains a conversation's
 * *membership* — every `AddE2eeMember`/`RemoveE2eeMember` appends exactly one link, the
 * link's position is the membership epoch, and every accepted send must name the epoch it
 * was composed under (`assertMembershipEpochCurrent`). A node can still refuse to serve the
 * transcript, but it cannot rewrite "who was in the group when" without breaking a digest
 * link a member already verified.
 *
 * Unlike `roster-chain.ts`, the canonical transcript encoder lives in `@patches/domain`
 * (`canonicalGroupControlTranscript`, ADR 0020 §14.1) — there is no server-side second
 * encoder to keep in agreement by coincidence.
 */

/** Loads the conversation's current membership state: epoch and transcript digest. Epoch 1
 * (no events yet) is the creation membership, chained from the all-zero genesis digest. */
export async function loadCurrentGroupControl(
  manager: EntityManager,
  conversationId: string,
): Promise<{ readonly epoch: bigint; readonly digest: Uint8Array }> {
  const last = await manager.getRepository(E2eeGroupControlEventEntity).findOne({
    where: { conversationId },
    order: { epoch: 'DESC' },
  });
  if (last === null) return groupControlGenesisTip();
  return { epoch: BigInt(last.epoch), digest: toBytes(last.digest) };
}

export function toGroupControlEventView(
  row: E2eeGroupControlEventEntity,
): E2eeGroupControlEventView {
  return {
    conversationId: row.conversationId,
    epoch: BigInt(row.epoch),
    change: row.changeKind,
    subjectActorId: row.subjectActorId,
    signerActorId: row.signerActorId,
    signerDeviceId: row.signerDeviceId,
    previousDigest: toBytes(row.previousDigest),
    digest: toBytes(row.digest),
    eventBytes: toBytes(row.eventBytes),
    deviceSignature: toBytes(row.deviceSignature),
    createdAt: row.createdAt,
  };
}

export function toProtoGroupControlEvent(
  row: E2eeGroupControlEventEntity,
): E2eeGroupControlEventProto {
  return {
    conversationId: row.conversationId,
    epoch: row.epoch,
    change:
      row.changeKind === 'ADDED'
        ? E2eeGroupChangeKindProto.E2EE_GROUP_CHANGE_KIND_ADDED
        : E2eeGroupChangeKindProto.E2EE_GROUP_CHANGE_KIND_REMOVED,
    subjectActorId: row.subjectActorId,
    signerActorId: row.signerActorId,
    signerDeviceId: row.signerDeviceId,
    previousDigest: row.previousDigest,
    digest: row.digest,
    eventBytes: row.eventBytes,
    deviceSignature: row.deviceSignature,
    createdAt: dateToTimestamp(row.createdAt),
  };
}

function wrapContractError(
  error: unknown,
  code: 'E2EE_GROUP_CONTROL_INVALID' | 'E2EE_GROUP_CONTROL_CONFLICT',
): never {
  if (error instanceof E2eeContractError) throw new AppError(code, error.message);
  throw error;
}

export interface AppendGroupControlEventInput {
  readonly conversationId: string;
  /** The authenticated caller — must be the actor whose device signed the event. */
  readonly signerActorId: string;
  /** What this RPC is doing; the event must agree. */
  readonly expectedChange: E2eeGroupChangeKind;
  readonly expectedSubjectActorId: string;
  readonly event: E2eeGroupControlEventProto | undefined;
}

/** What `appendGroupControlEvent` proved about the signer, so the caller does not re-load
 * the row: the signer's device was an active certified device of the calling actor at
 * accept time. Membership itself (signer is a member, subject is/is not one) stays with the
 * caller — it owns the membership rows. */
export interface AppendedGroupControlEvent {
  readonly row: E2eeGroupControlEventEntity;
  readonly epoch: bigint;
}

/**
 * Verifies and appends one group-control event to the conversation's transcript, inside the
 * caller's transaction (`manager`). Shared by `AddE2eeMember` and `RemoveE2eeMember` — both
 * are "verify this device-signed event chains onto the current tip, then persist it".
 *
 * Race safety: two concurrent transitions both compute the same next epoch; the
 * `(conversation_id, epoch)` unique index makes exactly one insert win, and the loser is
 * told to re-compose (`E2EE_GROUP_CONTROL_CONFLICT`) rather than silently overwriting
 * history. No conversation-row lock is taken, so a transition never deadlocks against a
 * concurrent send's `FOR SHARE` locks (members → devices) — it conflicts only where the
 * semantics demand it: the membership rows it mutates.
 */
export async function appendGroupControlEvent(
  manager: EntityManager,
  input: AppendGroupControlEventInput,
): Promise<AppendedGroupControlEvent> {
  const proto = input.event;
  if (proto === undefined) throw AppError.validation('A signed group-control event is required.');

  if (proto.conversationId !== input.conversationId) {
    throw AppError.validation('The event names a different conversation.');
  }
  const change = proto.change;
  if (
    (input.expectedChange === 'ADDED' &&
      change !== E2eeGroupChangeKindProto.E2EE_GROUP_CHANGE_KIND_ADDED) ||
    (input.expectedChange === 'REMOVED' &&
      change !== E2eeGroupChangeKindProto.E2EE_GROUP_CHANGE_KIND_REMOVED)
  ) {
    throw AppError.validation(`This transition must be an ${input.expectedChange} event.`);
  }
  if (proto.subjectActorId !== input.expectedSubjectActorId) {
    throw AppError.validation('The event subject does not match the requested actor.');
  }
  if (proto.signerActorId !== input.signerActorId) {
    throw AppError.validation('The event must be signed by the calling actor.');
  }
  if (proto.signerDeviceId.length === 0) {
    throw AppError.validation('The signing device id is required.');
  }

  let epoch: bigint;
  try {
    epoch = BigInt(proto.epoch);
  } catch (error) {
    throw AppError.validation('Event epoch is not a valid integer.', { cause: error });
  }

  const view: E2eeGroupControlEventView = {
    conversationId: input.conversationId,
    epoch,
    change: input.expectedChange,
    subjectActorId: proto.subjectActorId,
    signerActorId: proto.signerActorId,
    signerDeviceId: proto.signerDeviceId,
    previousDigest: toBytes(proto.previousDigest),
    digest: toBytes(proto.digest),
    eventBytes: toBytes(proto.eventBytes),
    deviceSignature: toBytes(proto.deviceSignature),
    createdAt: new Date(),
  };

  // `event_bytes` is authoritative (same rule as `roster_bytes`): the decoded convenience
  // fields are accepted only because this re-encode of them reproduces the signed bytes.
  if (!bytesEqual(canonicalGroupControlTranscript(view), view.eventBytes)) {
    throw new AppError(
      'E2EE_GROUP_CONTROL_INVALID',
      'Event fields do not match the signed event transcript.',
    );
  }

  // The signer's device must be an active certified device of the calling actor — the
  // "device-certified" half of ADR 0020 §7's "root/device-certified group control events".
  // The public key comes from the stored certificate chain, never from the event.
  const now = new Date();
  const signerDevice = await manager.getRepository(E2eeDeviceIdentityEntity).findOne({
    where: { actorId: input.signerActorId, deviceId: proto.signerDeviceId, revokedAt: IsNull() },
  });
  if (signerDevice === null || signerDevice.expiresAt.getTime() <= now.getTime()) {
    throw new AppError(
      'E2EE_DEVICE_NOT_FOUND',
      'The signing device is not an active certified device of this actor.',
    );
  }

  try {
    assertGroupControlShape(view);
    verifyGroupControlSignature(view, toBytes(signerDevice.signingPublicKey), {
      verifier: e2eeSignatureVerifier,
      digest: e2eeDigest,
    });
  } catch (error) {
    wrapContractError(error, 'E2EE_GROUP_CONTROL_INVALID');
  }

  const tip = await loadCurrentGroupControl(manager, input.conversationId);
  try {
    assertGroupControlSucceeds(
      tip.epoch === 1n ? null : { epoch: tip.epoch, digest: tip.digest },
      view,
    );
  } catch (error) {
    wrapContractError(error, 'E2EE_GROUP_CONTROL_CONFLICT');
  }

  const repo = manager.getRepository(E2eeGroupControlEventEntity);
  // `create` + `save` (not `insert`) so the returned row carries the DB-generated id and
  // `created_at` the response echoes — the same pattern `appendRoster` uses.
  const saved = await repo
    .save(
      repo.create({
        conversationId: input.conversationId,
        epoch: epoch.toString(),
        changeKind: input.expectedChange,
        subjectActorId: proto.subjectActorId,
        signerActorId: proto.signerActorId,
        signerDeviceId: proto.signerDeviceId,
        previousDigest: Buffer.from(view.previousDigest),
        digest: Buffer.from(view.digest),
        eventBytes: Buffer.from(view.eventBytes),
        deviceSignature: Buffer.from(view.deviceSignature),
      }),
    )
    .catch((error: unknown) => {
      // Unique (conversation_id, epoch) — a concurrent transition won the race to this
      // epoch; the loser re-reads state and retries rather than overwriting history.
      throw new AppError(
        'E2EE_GROUP_CONTROL_CONFLICT',
        'The membership epoch advanced concurrently; re-read the conversation state and retry.',
        { cause: error },
      );
    });

  return { row: saved, epoch };
}
