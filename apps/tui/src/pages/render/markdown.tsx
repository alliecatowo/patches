import { Box, Text } from 'ink';
import type { ReactElement } from 'react';

import { cellWidth, truncateToWidth } from '../../format/measure.js';
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

/** `AsciiArt` blocks (P45-004, P12-109 §5.5) — pre-formatted text, rendered verbatim
 * (still sanitized) with no Markdown processing so alignment survives. Centred and
 * *clipped*, never wrapped: reflowing pre-aligned art breaks it far worse than losing
 * the part that doesn't fit, so a line wider than `width` is hard-clipped to `width`
 * cells (string-width measured — `truncateToWidth`, the same helper the status bar's
 * hint line uses) with a trailing `…` rather than handed to Ink's own `wrap`, which
 * would either soft-wrap it onto extra rows or (via `wrap="truncate"`) silently
 * garble a placeholder-bearing row (`.claude/rules/tui.md`'s Kitty hazard). `width`
 * is `undefined` outside a sized `PageBlocksView` (unit tests, `PageScreen` before its
 * first content-size read) — art then renders unclipped, matching the previous
 * behaviour for those callers. */
export function AsciiArtBlockView({ art, width }: { art: string; width?: number }): ReactElement {
  const lines = sanitizeForTerminal(art).split('\n');
  return (
    <Box flexDirection="column">
      {lines.map((line, index) => (
        <Text key={index}>{width === undefined ? line : centerAndClip(line, width)}</Text>
      ))}
    </Box>
  );
}

function centerAndClip(line: string, width: number): string {
  if (width <= 0) return '';
  const clipped = truncateToWidth(line, width);
  const pad = Math.max(0, width - cellWidth(clipped));
  return ' '.repeat(Math.floor(pad / 2)) + clipped;
}
