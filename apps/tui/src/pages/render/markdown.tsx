import { Box, Text } from 'ink';
import type { ReactElement } from 'react';

import { sanitizeForTerminal } from '../../format/sanitize.js';
import { theme } from '../../theme/index.js';

/**
 * A small, dependency-free Markdown-to-Ink renderer for `Markdown` page blocks (P45-004,
 * spec §171). Deliberately narrow — headings, bold/italic, inline code, and un/ordered
 * lists — rather than a full CommonMark implementation; no external Markdown package is
 * a dependency of `apps/tui` today, and a Page body is at most 8 KiB of already-sanitized
 * text (`packages/domain`'s `boundedBody`), not a document that needs a real parser.
 * Never throws: an unrecognized line renders as a plain paragraph.
 */
export function renderMarkdown(body: string): ReactElement[] {
  const lines = sanitizeForTerminal(body).split('\n');
  return lines.map((line, index) => renderLine(line, index));
}

function renderLine(line: string, key: number): ReactElement {
  const heading = /^(#{1,6})\s+(.*)$/.exec(line);
  if (heading !== null) {
    const level = heading[1]?.length ?? 1;
    const text = heading[2] ?? '';
    return (
      <Text key={key} color={theme.accent} bold={level <= 2}>
        {renderInline(text)}
      </Text>
    );
  }

  const bullet = /^[-*]\s+(.*)$/.exec(line);
  if (bullet !== null) {
    return (
      <Text key={key}>
        {'  • '}
        {renderInline(bullet[1] ?? '')}
      </Text>
    );
  }

  const ordered = /^(\d+)\.\s+(.*)$/.exec(line);
  if (ordered !== null) {
    return (
      <Text key={key}>
        {'  '}
        {ordered[1]}
        {'. '}
        {renderInline(ordered[2] ?? '')}
      </Text>
    );
  }

  if (line.trim() === '') {
    return <Text key={key}> </Text>;
  }

  return <Text key={key}>{renderInline(line)}</Text>;
}

/** Bold (`**x**`/`__x__`), italic (`*x*`/`_x_`), and inline code (`` `x` ``) — applied
 * to whole-line spans one pass at a time; nested/overlapping emphasis is not supported,
 * degrading to the plain text on either side rather than throwing. */
function renderInline(text: string): (string | ReactElement)[] {
  const pattern = /\*\*(.+?)\*\*|__(.+?)__|`(.+?)`|\*(.+?)\*|_(.+?)_/g;
  const nodes: (string | ReactElement)[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let key = 0;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) nodes.push(text.slice(lastIndex, match.index));
    const [, bold1, bold2, code, italic1, italic2] = match;
    if (bold1 !== undefined || bold2 !== undefined) {
      nodes.push(
        <Text key={key++} bold>
          {bold1 ?? bold2}
        </Text>,
      );
    } else if (code !== undefined) {
      nodes.push(
        <Text key={key++} color={theme.accent}>
          {code}
        </Text>,
      );
    } else {
      nodes.push(
        <Text key={key++} italic>
          {italic1 ?? italic2}
        </Text>,
      );
    }
    lastIndex = pattern.lastIndex;
  }
  if (lastIndex < text.length) nodes.push(text.slice(lastIndex));
  return nodes;
}

/** `AsciiArt` blocks (P45-004) — pre-formatted text, rendered verbatim (still
 * sanitized) with no Markdown/wrap processing so alignment survives. */
export function AsciiArtBlockView({ art }: { art: string }): ReactElement {
  const lines = sanitizeForTerminal(art).split('\n');
  return (
    <Box flexDirection="column">
      {lines.map((line, index) => (
        // No `wrap="truncate"` (`.claude/rules/tui.md`) — a long line reflows rather
        // than silently dropping art off the edge of a narrow terminal.
        <Text key={index}>{line}</Text>
      ))}
    </Box>
  );
}
