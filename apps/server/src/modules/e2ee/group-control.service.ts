import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import {
  Actor as ActorEntity,
  Block as BlockEntity,
  Conversation as ConversationEntity,
  ConversationMember as ConversationMemberEntity,
  E2eeGroupControlEvent as E2eeGroupControlEventEntity,
} from '@patches/database';
import { assertGroupSizeWithinBound, E2EE_GROUP_MAX_MEMBERS } from '@patches/domain';
import {
  type AddE2eeMemberRequest,
  type AddE2eeMemberResponse,
  type ListE2eeGroupControlEventsRequest,
  type ListE2eeGroupControlEventsResponse,
  type RemoveE2eeMemberRequest,
  type RemoveE2eeMemberResponse,
} from '@patches/proto/nest';
import { DataSource, type EntityManager } from 'typeorm';

import { AppError } from '../../common/errors/app-error.js';
import { mayMessageDirectly } from '../messages/direct-message-eligibility.js';
import { E2eeRateLimitService } from './e2ee-rate-limit.service.js';
import { appendGroupControlEvent, toProtoGroupControlEvent } from './group-control.js';

const DEFAULT_LIST_LIMIT = 50;
const MAX_LIST_LIMIT = 200;

/**
 * `E2eeService`'s group membership transitions: `AddE2eeMember`, `RemoveE2eeMember`,
 * `ListE2eeGroupControlEvents` (ADR 0020 §7, P13-008). Small groups stay pairwise — every
 * sender device encrypts to every member device — so this module's whole job is the
 * *authenticated roster transition*: verify the device-signed control event, append it to
 * the conversation's monotonic transcript (bumping the membership epoch), and mutate the
 * membership row the fanout recomputes its expected device set from. No sender key, no MLS,
 * no group key distribution — none is needed at eight members (ADR 0020 §7's explicit
 * "Alternatives considered").
 *
 * Add/remove semantics (ADR 0020 §7, binding):
 *   * An added member receives messages sent from their epoch forward only — nothing is
 *     re-encrypted or replayed to them.
 *   * A removed member's devices are excluded from every later fanout: `leftAt` drops them
 *     from the member set, so a send addressing them is rejected as an unexpected target,
 *     a send composed under their epoch is rejected as stale, and their own sends fail the
 *     active-member check. Already-delivered mailbox envelopes stay readable — removal
 *     stops future payloads, it is not a remote wipe (the same line `RevokeDevice` holds).
 *
 * Concurrency: transitions serialize on the `(conversation_id, epoch)` unique index — two
 * racing transitions produce one `E2EE_GROUP_CONTROL_CONFLICT` for the loser, never two
 * events at one epoch. A racing send holds `FOR SHARE` member locks (`e2ee-fanout.ts`), so
 * a removal's `leftAt` UPDATE and a fanout accept serialize on the membership row the same
 * way `RevokeDevice` and the fanout serialize on the device row.
 */
@Injectable()
export class E2eeGroupService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly rateLimits: E2eeRateLimitService,
  ) {}

  async addE2eeMember(
    actorId: string,
    request: AddE2eeMemberRequest,
    peer: string | undefined = undefined,
  ): Promise<AddE2eeMemberResponse> {
    if (request.conversationId.length === 0) {
      throw AppError.validation('conversation_id is required.');
    }
    if (request.actorId.length === 0) throw AppError.validation('actor_id is required.');
    // The event's signed `signer_device_id` is authoritative; the request field is a
    // convenience echo, and disagreement is rejected rather than silently resolved.
    if (request.signerDeviceId !== request.event?.signerDeviceId) {
      throw AppError.validation(
        'signer_device_id does not match the device that signed the event.',
      );
    }

    await this.rateLimits.consumeGroupControl(actorId, peer);

    return this.dataSource.transaction(async (manager) => {
      const conversation = await requireE2eeConversation(manager, request.conversationId);
      const members = await loadMembers(manager, request.conversationId);
      requireActiveMember(members, actorId, 'Only an active member may add a member.');

      const existingRow = members.find((member) => member.actorId === request.actorId);
      if (existingRow !== undefined && existingRow.leftAt === null) {
        throw AppError.validation('This actor is already a member of this conversation.');
      }

      const subject = await manager
        .getRepository(ActorEntity)
        .findOne({ where: { id: request.actorId } });
      if (subject === null || subject.deletedAt !== null || !subject.isLocal) {
        throw subjectUnavailable();
      }

      const activeMembers = members.filter((member) => member.leftAt === null);
      for (const member of activeMembers) {
        if (member.actorId === request.actorId) continue;
        if (await blockedEitherDirection(manager, member.actorId, request.actorId)) {
          throw subjectUnavailable();
        }
      }

      // First-contact eligibility for the add's subject, the same `mayMessageDirectly`
      // semantics legacy DM creation enforces (spec §183.2; audit P1). Blocks above cover
      // every existing pair; this covers "the caller may contact this subject at all".
      // Rejoins of a previously-removed member are subject to it too — eligibility is
      // evaluated at transition time, never inherited from the original add.
      //
      // Audit P0-1(d), per ADR 0020 §7: a DIRECT-kind E2EE thread is its founding pairwise
      // conversation. Group-control growth — adding someone with no prior membership row —
      // would silently turn it into a three-person group wearing a DIRECT identity, which no
      // client renders as a group, and would break the pairwise DIRECT invariants (§1.1: a
      // row is never interpretable as both shapes). New members therefore require a
      // GROUP-kind conversation; rejoins of the founding pair stay allowed so remove/rejoin
      // remains symmetric on a 1:1 thread.
      if (conversation.kind === 'DIRECT' && existingRow === undefined) {
        throw AppError.validation(
          'A DIRECT-kind E2EE conversation cannot add new members. Create a GROUP-kind ' +
            'E2EE conversation instead.',
        );
      }
      if (!(await mayMessageDirectly(manager, actorId, request.actorId))) {
        throw subjectUnavailable();
      }

      try {
        assertGroupSizeWithinBound(activeMembers.length + 1);
      } catch (error) {
        throw new AppError(
          'E2EE_GROUP_CONTROL_CONFLICT',
          `An E2EE conversation may have at most ${String(E2EE_GROUP_MAX_MEMBERS)} members.`,
          { cause: error },
        );
      }

      const appended = await appendGroupControlEvent(manager, {
        conversationId: request.conversationId,
        signerActorId: actorId,
        expectedChange: 'ADDED',
        expectedSubjectActorId: request.actorId,
        event: request.event,
      });

      // A previously-removed member rejoins by reviving their row: `ConversationMember`'s
      // composite PK means their read state survives the removal, and a fresh row would
      // violate it anyway.
      if (existingRow === undefined) {
        await manager.getRepository(ConversationMemberEntity).insert({
          conversationId: request.conversationId,
          actorId: request.actorId,
        });
      } else {
        await manager
          .getRepository(ConversationMemberEntity)
          .update(
            { conversationId: request.conversationId, actorId: request.actorId },
            { leftAt: null },
          );
      }

      return {
        membershipEpoch: appended.epoch.toString(),
        event: toProtoGroupControlEvent(appended.row),
      };
    });
  }

  async removeE2eeMember(
    actorId: string,
    request: RemoveE2eeMemberRequest,
  ): Promise<RemoveE2eeMemberResponse> {
    if (request.conversationId.length === 0) {
      throw AppError.validation('conversation_id is required.');
    }
    if (request.actorId.length === 0) throw AppError.validation('actor_id is required.');
    // Same agreement check as `addE2eeMember`: the signed event is authoritative.
    if (request.signerDeviceId !== request.event?.signerDeviceId) {
      throw AppError.validation(
        'signer_device_id does not match the device that signed the event.',
      );
    }

    return this.dataSource.transaction(async (manager) => {
      await requireE2eeConversation(manager, request.conversationId);
      const members = await loadMembers(manager, request.conversationId);
      // The caller may remove themselves (a leave) or another member; either way they must
      // still be an active member — a removed member cannot remove anyone else.
      requireActiveMember(members, actorId, 'Only an active member may remove a member.');

      const subjectRow = members.find((member) => member.actorId === request.actorId);
      if (subjectRow === undefined || subjectRow.leftAt !== null) {
        throw AppError.validation('This actor is not an active member of this conversation.');
      }

      const appended = await appendGroupControlEvent(manager, {
        conversationId: request.conversationId,
        signerActorId: actorId,
        expectedChange: 'REMOVED',
        expectedSubjectActorId: request.actorId,
        event: request.event,
      });

      // Not a row delete, same as `LeaveConversation`: the transcript and the removed
      // member's own history survive, and `leftAt` is what every fanout from here on
      // excludes. Removing the last member is allowed — the conversation then simply has
      // no one left to send.
      await manager
        .getRepository(ConversationMemberEntity)
        .update(
          { conversationId: request.conversationId, actorId: request.actorId },
          { leftAt: new Date() },
        );

      return {
        membershipEpoch: appended.epoch.toString(),
        event: toProtoGroupControlEvent(appended.row),
      };
    });
  }

  async listGroupControlEvents(
    actorId: string,
    request: ListE2eeGroupControlEventsRequest,
  ): Promise<ListE2eeGroupControlEventsResponse> {
    if (request.conversationId.length === 0) {
      throw AppError.validation('conversation_id is required.');
    }
    const conversation = await this.dataSource
      .getRepository(ConversationEntity)
      .findOne({ where: { id: request.conversationId } });
    // Membership is looked up regardless of `leftAt` (audit P2): a *removed* member must
    // still be able to read the transcript up to and including their own removal event —
    // they lived those epochs and need the events to verify the transcripts their devices
    // already hold. Everything after their removal stays hidden, exactly like mailbox
    // envelopes stop at revocation without becoming a remote wipe (ADR 0020 §7).
    const membership =
      conversation === null
        ? null
        : await this.dataSource.getRepository(ConversationMemberEntity).findOne({
            where: { conversationId: request.conversationId, actorId },
          });
    if (conversation === null || conversation.securityMode !== 'E2EE_V1' || membership === null) {
      throw new AppError(
        'E2EE_CONVERSATION_NOT_FOUND',
        'No E2EE conversation with this id has you as an active member.',
      );
    }

    const limit = clampListLimit(request.limit);
    const afterEpoch =
      request.afterEpoch.length === 0 ? 0n : parseEpoch(request.afterEpoch, 'after_epoch');
    const cursorEpoch =
      request.cursor.length === 0
        ? afterEpoch
        : parseEpoch(decodeEpochCursor(request.cursor), 'cursor');
    const startEpoch = cursorEpoch > afterEpoch ? cursorEpoch : afterEpoch;

    // A past member's window ends at the last REMOVED event naming them — their removal, or
    // (defensively, if the row outlived its event) nothing at all.
    let endEpoch: bigint | null = null;
    if (membership.leftAt !== null) {
      const removal = await this.dataSource.getRepository(E2eeGroupControlEventEntity).findOne({
        where: {
          conversationId: request.conversationId,
          subjectActorId: actorId,
          changeKind: 'REMOVED',
        },
        order: { epoch: 'DESC' },
      });
      if (removal === null) {
        return { events: [], page: { nextCursor: '', hasMore: false } };
      }
      endEpoch = BigInt(removal.epoch);
    }

    const qb = this.dataSource
      .getRepository(E2eeGroupControlEventEntity)
      .createQueryBuilder('event')
      .where('event.conversationId = :conversationId', { conversationId: request.conversationId })
      .andWhere('event.epoch > :startEpoch', { startEpoch: startEpoch.toString() })
      .orderBy('event.epoch', 'ASC')
      .take(limit + 1);
    if (endEpoch !== null) {
      qb.andWhere('event.epoch <= :endEpoch', { endEpoch: endEpoch.toString() });
    }

    const rows = await qb.getMany();
    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    const last = page.at(-1);

    return {
      events: page.map(toProtoGroupControlEvent),
      page: {
        nextCursor: hasMore && last !== undefined ? encodeEpochCursor(BigInt(last.epoch)) : '',
        hasMore,
      },
    };
  }
}

/** The current membership of `conversationId`: every member row, active (`leftAt IS NULL`)
 * and past. Load-first so the caller can check the signer, find the subject's row for an
 * add-after-remove, and bound the size, from one committed snapshot. */
async function loadMembers(
  manager: EntityManager,
  conversationId: string,
): Promise<ConversationMemberEntity[]> {
  return manager.getRepository(ConversationMemberEntity).find({ where: { conversationId } });
}

async function requireE2eeConversation(
  manager: EntityManager,
  conversationId: string,
): Promise<ConversationEntity> {
  const conversation = await manager
    .getRepository(ConversationEntity)
    .findOne({ where: { id: conversationId } });
  if (conversation === null || conversation.securityMode !== 'E2EE_V1') {
    throw new AppError('E2EE_CONVERSATION_NOT_FOUND', 'No such E2EE conversation.');
  }
  return conversation;
}

function requireActiveMember(
  members: readonly ConversationMemberEntity[],
  actorId: string,
  message: string,
): void {
  const member = members.find((candidate) => candidate.actorId === actorId);
  if (member === undefined || member.leftAt !== null) {
    throw new AppError('E2EE_CONVERSATION_NOT_FOUND', message);
  }
}

/** Generic "cannot be added" failure — the same no-block-oracle discipline
 * `E2eeConversationService`'s own `actorNotFound()` documents (spec §62, §183.4): a caller
 * must not be able to tell "blocked" from "doesn't exist" from "not on this node". */
function subjectUnavailable(): AppError {
  return new AppError(
    'E2EE_CONVERSATION_NOT_FOUND',
    'This actor is unavailable for an E2EE conversation.',
  );
}

async function blockedEitherDirection(
  manager: EntityManager,
  first: string,
  second: string,
): Promise<boolean> {
  const block = await manager.getRepository(BlockEntity).findOne({
    where: [
      { blockerActorId: first, blockedActorId: second },
      { blockerActorId: second, blockedActorId: first },
    ],
  });
  return block !== null;
}

function clampListLimit(requested: number): number {
  if (!Number.isFinite(requested) || requested <= 0) return DEFAULT_LIST_LIMIT;
  return Math.min(Math.trunc(requested), MAX_LIST_LIMIT);
}

function parseEpoch(raw: string, label: string): bigint {
  try {
    const value = BigInt(raw);
    if (value < 0n) throw new Error('negative epoch');
    return value;
  } catch (error) {
    throw AppError.validation(`Invalid ${label}.`, { cause: error });
  }
}

function encodeEpochCursor(epoch: bigint): string {
  return Buffer.from(epoch.toString(), 'utf8').toString('base64url');
}

function decodeEpochCursor(raw: string): string {
  try {
    const decoded = Buffer.from(raw, 'base64url').toString('utf8');
    if (!/^\d+$/.test(decoded)) throw new Error('non-numeric cursor');
    return decoded;
  } catch (error) {
    throw AppError.validation('Invalid pagination cursor.', { cause: error });
  }
}
