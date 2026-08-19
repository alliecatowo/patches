import {
  COMMUNITY_NAME_PATTERN,
  MAX_COMMUNITY_DESCRIPTION_CHARS,
  MAX_COMMUNITY_DISPLAY_NAME_CHARS,
  MAX_COMMUNITY_RULES_BYTES,
  sanitizeText,
  utf8ByteLength,
} from '@patches/domain';
import { z } from 'zod';

import { AppError } from '../../common/errors/app-error.js';

/**
 * Service-boundary validation for `CommunityService` inputs (spec §58, §103, §182.1, §192).
 */

export const uuidInputSchema = z.uuid('must be a valid id');

/** §182.1's reserved-name blocklist — "admin, mod, system, patches, support, …" plus a
 * handful of other obvious operational/impersonation risks the spec's "…" leaves to this
 * node. Community names are already constrained to `[a-z0-9_]` by
 * {@link COMMUNITY_NAME_PATTERN}, so no case-folding/normalization is needed to match against
 * this set. */
const RESERVED_COMMUNITY_NAMES: ReadonlySet<string> = new Set([
  'admin',
  'administrator',
  'mod',
  'mods',
  'moderator',
  'moderators',
  'system',
  'patches',
  'support',
  'staff',
  'help',
  'official',
  'root',
  'api',
  'www',
  'null',
  'undefined',
  'everyone',
  'here',
  'announcement',
  'announcements',
  'security',
]);

/** `[a-z0-9_]{3,32}`, not on the reserved-name blocklist (§182.1, §192). Community names are
 * ASCII-only by grammar, so the character allow-list alone already rejects control
 * characters, bidirectional overrides, zero-width characters, and combining-mark pileups —
 * none of those are `[a-z0-9_]` — with no separate blocklist needed for that part. */
export function parseCommunityName(raw: string): string {
  const name = raw.normalize('NFKC');
  if (!COMMUNITY_NAME_PATTERN.test(name)) {
    throw AppError.validation(
      'Community name must be 3-32 characters: lowercase letters, digits, and underscores only.',
    );
  }
  if (RESERVED_COMMUNITY_NAMES.has(name)) {
    throw AppError.validation('That community name is reserved.');
  }
  return name;
}

export function parseCommunityDisplayName(raw: string): string {
  const value = sanitizeText(raw).trim();
  if (value.length === 0) throw AppError.validation('Display name is required.');
  if (value.length > MAX_COMMUNITY_DISPLAY_NAME_CHARS) {
    throw AppError.validation(
      `Display name must be at most ${String(MAX_COMMUNITY_DISPLAY_NAME_CHARS)} characters.`,
    );
  }
  return value;
}

export function parseCommunityDescription(raw: string): string {
  const value = sanitizeText(raw, { multiline: true }).trim();
  if (value.length > MAX_COMMUNITY_DESCRIPTION_CHARS) {
    throw AppError.validation(
      `Description must be at most ${String(MAX_COMMUNITY_DESCRIPTION_CHARS)} characters.`,
    );
  }
  return value;
}

/** Rendered client-side as a safe Markdown subset (§172, §182.3) — this layer only sanitizes
 * and bounds it; it is inert text, never parsed as code or a template here. */
export function parseCommunityRules(raw: string): string {
  const value = sanitizeText(raw, { multiline: true }).trim();
  if (utf8ByteLength(value) > MAX_COMMUNITY_RULES_BYTES) {
    throw AppError.validation(`Rules must be at most ${String(MAX_COMMUNITY_RULES_BYTES)} bytes.`);
  }
  return value;
}

const COMMUNITY_UPDATE_PATHS = new Set(['display_name', 'description', 'rules', 'is_public']);

export function parseCommunityUpdateMask(paths: readonly string[]): ReadonlySet<string> {
  for (const path of paths) {
    if (!COMMUNITY_UPDATE_PATHS.has(path)) {
      throw AppError.validation(`update_mask contains unsupported path: ${path}.`);
    }
  }
  return new Set(paths);
}

/** Moderator-facing only, never shown to the public (§58-style bound, mirrors
 * `community_bans.reason`). Bounded generously — this is a short note, not a report body. */
const MAX_MODERATION_REASON_CHARS = 500;

export function parseModerationReason(raw: string): string | null {
  const value = sanitizeText(raw, { multiline: true }).trim();
  if (value.length === 0) return null;
  if (value.length > MAX_MODERATION_REASON_CHARS) {
    throw AppError.validation(
      `Reason must be at most ${String(MAX_MODERATION_REASON_CHARS)} characters.`,
    );
  }
  return value;
}

/** Same shape/behavior as `modules/graph/graph.service.ts`'s local `parseInput` — kept local
 * rather than a cross-module import for the same reason documented in every other feature
 * module's copy of this helper. */
export function parseInput<Schema extends z.ZodType>(
  schema: Schema,
  value: unknown,
): z.infer<Schema> {
  const result = schema.safeParse(value);
  if (result.success) return result.data;

  const details = result.error.issues
    .map((issue) => {
      const path = issue.path.join('.');
      return path.length === 0 ? issue.message : `${path}: ${issue.message}`;
    })
    .join('; ');
  throw AppError.validation(details.length === 0 ? 'Invalid request.' : details);
}
