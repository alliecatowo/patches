import type { JSX } from 'react';
import { Link } from 'react-router-dom';

// Captures the URL, so `String.split` interleaves matched/unmatched chunks:
// odd indices in the result are always full URL matches.
const URL_SPLIT_RE = /(https?:\/\/[^\s]+)/g;
const TAG_RE = /^#([a-z0-9_]+)$/i;

/**
 * Renders plain post body text as React nodes with bare URLs turned into
 * `<a>` and `#tag` tokens turned into links to `/t/:tag` — never via
 * `dangerouslySetInnerHTML`, so there is no HTML-injection surface even
 * though post bodies are untrusted user input.
 */
export function linkifyBody(body: string): JSX.Element {
  const parts = body.split(URL_SPLIT_RE);
  return (
    <>
      {parts.map((part, index) => {
        const isUrl = index % 2 === 1;
        if (isUrl) {
          return (
            <a key={index} href={part} target="_blank" rel="noopener noreferrer ugc">
              {part}
            </a>
          );
        }
        const words = part.split(/(\s+)/);
        return (
          <span key={index}>
            {words.map((word, wordIndex) => {
              const match = TAG_RE.exec(word);
              if (match?.[1]) {
                return (
                  <Link key={wordIndex} to={`/t/${match[1]}`}>
                    {word}
                  </Link>
                );
              }
              return <span key={wordIndex}>{word}</span>;
            })}
          </span>
        );
      })}
    </>
  );
}
