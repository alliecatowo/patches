import {
  LABEL_ACTIONS,
  type LabelAction as DbLabelAction,
  type LabelSubjectType,
} from '@patches/database';
import { LabelAction as ProtoLabelAction, type LabelVocabularyEntry } from '@patches/proto/nest';
import { z } from 'zod';

import { AppError } from '../../common/errors/app-error.js';
import type { LabelerVocabularyEntryView } from './label.dto.js';

/**
 * Service-boundary validation for `LabelService` inputs (spec §58, §103, §200, §206).
 */

export const uuidInputSchema = z.uuid('must be a valid id');

export function parseInput<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw AppError.validation(result.error.issues[0]?.message ?? 'Invalid input.');
  }
  return result.data;
}

/** `[a-z0-9](-?[a-z0-9])*`, 1-40 characters — matches `LABEL_VOCABULARY`'s comma-separated
 * default entries (e.g. `needs-cw`) and is deliberately never free text (spec §200.2, §208). */
export const LABEL_VALUE_PATTERN = /^[a-z0-9](?:-?[a-z0-9])*$/;
export const MAX_LABEL_VALUE_CHARS = 40;
export const MAX_LABEL_DESCRIPTION_CHARS = 200;

/** A labeler's own vocabulary size isn't a number the spec states (§204 only bounds
 * subscriptions/rate — not vocabulary length); this is a local sanity ceiling, the same
 * "every new write path needs *a* limit" reasoning `tag.service.ts`'s
 * `SEARCH_TAGS_MAX_RESULTS` doc gives for its own not-spec-numbered constant. */
export const MAX_LABELER_VOCABULARY_ENTRIES = 50;

const PROTO_TO_DB_LABEL_ACTION: Readonly<Partial<Record<ProtoLabelAction, DbLabelAction>>> =
  Object.freeze({
    [ProtoLabelAction.LABEL_ACTION_IGNORE]: 'IGNORE',
    [ProtoLabelAction.LABEL_ACTION_WARN]: 'WARN',
    [ProtoLabelAction.LABEL_ACTION_COLLAPSE]: 'COLLAPSE',
    [ProtoLabelAction.LABEL_ACTION_HIDE]: 'HIDE',
  });

/** `LABEL_ACTION_UNSPECIFIED`/`UNRECOGNIZED` are never a valid action to persist — both a
 * vocabulary entry's `default_action` and `SetLabelerSubscriptionAction.action` must name a
 * real action (spec §200.1). */
export function labelActionFromProto(action: ProtoLabelAction): DbLabelAction {
  const mapped = PROTO_TO_DB_LABEL_ACTION[action];
  if (mapped === undefined) {
    throw AppError.validation('action must be one of IGNORE, WARN, COLLAPSE, HIDE.');
  }
  return mapped;
}

function parseVocabularyValue(raw: string): string {
  const value = raw.trim().toLowerCase();
  if (
    value.length === 0 ||
    value.length > MAX_LABEL_VALUE_CHARS ||
    !LABEL_VALUE_PATTERN.test(value)
  ) {
    throw AppError.validation(
      `Label value must be 1-${String(MAX_LABEL_VALUE_CHARS)} characters: lowercase letters, digits, and internal hyphens only.`,
    );
  }
  return value;
}

/** A labeler's closed vocabulary, validated at creation time (spec §200.2, §206): non-empty,
 * bounded, no duplicate values, every `default_action` a real action, `description` bounded. */
export function parseVocabulary(
  entries: readonly LabelVocabularyEntry[],
): LabelerVocabularyEntryView[] {
  if (entries.length === 0) {
    throw AppError.validation('A labeler must publish at least one vocabulary value.');
  }
  if (entries.length > MAX_LABELER_VOCABULARY_ENTRIES) {
    throw AppError.validation(
      `A labeler may publish at most ${String(MAX_LABELER_VOCABULARY_ENTRIES)} vocabulary values.`,
    );
  }
  const seen = new Set<string>();
  const parsed = entries.map((entry) => {
    const value = parseVocabularyValue(entry.value);
    if (seen.has(value)) {
      throw AppError.validation(`Duplicate vocabulary value: ${value}.`);
    }
    seen.add(value);
    if (entry.description.length > MAX_LABEL_DESCRIPTION_CHARS) {
      throw AppError.validation(
        `Vocabulary description must be at most ${String(MAX_LABEL_DESCRIPTION_CHARS)} characters.`,
      );
    }
    return {
      value,
      description: entry.description,
      defaultAction: labelActionFromProto(entry.defaultAction),
      mandatory: entry.mandatory,
    };
  });
  return parsed;
}

export interface ParsedSubject {
  subjectType: LabelSubjectType;
  subjectActorId: string | null;
  subjectPostId: string | null;
}

/** Exactly one of `subjectActorId`/`subjectPostId` must be a non-empty, valid id (spec §202 —
 * mirrors `reports`' subject shape). */
export function parseSubject(subjectActorIdRaw: string, subjectPostIdRaw: string): ParsedSubject {
  const hasActor = subjectActorIdRaw.length > 0;
  const hasPost = subjectPostIdRaw.length > 0;
  if (hasActor === hasPost) {
    throw AppError.validation('Exactly one of subject_actor_id/subject_post_id must be set.');
  }
  if (hasActor) {
    return {
      subjectType: 'ACTOR',
      subjectActorId: parseInput(uuidInputSchema, subjectActorIdRaw),
      subjectPostId: null,
    };
  }
  return {
    subjectType: 'POST',
    subjectActorId: null,
    subjectPostId: parseInput(uuidInputSchema, subjectPostIdRaw),
  };
}

export function parseLabelValue(raw: string): string {
  return parseVocabularyValue(raw);
}

/** `undefined` means "never expires" (proto's unset `Timestamp`); a caller-supplied expiry
 * must be strictly in the future — an already-expired label at creation time is nonsensical. */
export function parseExpiresAt(raw: Date | undefined, now: Date): Date | null {
  if (raw === undefined) return null;
  if (raw.getTime() <= now.getTime()) {
    throw AppError.validation('expires_at must be in the future.');
  }
  return raw;
}

const storedVocabularyEntrySchema = z.object({
  value: z.string(),
  description: z.string(),
  defaultAction: z.enum(LABEL_ACTIONS),
  mandatory: z.boolean(),
});

const storedVocabularySchema = z.array(storedVocabularyEntrySchema);

/** `labelers.vocabulary` is `jsonb` (column type `unknown` on the entity, see
 * `labeler.entity.ts`'s doc) — parsed defensively on read rather than blindly cast, since it's
 * only ever written by {@link parseVocabulary} but nothing at the database layer enforces its
 * shape. */
export function parseStoredVocabulary(raw: unknown): LabelerVocabularyEntryView[] {
  const result = storedVocabularySchema.safeParse(raw);
  if (!result.success) {
    throw AppError.internal('Stored labeler vocabulary is malformed.', { cause: result.error });
  }
  return result.data;
}
