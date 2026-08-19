import {
  FILTER_ACTIONS,
  FILTER_SCOPES,
  FILTER_TERM_KINDS,
  type FilterAction as DbFilterAction,
  type FilterScopeValue as DbFilterScope,
  type FilterTermKind as DbFilterTermKind,
} from '@patches/database';
import {
  MAX_FILTER_NAME_CHARS,
  MAX_FILTER_TERM_VALUE_CHARS,
  MAX_FILTER_TERMS_PER_FILTER,
  sanitizeText,
} from '@patches/domain';
import { z } from 'zod';

import { AppError } from '../../common/errors/app-error.js';
import type { FilterTermInput } from './filter.dto.js';

/** Service-boundary validation for `FilterService`/`FilterListService` inputs (spec §58, §198,
 * §199, §204). */

export const uuidInputSchema = z.uuid('must be a valid id');

export function parseFilterName(raw: string): string {
  const value = sanitizeText(raw).trim();
  if (value.length === 0) throw AppError.validation('Filter name is required.');
  if (value.length > MAX_FILTER_NAME_CHARS) {
    throw AppError.validation(
      `Filter name must be at most ${String(MAX_FILTER_NAME_CHARS)} characters.`,
    );
  }
  return value;
}

/** Shared by `filters.filter_list_id`-less `Filter.name` above and `FilterList.display_name`/
 * `.description` (`filter-list-validation.ts`) — same shape, different callers. */
export function parseBoundedText(raw: string, maxChars: number, label: string): string {
  const value = sanitizeText(raw, { multiline: true }).trim();
  if (value.length > maxChars) {
    throw AppError.validation(`${label} must be at most ${String(maxChars)} characters.`);
  }
  return value;
}

/**
 * Validates and sanitizes up to {@link MAX_FILTER_TERMS_PER_FILTER} terms (spec §204). A
 * literal value only — never a pattern (§198.2, §208's regex prohibition); this function's
 * job is bounding and sanitizing that literal, not interpreting it.
 */
export function parseFilterTerms(raw: readonly FilterTermInput[]): FilterTermInput[] {
  if (raw.length === 0) throw AppError.validation('A filter needs at least one term.');
  if (raw.length > MAX_FILTER_TERMS_PER_FILTER) {
    throw AppError.validation(
      `A filter can have at most ${String(MAX_FILTER_TERMS_PER_FILTER)} terms.`,
    );
  }
  return raw.map((term) => ({ kind: term.kind, value: parseFilterTermValue(term.value) }));
}

export function parseFilterTermValue(raw: string): string {
  const value = sanitizeText(raw).trim();
  if (value.length === 0) throw AppError.validation('A filter term value cannot be empty.');
  if (value.length > MAX_FILTER_TERM_VALUE_CHARS) {
    throw AppError.validation(
      `A filter term value must be at most ${String(MAX_FILTER_TERM_VALUE_CHARS)} characters.`,
    );
  }
  return value;
}

export function parseFilterScopes<Scope extends string>(raw: readonly Scope[]): Scope[] {
  if (raw.length === 0) throw AppError.validation('A filter needs at least one scope.');
  return [...new Set(raw)];
}

/** Validates a raw string from an `ImportFilters` payload against the database's own kind/
 * scope/action vocabularies — a plain JSON file has no protobuf enum to lean on, so these are
 * the import-path counterparts of `filter-enums.ts`'s proto-facing converters. */
export function parseDbFilterTermKind(raw: string): DbFilterTermKind {
  if (!(FILTER_TERM_KINDS as readonly string[]).includes(raw)) {
    throw AppError.validation(`Unrecognized term kind in import: ${raw}.`);
  }
  return raw as DbFilterTermKind;
}

export function parseDbFilterScope(raw: string): DbFilterScope {
  if (!(FILTER_SCOPES as readonly string[]).includes(raw)) {
    throw AppError.validation(`Unrecognized scope in import: ${raw}.`);
  }
  return raw as DbFilterScope;
}

export function parseDbFilterAction(raw: string): DbFilterAction {
  if (!(FILTER_ACTIONS as readonly string[]).includes(raw)) {
    throw AppError.validation(`Unrecognized action in import: ${raw}.`);
  }
  return raw as DbFilterAction;
}

const FILTER_UPDATE_PATHS = new Set(['name', 'terms', 'scopes', 'action', 'expires_at']);

export function parseFilterUpdateMask(paths: readonly string[]): ReadonlySet<string> {
  for (const path of paths) {
    if (!FILTER_UPDATE_PATHS.has(path)) {
      throw AppError.validation(`update_mask contains unsupported path: ${path}.`);
    }
  }
  return new Set(paths);
}

/** Same shape/behavior as every other feature module's local copy (`community-validation.ts`,
 * `tag.service.ts`) — kept local rather than a cross-module import for the same reason
 * documented there. */
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

/** `ExportFilters`/`ImportFilters`' plain JSON shape (spec §198.5): `{ "filters": [...] }`,
 * one entry per exported filter with term ids omitted (import assigns new ones). Kind/scope/
 * action are raw strings here, not yet validated against the database vocabularies — see
 * {@link parseDbFilterTermKind}/{@link parseDbFilterScope}/{@link parseDbFilterAction}. */
export interface ExportedFilterTerm {
  kind: string;
  value: string;
}

export interface ExportedFilter {
  name: string;
  terms: ExportedFilterTerm[];
  scopes: string[];
  action: string;
  expiresAt: string | null;
}

const exportedFilterSchema = z.object({
  name: z.string(),
  terms: z.array(z.object({ kind: z.string(), value: z.string() })),
  scopes: z.array(z.string()),
  action: z.string(),
  expiresAt: z.string().nullable(),
});

const exportPayloadSchema = z.object({ filters: z.array(exportedFilterSchema) });

/** `FILTER_IMPORT_INVALID` (not `VALIDATION_ERROR`) for a malformed payload — a distinct code
 * a client can use to say "that file isn't a Patches filter export" rather than a generic
 * request-shape error. */
export function parseImportPayload(json: string): ExportedFilter[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch (error) {
    throw new AppError('FILTER_IMPORT_INVALID', 'That file is not valid JSON.', { cause: error });
  }
  const result = exportPayloadSchema.safeParse(parsed);
  if (!result.success) {
    throw new AppError('FILTER_IMPORT_INVALID', 'That file is not a Patches filter export.');
  }
  return result.data.filters;
}
