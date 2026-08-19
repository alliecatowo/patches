import { Text } from 'ink';
import type { ReactElement } from 'react';

import { theme } from '../theme/index.js';
import { usePlainMode } from '../theme/plain-mode.js';
import {
  layoutMarkup,
  parseInline,
  parseMarkup,
  type InlineRole,
  type LayoutLine,
  type LayoutRun,
} from './markup.js';
import { sanitizeForTerminal } from './sanitize.js';

export { extractMentions, measureMarkupHeight, parseMarkup } from './markup.js';
export type { BlockNode, InlineNode, LayoutLine } from './markup.js';

export interface RichToken {
  kind: 'text' | 'mention' | 'tag';
  text: string;
}

/**
 * Mentions and tags only — the narrow tokenizer the status/compose surfaces use for
 * single-line text, where block markup would be meaningless. Post *bodies* go through
 * `parseMarkup` instead.
 */
export function tokenizeBody(text: string): RichToken[] {
  return parseInline(text).map((node) => ({
    kind: node.role === 'mention' || node.role === 'tag' ? node.role : 'text',
    text: node.text,
  }));
}

interface RunStyle {
  color?: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
}

/** Theme role for each inline kind. Plain mode never reaches this. */
function styleFor(role: InlineRole): RunStyle {
  switch (role) {
    case 'strong':
      return { bold: true };
    case 'emphasis':
      return { italic: true };
    case 'code':
      return { color: theme.warn };
    case 'link':
      return { color: theme.accent, underline: true };
    case 'mention':
      return { color: theme.accent };
    case 'tag':
      return { color: theme.ok };
    case 'text':
      return {};
  }
}

function RunText({ run, index }: { run: LayoutRun; index: number }): ReactElement {
  const style = styleFor(run.role);
  return (
    <Text key={`${String(index)}:${run.role}`} {...style}>
      {run.text}
    </Text>
  );
}

/**
 * One pre-wrapped line. `wrap="truncate-end"` is safe *because* the line was wrapped
 * to the same width by `layoutMarkup`: nothing should ever reach the clip, and if a
 * measurement bug ever did overshoot, the frame stays intact instead of smearing.
 */
function MarkupLine({ line }: { line: LayoutLine }): ReactElement {
  if (line.runs.length === 0) return <Text> </Text>;
  return (
    <Text wrap="truncate-end">
      {line.runs.map((run, index) => (
        <RunText key={`${String(index)}:${run.role}`} run={run} index={index} />
      ))}
    </Text>
  );
}

export interface RichBodyProps {
  text: string;
  /** Terminal cells available. Wrapping happens here, not in Ink, so that the
   * viewport's height measurement and the rendered output cannot disagree. */
  width?: number;
  /** Render at most this many rows (the caller folds with a "read more" affordance). */
  maxRows?: number;
}

/**
 * A post body rendered from the shared markup grammar: markdown and the HTML subset
 * both arrive here as one AST.
 *
 * Plain mode (spec §173/§185) reproduces the source markers — `**bold**`, `` `code` ``,
 * `[text](href)`, `- item`, `> quote` — with no colour at all, so the viewer can still
 * see *that* something was emphasised without any decoration being drawn.
 */
export function RichBody({ text, width, maxRows }: RichBodyProps): ReactElement {
  const plain = usePlainMode();

  // No width given: the caller is a single-line/unmeasured surface, so fall back to
  // Ink's own soft wrap over sanitized text rather than guessing a width.
  if (width === undefined) {
    const safe = sanitizeForTerminal(text);
    if (plain) return <Text wrap="wrap">{safe}</Text>;
    return (
      <Text wrap="wrap">
        {parseInline(safe).map((node, index) => (
          <Text key={`${String(index)}:${node.role}`} {...styleFor(node.role)}>
            {node.text}
          </Text>
        ))}
      </Text>
    );
  }

  const lines = layoutMarkup(parseMarkup(text), width, { plain });
  const visible = maxRows === undefined ? lines : lines.slice(0, Math.max(1, maxRows));
  return (
    <>
      {visible.map((line, index) => (
        <MarkupLine key={String(index)} line={line} />
      ))}
    </>
  );
}
