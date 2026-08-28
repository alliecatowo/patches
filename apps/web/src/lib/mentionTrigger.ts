export interface MentionTrigger {
  /** Index of the triggering `@` within the text. */
  start: number;
  /** Characters typed after `@`, up to the caret — never contains whitespace. */
  query: string;
}

const MAX_MENTION_QUERY_CHARS = 32;

/**
 * Finds an in-progress `@mention` the caret is currently inside of, scanning backward from
 * `caret` (§219 — only an explicit `@` prefix triggers autocomplete, never a bare word). Stops
 * at the first whitespace (no trigger in the current "word") or at `@` — and only counts that
 * `@` as a trigger when it starts the line or follows whitespace, so `user@example.com` and
 * mid-word `@`s never fire the dropdown.
 */
export function findMentionTrigger(text: string, caret: number): MentionTrigger | null {
  let index = caret - 1;
  while (index >= 0) {
    const char = text[index];
    if (char === '@') {
      const before = index === 0 ? '' : (text[index - 1] ?? '');
      if (before !== '' && !/\s/.test(before)) return null;
      const query = text.slice(index + 1, caret);
      if (query.length > MAX_MENTION_QUERY_CHARS) return null;
      return { start: index, query };
    }
    if (char === undefined || /\s/.test(char)) return null;
    index -= 1;
  }
  return null;
}

/** Replaces the `@query` at `trigger` with `@handle ` (trailing space so typing continues past
 * the inserted mention), returning the new text and where the caret should land. */
export function applyMentionSelection(
  text: string,
  trigger: MentionTrigger,
  handle: string,
): { text: string; caret: number } {
  const before = text.slice(0, trigger.start);
  const after = text.slice(trigger.start + 1 + trigger.query.length);
  const inserted = `@${handle} `;
  return { text: before + inserted + after, caret: before.length + inserted.length };
}
