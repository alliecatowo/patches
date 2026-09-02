import { parseMarkup, type BlockNode, type InlineNode } from '@patches/markup';
import { memo, useMemo, type JSX } from 'react';
import { Link } from 'react-router-dom';

export interface RichBodyProps {
  /** Raw post/bio source — markdown-lite, the HTML subset, or plain text. */
  source: string;
}

/**
 * Renders a post body / profile bio through the shared `@patches/markup` grammar
 * (spec §22, §181, §189) — the same AST `apps/tui`'s terminal renderer consumes, so a
 * body can never render one way in the TUI and another way here. Sanitisation happens
 * once inside `parseMarkup`; this component only ever maps trusted AST nodes to React
 * elements — never `dangerouslySetInnerHTML`, so there is no HTML-injection surface.
 *
 * Wrapped in `memo` and uses `useMemo` for `parseMarkup` — prevents re-parsing the AST
 * (regex scanning, string slicing, entity decoding) and re-diffing virtual DOM when parent
 * components (such as `PostCard` in `PostTimeline` on keyboard navigation) re-render.
 */
export const RichBody = memo(function RichBody({ source }: RichBodyProps): JSX.Element {
  const blocks = useMemo(() => parseMarkup(source), [source]);
  return <>{blocks.map((block, index) => renderBlock(block, index))}</>;
});

function renderBlock(block: BlockNode, key: number): JSX.Element {
  switch (block.kind) {
    case 'paragraph':
      return (
        <p key={key}>
          {block.lines.map((line, lineIndex) => (
            <span key={lineIndex}>
              {lineIndex > 0 ? <br /> : null}
              {line.map((inline, inlineIndex) => renderInline(inline, inlineIndex))}
            </span>
          ))}
        </p>
      );
    case 'heading': {
      const Tag = `h${Math.min(Math.max(block.level, 1), 6)}` as
        'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6';
      return <Tag key={key}>{block.inlines.map((inline, i) => renderInline(inline, i))}</Tag>;
    }
    case 'quote':
      return <blockquote key={key}>{block.blocks.map((b, i) => renderBlock(b, i))}</blockquote>;
    case 'list': {
      const ListTag = block.ordered ? 'ol' : 'ul';
      return (
        <ListTag key={key}>
          {block.items.map((item, itemIndex) => (
            <li key={itemIndex}>{item.map((b, i) => renderBlock(b, i))}</li>
          ))}
        </ListTag>
      );
    }
    case 'code':
      return (
        <pre key={key}>
          <code>{block.lines.join('\n')}</code>
        </pre>
      );
  }
}

function renderInline(inline: InlineNode, key: number): JSX.Element {
  switch (inline.role) {
    case 'strong':
      return <strong key={key}>{inline.text}</strong>;
    case 'emphasis':
      return <em key={key}>{inline.text}</em>;
    case 'code':
      return <code key={key}>{inline.text}</code>;
    case 'link':
      return (
        <a key={key} href={inline.href} target="_blank" rel="noopener noreferrer ugc">
          {inline.text}
        </a>
      );
    case 'mention': {
      const handle = inline.text.slice(1);
      return (
        <Link key={key} to={`/@${handle}`}>
          {inline.text}
        </Link>
      );
    }
    case 'tag': {
      const tag = inline.text.slice(1);
      return (
        <Link key={key} to={`/t/${tag}`}>
          {inline.text}
        </Link>
      );
    }
    case 'text':
    default:
      return <span key={key}>{inline.text}</span>;
  }
}
