import { Text } from 'ink';
import type { ReactElement } from 'react';

import { theme } from '../theme/index.js';
import { usePlainMode } from '../theme/plain-mode.js';
import { sanitizeForTerminal } from './sanitize.js';

/**
 * `@handle` — the same grammar the server extracts mentions with
 * (`apps/server/src/modules/posts/post.service.ts`'s `MENTION_PATTERN`, spec §22:
 * lowercase ASCII letters/digits/underscore, 3–30). Kept in step by hand; a
 * highlight that disagrees with what actually notified someone is worse than none.
 */
const MENTION_PATTERN = /@([a-zA-Z0-9_]{3,30})\b/g;

/** `#tag` — §181's tag grammar, conservatively: letters/digits/underscore, never
 * all-digits (so `#2026` is not a tag), 1–64. */
const TAG_PATTERN = /#([a-zA-Z0-9_]{1,64})\b/g;

export interface RichToken {
  kind: 'text' | 'mention' | 'tag';
  text: string;
}

/**
 * Splits a post body into plain runs, `@mentions` and `#tags`.
 *
 * Runs on already-sanitized text only (the caller sanitizes first) — this never
 * un-escapes anything, it only decides what to colour. Exported for its unit test.
 */
export function tokenizeBody(text: string): RichToken[] {
  const marks: { start: number; end: number; kind: 'mention' | 'tag' }[] = [];
  for (const match of text.matchAll(MENTION_PATTERN)) {
    if (match.index === undefined) continue;
    marks.push({ start: match.index, end: match.index + match[0].length, kind: 'mention' });
  }
  for (const match of text.matchAll(TAG_PATTERN)) {
    if (match.index === undefined) continue;
    const body = match[1] ?? '';
    if (/^\d+$/.test(body)) continue;
    marks.push({ start: match.index, end: match.index + match[0].length, kind: 'tag' });
  }
  marks.sort((a, b) => a.start - b.start);

  const tokens: RichToken[] = [];
  let cursor = 0;
  for (const mark of marks) {
    if (mark.start < cursor) continue;
    if (mark.start > cursor) tokens.push({ kind: 'text', text: text.slice(cursor, mark.start) });
    tokens.push({ kind: mark.kind, text: text.slice(mark.start, mark.end) });
    cursor = mark.end;
  }
  if (cursor < text.length) tokens.push({ kind: 'text', text: text.slice(cursor) });
  return tokens;
}

/** Every distinct `@handle` in a body, lowercased, in first-appearance order. */
export function extractMentions(text: string): string[] {
  const handles: string[] = [];
  for (const match of text.matchAll(MENTION_PATTERN)) {
    const handle = (match[1] ?? '').toLowerCase();
    if (handle !== '' && !handles.includes(handle)) handles.push(handle);
  }
  return handles;
}

/**
 * A post body with `@mentions` and `#tags` picked out in colour. Plain mode
 * (spec §173) renders exactly the same characters with no colour at all — the
 * text never changes, only its decoration.
 */
export function RichBody({ text }: { text: string }): ReactElement {
  const plain = usePlainMode();
  const safe = sanitizeForTerminal(text);
  if (plain) return <Text wrap="wrap">{safe}</Text>;
  return (
    <Text wrap="wrap">
      {tokenizeBody(safe).map((token, index) => {
        const key = `${String(index)}:${token.kind}`;
        if (token.kind === 'text') return <Text key={key}>{token.text}</Text>;
        return (
          <Text key={key} color={token.kind === 'mention' ? theme.accent : theme.ok}>
            {token.text}
          </Text>
        );
      })}
    </Text>
  );
}
