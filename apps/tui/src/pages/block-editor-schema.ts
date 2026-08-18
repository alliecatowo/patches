import {
  BLOCK_TYPES,
  PAGE_MAX_GALLERY_ITEMS,
  PAGE_MAX_TOP_EIGHT,
  PAGE_SHORT_TEXT_MAX_CHARS,
  type PageBlock,
} from '@patches/domain';

/**
 * Field metadata for `PageBlocksEditorScreen`'s (B-023) small per-block form. This is a
 * deliberately hand-written mirror of `@patches/domain`'s `BLOCK_SCHEMAS` shapes — the
 * same "kept in sync by hand, not derived by introspecting the zod internals of another
 * package" convention `EditProfileScreen`'s `FIELD_LIMITS` already uses for the actor
 * validation limits. The character/item limits themselves *are* imported from
 * `@patches/domain` (it's a shared, server-independent package, unlike
 * `apps/server/.../validation.ts`), so only the *shape* (which fields exist, what kind
 * each is) is duplicated, not the numbers.
 *
 * The form only ever produces a *draft* — whatever the user typed, even if it wouldn't
 * yet pass `parsePageStrict`. Validation happens once, on `Ctrl+S`, against the whole
 * document (same "validate on save, show the first error inline" contract
 * `PageScreen`'s `$EDITOR` round trip already has), not per keystroke here.
 */

export type BlockFieldKind = 'string' | 'multiline' | 'number' | 'stringArray' | 'enum';

export interface BlockFieldSpec {
  key: string;
  label: string;
  kind: BlockFieldKind;
  /** Absent (not empty-string) is what makes the field disappear from the outgoing
   * JSON — `optional` fields go through `applyFieldText`'s "blank clears it" path. */
  optional: boolean;
  /** For `'string'`/`'multiline'` — a soft cap on the form's own text input, mirroring
   * the schema's `.max()` (this is a UX nicety; the authoritative check is still
   * `parsePageStrict` on save). Multiline `body`/`art` fields are bounded in UTF-8
   * *bytes* by `@patches/domain`, not characters, so they're left uncapped here. */
  maxChars?: number;
  /** For `'stringArray'` — how many comma-separated entries `applyFieldText` keeps. */
  maxItems?: number;
  /** For `'enum'` — `Enter`/`→`/`←` cycle through these. */
  enumValues?: readonly string[];
}

export interface BlockTypeSpec {
  type: PageBlock['type'];
  /** Shown in the `a` type picker and the block list. */
  label: string;
  fields: readonly BlockFieldSpec[];
  /** Shown instead of a field list when `fields` is empty but the type isn't
   * actually field-less (`Links` has data, just not editable in this small form yet). */
  formNote?: string;
  /** A fresh block for `a` (add) — every optional field omitted, matching what
   * `applyFieldText` would produce for an all-blank form. */
  createDefault: () => Record<string, unknown>;
  /** One-line list-row summary, tolerant of a raw value that doesn't fully validate
   * yet (same "best-effort read" spirit as `page.ts`'s `parseSubPageLenient`). */
  summarize: (raw: Record<string, unknown>) => string;
}

function readString(raw: Record<string, unknown>, key: string): string {
  const value = raw[key];
  return typeof value === 'string' ? value : '';
}

function readNumber(raw: Record<string, unknown>, key: string): number | undefined {
  const value = raw[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function readStringArray(raw: Record<string, unknown>, key: string): string[] {
  const value = raw[key];
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}

function truncateForSummary(text: string, maxChars = 48): string {
  const oneLine = text.replace(/\s+/g, ' ').trim();
  return oneLine.length > maxChars ? `${oneLine.slice(0, maxChars - 1)}…` : oneLine;
}

export const BLOCK_TYPE_SPECS: readonly BlockTypeSpec[] = [
  {
    type: 'Text',
    label: 'Text',
    fields: [{ key: 'body', label: 'Body', kind: 'multiline', optional: false }],
    createDefault: () => ({ type: 'Text', body: '' }),
    summarize: (raw) => truncateForSummary(readString(raw, 'body')) || '(empty)',
  },
  {
    type: 'Markdown',
    label: 'Markdown',
    fields: [{ key: 'body', label: 'Body (Markdown)', kind: 'multiline', optional: false }],
    createDefault: () => ({ type: 'Markdown', body: '' }),
    summarize: (raw) => truncateForSummary(readString(raw, 'body')) || '(empty)',
  },
  {
    type: 'Image',
    label: 'Image',
    fields: [
      { key: 'mediaId', label: 'Media ID', kind: 'string', optional: false, maxChars: 64 },
      {
        key: 'alt',
        label: 'Alt text',
        kind: 'string',
        optional: true,
        maxChars: PAGE_SHORT_TEXT_MAX_CHARS,
      },
    ],
    createDefault: () => ({ type: 'Image', mediaId: '' }),
    summarize: (raw) => readString(raw, 'mediaId') || '(no media id set)',
  },
  {
    type: 'Links',
    label: 'Links',
    fields: [],
    formNote:
      "This block's link list isn't editable in this form yet — press Esc, then e, " +
      'to edit it as raw JSON in $EDITOR.',
    createDefault: () => ({ type: 'Links', links: [] }),
    summarize: (raw) => {
      const links = Array.isArray(raw.links) ? raw.links : [];
      return `${String(links.length)} link${links.length === 1 ? '' : 's'}`;
    },
  },
  {
    type: 'Posts',
    label: 'Posts',
    fields: [{ key: 'limit', label: 'Limit', kind: 'number', optional: true }],
    createDefault: () => ({ type: 'Posts' }),
    summarize: (raw) => `limit ${String(readNumber(raw, 'limit') ?? 5)}`,
  },
  {
    type: 'Gallery',
    label: 'Gallery',
    fields: [
      {
        key: 'mediaIds',
        label: 'Media IDs (comma-separated)',
        kind: 'stringArray',
        optional: false,
        maxItems: PAGE_MAX_GALLERY_ITEMS,
      },
      {
        key: 'caption',
        label: 'Caption',
        kind: 'string',
        optional: true,
        maxChars: PAGE_SHORT_TEXT_MAX_CHARS,
      },
    ],
    createDefault: () => ({ type: 'Gallery', mediaIds: [] }),
    summarize: (raw) => {
      const items = readStringArray(raw, 'mediaIds');
      return `${String(items.length)} item${items.length === 1 ? '' : 's'}`;
    },
  },
  {
    type: 'Friends',
    label: 'Friends',
    fields: [{ key: 'limit', label: 'Limit', kind: 'number', optional: true }],
    createDefault: () => ({ type: 'Friends' }),
    summarize: (raw) => `limit ${String(readNumber(raw, 'limit') ?? 8)}`,
  },
  {
    type: 'TopEight',
    label: 'Top Eight',
    fields: [
      {
        key: 'actors',
        label: 'Actors (@handle, comma-separated)',
        kind: 'stringArray',
        optional: false,
        maxItems: PAGE_MAX_TOP_EIGHT,
      },
    ],
    createDefault: () => ({ type: 'TopEight', actors: [] }),
    summarize: (raw) => {
      const actors = readStringArray(raw, 'actors');
      return actors.length === 0 ? '(empty)' : actors.join(', ');
    },
  },
  {
    type: 'Guestbook',
    label: 'Guestbook',
    fields: [{ key: 'limit', label: 'Limit', kind: 'number', optional: true }],
    createDefault: () => ({ type: 'Guestbook' }),
    summarize: (raw) => `limit ${String(readNumber(raw, 'limit') ?? 20)}`,
  },
  {
    type: 'Badges',
    label: 'Badges',
    fields: [],
    formNote: 'Server-attested — nothing here is user-editable.',
    createDefault: () => ({ type: 'Badges' }),
    summarize: () => 'server-attested badges',
  },
  {
    type: 'AsciiArt',
    label: 'ASCII Art',
    fields: [{ key: 'art', label: 'Art', kind: 'multiline', optional: false }],
    createDefault: () => ({ type: 'AsciiArt', art: '' }),
    summarize: (raw) => truncateForSummary(readString(raw, 'art')) || '(empty)',
  },
  {
    type: 'Spacer',
    label: 'Spacer',
    fields: [
      { key: 'size', label: 'Size', kind: 'enum', optional: true, enumValues: ['sm', 'md', 'lg'] },
    ],
    createDefault: () => ({ type: 'Spacer' }),
    summarize: (raw) => `size ${readString(raw, 'size') || 'md'}`,
  },
  {
    type: 'Hero',
    label: 'Hero',
    fields: [
      {
        key: 'title',
        label: 'Title',
        kind: 'string',
        optional: false,
        maxChars: PAGE_SHORT_TEXT_MAX_CHARS,
      },
      {
        key: 'subtitle',
        label: 'Subtitle',
        kind: 'string',
        optional: true,
        maxChars: PAGE_SHORT_TEXT_MAX_CHARS,
      },
    ],
    createDefault: () => ({ type: 'Hero', title: '' }),
    summarize: (raw) => truncateForSummary(readString(raw, 'title')) || '(empty)',
  },
  {
    type: 'NowPlaying',
    label: 'Now Playing',
    fields: [
      {
        key: 'text',
        label: 'Text',
        kind: 'string',
        optional: false,
        maxChars: PAGE_SHORT_TEXT_MAX_CHARS,
      },
    ],
    createDefault: () => ({ type: 'NowPlaying', text: '' }),
    summarize: (raw) => truncateForSummary(readString(raw, 'text')) || '(empty)',
  },
];

// Every `BLOCK_TYPES` entry must have a spec here — a future block type
// `@patches/domain` adds but this table hasn't caught up to fails at import time
// rather than silently falling back to "unsupported" for a type that's actually valid.
const missing = BLOCK_TYPES.filter((type) => !BLOCK_TYPE_SPECS.some((spec) => spec.type === type));
if (missing.length > 0) {
  throw new Error(`block-editor-schema.ts is missing a spec for: ${missing.join(', ')}`);
}

export function getBlockTypeSpec(type: string): BlockTypeSpec | undefined {
  return BLOCK_TYPE_SPECS.find((spec) => spec.type === type);
}

/** The form's current text for one field, read from a possibly-partial/invalid raw
 * block value. */
export function fieldValueToText(spec: BlockFieldSpec, raw: Record<string, unknown>): string {
  switch (spec.kind) {
    case 'string':
    case 'multiline':
      return readString(raw, spec.key);
    case 'number': {
      const value = readNumber(raw, spec.key);
      return value === undefined ? '' : String(value);
    }
    case 'stringArray':
      return readStringArray(raw, spec.key).join(', ');
    case 'enum':
      return readString(raw, spec.key) || (spec.enumValues?.[0] ?? '');
  }
}

/** Commits one field's edited text back into `raw`, returning a new object (`raw`
 * itself is never mutated — same "always derive the next value, never mutate in
 * place" convention as `EditProfileScreen`'s `updateField`). A blank optional field
 * clears the key entirely (Table above: "absent is what removes it"), rather than
 * writing an empty string/zero that could fail a `.min()` the schema never meant to
 * apply to "the user left this blank". */
export function applyFieldText(
  spec: BlockFieldSpec,
  raw: Record<string, unknown>,
  text: string,
): Record<string, unknown> {
  const next = { ...raw };
  const trimmed = text.trim();
  switch (spec.kind) {
    case 'string':
    case 'multiline':
      if (trimmed === '' && spec.optional) delete next[spec.key];
      else next[spec.key] = text;
      return next;
    case 'number': {
      const parsed = Number(trimmed);
      if (trimmed === '' || !Number.isFinite(parsed)) {
        if (spec.optional) delete next[spec.key];
        else next[spec.key] = 0;
      } else {
        next[spec.key] = parsed;
      }
      return next;
    }
    case 'stringArray': {
      const items = text
        .split(',')
        .map((item) => item.trim())
        .filter((item) => item !== '')
        .slice(0, spec.maxItems);
      next[spec.key] = items;
      return next;
    }
    case 'enum':
      if (trimmed === '' && spec.optional) delete next[spec.key];
      else next[spec.key] = text;
      return next;
  }
}

/** `Enter`/`→` (forward) or `←` (back) on an `'enum'` field — cycles through
 * `enumValues`, wrapping at either end. */
export function cycleEnumValue(spec: BlockFieldSpec, current: string, delta: number): string {
  const values = spec.enumValues ?? [];
  if (values.length === 0) return current;
  const index = values.indexOf(current);
  const next = ((index === -1 ? 0 : index) + delta + values.length) % values.length;
  return values[next] ?? current;
}
