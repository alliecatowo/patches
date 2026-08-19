export type AutocompleteTriggerKind = 'mention' | 'tag';

export interface AutocompleteTrigger {
  kind: AutocompleteTriggerKind;
  marker: '@' | '#';
  /** UTF-16 offsets covering the marker and the token currently being edited. */
  start: number;
  end: number;
  query: string;
}

export interface AutocompleteInsertion {
  value: string;
  cursor: number;
}

export interface InsertAutocompleteOptions {
  appendSpace?: boolean;
  maxChars?: number;
}

const MENTION_PREFIX = /(?:^|[^A-Za-z0-9_])@([A-Za-z0-9_]*)$/u;
const TAG_PREFIX = /(?:^|[^\p{L}\p{N}_\p{M}])#([\p{L}\p{N}_\p{M}]*)$/u;
const MENTION_NAME = /^[A-Za-z0-9_]{3,30}$/u;
const TAG_NAME = /^[\p{L}\p{N}_]+$/u;
const TAG_CHARACTER = /^[\p{L}\p{N}_\p{M}]$/u;
const MENTION_CHARACTER = /^[A-Za-z0-9_]$/u;

function codePointLength(value: string): number {
  return [...value].length;
}

function findTokenEnd(value: string, cursor: number, characterPattern: RegExp): number {
  let end = cursor;
  for (const character of value.slice(cursor)) {
    if (!characterPattern.test(character)) break;
    end += character.length;
  }
  return end;
}

function triggerFromMatch(
  value: string,
  cursor: number,
  kind: AutocompleteTriggerKind,
  match: RegExpMatchArray,
): AutocompleteTrigger | null {
  const query = match[1] ?? '';
  const marker: '@' | '#' = kind === 'mention' ? '@' : '#';
  const maxLength = 30;
  if (codePointLength(query.normalize('NFKC')) > maxLength) return null;
  if (kind === 'tag' && /\p{M}/u.test(query.normalize('NFKC'))) return null;
  const start = cursor - query.length - 1;
  const characterPattern = kind === 'mention' ? MENTION_CHARACTER : TAG_CHARACTER;
  return {
    kind,
    marker,
    start,
    end: findTokenEnd(value, cursor, characterPattern),
    query: query.normalize('NFKC'),
  };
}

/** Find an @mention or #tag token ending at the cursor, never inside an email/word. */
export function findAutocompleteTrigger(value: string, cursor: number): AutocompleteTrigger | null {
  const current = Math.min(Math.max(Math.trunc(cursor), 0), value.length);
  const beforeCursor = value.slice(0, current);
  const mentionMatch = beforeCursor.match(MENTION_PREFIX);
  const tagMatch = beforeCursor.match(TAG_PREFIX);
  if (mentionMatch === null && tagMatch === null) return null;
  if (mentionMatch !== null && tagMatch !== null) {
    const mentionStart = current - (mentionMatch[1]?.length ?? 0) - 1;
    const tagStart = current - (tagMatch[1]?.length ?? 0) - 1;
    return triggerFromMatch(
      value,
      current,
      mentionStart > tagStart ? 'mention' : 'tag',
      mentionStart > tagStart ? mentionMatch : tagMatch,
    );
  }
  return mentionMatch === null
    ? triggerFromMatch(value, current, 'tag', tagMatch as RegExpMatchArray)
    : triggerFromMatch(value, current, 'mention', mentionMatch);
}

export const getAutocompleteTrigger = findAutocompleteTrigger;

export function isValidMentionSuggestion(value: string): boolean {
  return MENTION_NAME.test(value.replace(/^@/u, ''));
}

export function isValidTagSuggestion(value: string): boolean {
  const name = value.replace(/^#/u, '').normalize('NFKC');
  return (
    codePointLength(name) >= 1 &&
    codePointLength(name) <= 30 &&
    TAG_NAME.test(name) &&
    /\p{L}/u.test(name)
  );
}

function safeSuggestion(trigger: AutocompleteTrigger, suggestion: string): string | null {
  const trimmed = suggestion.trim();
  if (trigger.kind === 'mention') {
    const name = trimmed.replace(/^@/u, '');
    return isValidMentionSuggestion(name) ? `@${name}` : null;
  }
  const name = trimmed.replace(/^#/u, '').normalize('NFKC');
  return isValidTagSuggestion(name) ? `#${name}` : null;
}

/** Replace only a still-valid trigger range; reject unsafe/stale suggestions without mutation. */
export function insertAutocompleteSuggestion(
  value: string,
  trigger: AutocompleteTrigger,
  suggestion: string,
  options: InsertAutocompleteOptions = {},
): AutocompleteInsertion | null {
  if (
    trigger.start < 0 ||
    trigger.end < trigger.start ||
    trigger.end > value.length ||
    value.slice(trigger.start, trigger.start + 1) !== trigger.marker
  ) {
    return null;
  }
  const currentTrigger = findAutocompleteTrigger(value, trigger.end);
  if (
    currentTrigger === null ||
    currentTrigger.kind !== trigger.kind ||
    currentTrigger.start !== trigger.start ||
    currentTrigger.end !== trigger.end
  ) {
    return null;
  }

  const replacement = safeSuggestion(trigger, suggestion);
  if (replacement === null) return null;
  const appendSpace = options.appendSpace ?? true;
  const suffix = value.slice(trigger.end);
  const spacing = appendSpace && suffix === '' ? ' ' : '';
  const nextValue = `${value.slice(0, trigger.start)}${replacement}${spacing}${suffix}`;
  if (options.maxChars !== undefined && [...nextValue].length > Math.trunc(options.maxChars)) {
    return null;
  }
  return {
    value: nextValue,
    cursor: trigger.start + replacement.length + spacing.length,
  };
}

export const applyAutocompleteSuggestion = insertAutocompleteSuggestion;
