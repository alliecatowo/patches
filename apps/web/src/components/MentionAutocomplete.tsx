import type { Actor } from '@patches/proto/es';
import type { JSX } from 'react';

import styles from './MentionAutocomplete.module.css';

interface MentionAutocompleteProps {
  candidates: Actor[];
  activeIndex: number;
  onSelect: (actor: Actor) => void;
}

/**
 * The `@`-mention suggestion dropdown (§219) — a plain listbox anchored under the compose
 * textarea, not caret-positioned (v0 keeps this simple; the textarea is short enough that the
 * distinction rarely matters). Keyboard navigation (arrow keys, Enter/Tab to select, Escape to
 * dismiss) is driven by the caller, which owns `activeIndex` alongside the textarea's own
 * `onKeyDown` — this component is presentation-only.
 */
export function MentionAutocomplete({
  candidates,
  activeIndex,
  onSelect,
}: MentionAutocompleteProps): JSX.Element | null {
  if (candidates.length === 0) return null;

  return (
    <ul className={styles['menu']} role="listbox" aria-label="Mention suggestions">
      {candidates.map((actor, index) => (
        <li key={actor.id} role="presentation">
          <button
            type="button"
            role="option"
            aria-selected={index === activeIndex}
            className={`${styles['option']} ${index === activeIndex ? styles['optionActive'] : ''}`}
            // Mousedown (not click) fires before the textarea's blur, so selecting with the
            // mouse doesn't lose the caret position `applyMentionSelection` needs.
            onMouseDown={(event) => {
              event.preventDefault();
              onSelect(actor);
            }}
          >
            <img
              className={styles['avatar']}
              src={actor.avatar?.url ?? ''}
              alt=""
              aria-hidden="true"
            />
            <span className={styles['name']}>{actor.displayName || actor.handle}</span>
            <span className={styles['handle']}>@{actor.handle}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}
