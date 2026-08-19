import {
  MAX_FILTER_LIST_DESCRIPTION_CHARS,
  MAX_FILTER_LIST_DISPLAY_NAME_CHARS,
  MAX_FILTER_LIST_ENTRIES,
  MAX_FILTER_LIST_NAME_CHARS,
  sanitizeText,
} from '@patches/domain';
import { z } from 'zod';

import { AppError } from '../../common/errors/app-error.js';
import type { FilterTermInput } from '../filters/filter.dto.js';
import { parseFilterTermValue } from '../filters/validation.js';

/** Service-boundary validation for `FilterListService` inputs (spec §58, §199, §204). Reuses
 * `filters/validation.ts#parseFilterTermValue` for one-term sanitizing — filter list entries
 * and personal filter terms share the exact same five kinds and the exact same literal-value
 * shape (spec §199.1's "the §198.2 kinds"). */

export const uuidInputSchema = z.uuid('must be a valid id');

export function parseFilterListName(raw: string): string {
  const value = sanitizeText(raw).trim();
  if (value.length === 0) throw AppError.validation('Filter list name is required.');
  if (value.length > MAX_FILTER_LIST_NAME_CHARS) {
    throw AppError.validation(
      `Filter list name must be at most ${String(MAX_FILTER_LIST_NAME_CHARS)} characters.`,
    );
  }
  return value;
}

export function parseFilterListDisplayName(raw: string): string {
  const value = sanitizeText(raw).trim();
  if (value.length === 0) throw AppError.validation('Display name is required.');
  if (value.length > MAX_FILTER_LIST_DISPLAY_NAME_CHARS) {
    throw AppError.validation(
      `Display name must be at most ${String(MAX_FILTER_LIST_DISPLAY_NAME_CHARS)} characters.`,
    );
  }
  return value;
}

export function parseFilterListDescription(raw: string): string {
  const value = sanitizeText(raw, { multiline: true }).trim();
  if (value.length > MAX_FILTER_LIST_DESCRIPTION_CHARS) {
    throw AppError.validation(
      `Description must be at most ${String(MAX_FILTER_LIST_DESCRIPTION_CHARS)} characters.`,
    );
  }
  return value;
}

/** Validates and sanitizes up to {@link MAX_FILTER_LIST_ENTRIES} entries (spec §204) — a
 * literal value only, same rule `filters/validation.ts#parseFilterTerms` documents. */
export function parseFilterListEntries(raw: readonly FilterTermInput[]): FilterTermInput[] {
  if (raw.length === 0) throw AppError.validation('A filter list needs at least one entry.');
  if (raw.length > MAX_FILTER_LIST_ENTRIES) {
    throw AppError.validation(
      `A filter list can have at most ${String(MAX_FILTER_LIST_ENTRIES)} entries.`,
    );
  }
  return raw.map((entry) => ({ kind: entry.kind, value: parseFilterTermValue(entry.value) }));
}

const FILTER_LIST_UPDATE_PATHS = new Set(['display_name', 'description', 'entries']);

export function parseFilterListUpdateMask(paths: readonly string[]): ReadonlySet<string> {
  for (const path of paths) {
    if (!FILTER_LIST_UPDATE_PATHS.has(path)) {
      throw AppError.validation(`update_mask contains unsupported path: ${path}.`);
    }
  }
  return new Set(paths);
}

/** Same shape/behavior as every other feature module's local copy. */
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
