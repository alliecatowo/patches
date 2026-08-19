import type { LabelAction as DbLabelAction, LabelSubjectType } from '@patches/database';

import type { ActorSummary } from '../auth/auth.dto.js';
import type { CommunitySummaryView } from '../posts/post.dto.js';

/**
 * `LabelService`'s own vocabulary (spec §128–129) — a `Labeler`/`Label`/`LabelerSubscription`/
 * `LabelerSubscriptionAction` entity never reaches `LabelController`.
 */

/** One entry of a labeler's own closed, node-published vocabulary (spec §200.2) — the
 * allow-list `ApplyLabel`/`SetLabelerSubscriptionAction` validate `value` against. */
export interface LabelerVocabularyEntryView {
  value: string;
  description: string;
  defaultAction: DbLabelAction;
  /** True when a viewer may not set this value's action to `IGNORE` (spec §200.3). */
  mandatory: boolean;
}

export interface LabelerView {
  id: string;
  /** Exactly one of `actor`/`community` is set for a non-node labeler; both are `null` for
   * the node's own labeler (`isNodeLabeler`, spec §202). */
  actor: ActorSummary | null;
  community: CommunitySummaryView | null;
  isNodeLabeler: boolean;
  vocabulary: LabelerVocabularyEntryView[];
  createdAt: Date;
}

export interface LabelerListPage {
  labelers: LabelerView[];
  nextCursor: string;
  hasMore: boolean;
}

export interface LabelView {
  id: string;
  labelerId: string;
  subjectType: LabelSubjectType;
  subjectActorId: string | null;
  subjectPostId: string | null;
  value: string;
  createdAt: Date;
  /** `null` means this label never expires. */
  expiresAt: Date | null;
  /** `null` means not retracted. */
  retractedAt: Date | null;
}

export interface LabelListPage {
  labels: LabelView[];
  nextCursor: string;
  hasMore: boolean;
}
