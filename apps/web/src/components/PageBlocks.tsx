import type { RenderablePageBlock } from '@patches/domain';
import type { JSX } from 'react';

import { MediaImage } from './MediaImage.js';
import styles from '../routes/ProfileRoute.module.css';

/**
 * Renders a profile "wall" (`PageService`) as inert data — text, links, and
 * images only, never `dangerouslySetInnerHTML`. Block types this v0 web
 * client doesn't have a renderer for yet (Gallery/Friends/TopEight/
 * Guestbook/Posts/Badges) show a visible placeholder rather than being
 * skipped silently, matching spec §171's "never fail the page" rule.
 */
export function PageBlocks({ blocks }: { blocks: RenderablePageBlock[] }): JSX.Element {
  return (
    <>
      {blocks.map((block, index) => (
        <div className={styles['wallBlock']} key={index}>
          {renderBlock(block)}
        </div>
      ))}
    </>
  );
}

function renderBlock(block: RenderablePageBlock): JSX.Element {
  switch (block.type) {
    case 'Text':
    case 'Markdown':
      return <p style={{ whiteSpace: 'pre-wrap' }}>{block.body}</p>;
    case 'Hero':
      return (
        <div>
          <h2>{block.title}</h2>
          {block.subtitle ? <p>{block.subtitle}</p> : null}
        </div>
      );
    case 'NowPlaying':
      return <p>♪ {block.text}</p>;
    case 'AsciiArt':
      return <pre className="mono">{block.art}</pre>;
    case 'Spacer':
      return (
        <div
          style={{ height: block.size === 'lg' ? '3rem' : block.size === 'sm' ? '1rem' : '2rem' }}
        />
      );
    case 'Image':
      return <MediaImage mediaId={block.mediaId} altText={block.alt ?? ''} />;
    case 'Links':
      return (
        <ul>
          {block.links.map((link) => (
            <li key={link.href}>
              <a href={link.href} target="_blank" rel="noopener noreferrer ugc">
                {link.label}
              </a>
            </li>
          ))}
        </ul>
      );
    default:
      return (
        <p style={{ color: 'var(--fg-muted)' }}>[{block.type} block — not supported here yet]</p>
      );
  }
}
