import { dateToTimestamp } from '@patches/proto';
import type {
  Community as ProtoCommunity,
  Label as ProtoLabel,
  Labeler as ProtoLabeler,
  LabelVocabularyEntry as ProtoLabelVocabularyEntry,
} from '@patches/proto';
import { CommunityRole, LabelAction as ProtoLabelAction } from '@patches/proto/nest';
import type { LabelAction as DbLabelAction } from '@patches/database';

import { toProtoActor } from '../auth/auth.mapper.js';
import type { CommunitySummaryView } from '../posts/post.dto.js';
import type { LabelerVocabularyEntryView, LabelerView, LabelView } from './label.dto.js';

/** Application DTO → protobuf message (spec §128), field-by-field — see `auth.mapper.ts`'s
 * comment on why never a spread. */

const DB_TO_PROTO_LABEL_ACTION: Readonly<Record<DbLabelAction, ProtoLabelAction>> = Object.freeze({
  IGNORE: ProtoLabelAction.LABEL_ACTION_IGNORE,
  WARN: ProtoLabelAction.LABEL_ACTION_WARN,
  COLLAPSE: ProtoLabelAction.LABEL_ACTION_COLLAPSE,
  HIDE: ProtoLabelAction.LABEL_ACTION_HIDE,
});

export function labelActionToProto(action: DbLabelAction): ProtoLabelAction {
  return DB_TO_PROTO_LABEL_ACTION[action];
}

/** Same "not loaded here" reasoning `post.mapper.ts#toProtoCommunitySummary` documents — a
 * `Labeler.community` badge is not `CommunityService.GetCommunity`'s full projection. */
function toProtoCommunitySummary(summary: CommunitySummaryView): ProtoCommunity {
  return {
    id: summary.id,
    name: summary.name,
    displayName: summary.displayName,
    description: summary.description,
    rules: summary.rules,
    createdBy: undefined,
    isPublic: summary.isPublic,
    createdAt: dateToTimestamp(summary.createdAt),
    updatedAt: dateToTimestamp(summary.updatedAt),
    counts: undefined,
    viewerRole: CommunityRole.COMMUNITY_ROLE_UNSPECIFIED,
  };
}

/** Exported for `system/node.service.ts#getNodePolicy` (P14-026, spec §200.3/§203) — the node's
 * own `GetNodePolicy.label_vocabulary` publishes exactly the same view/mapping a labeler's own
 * vocabulary entry gets everywhere else, mandatory flag included. */
export function toProtoVocabularyEntry(
  entry: LabelerVocabularyEntryView,
): ProtoLabelVocabularyEntry {
  return {
    value: entry.value,
    description: entry.description,
    defaultAction: labelActionToProto(entry.defaultAction),
    mandatory: entry.mandatory,
  };
}

export function toProtoLabeler(view: LabelerView): ProtoLabeler {
  return {
    id: view.id,
    actor: view.actor === null ? undefined : toProtoActor(view.actor),
    community: view.community === null ? undefined : toProtoCommunitySummary(view.community),
    isNodeLabeler: view.isNodeLabeler,
    vocabulary: view.vocabulary.map(toProtoVocabularyEntry),
    createdAt: dateToTimestamp(view.createdAt),
  };
}

export function toProtoLabel(view: LabelView): ProtoLabel {
  return {
    id: view.id,
    labelerId: view.labelerId,
    subjectActorId: view.subjectActorId ?? '',
    subjectPostId: view.subjectPostId ?? '',
    value: view.value,
    createdAt: dateToTimestamp(view.createdAt),
    expiresAt: view.expiresAt === null ? undefined : dateToTimestamp(view.expiresAt),
    retractedAt: view.retractedAt === null ? undefined : dateToTimestamp(view.retractedAt),
  };
}
