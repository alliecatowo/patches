import type { Actor } from '@patches/proto/es';
import { type JSX, type KeyboardEvent, useEffect, useRef, useState } from 'react';

import { usePeopleSearch } from './usePeopleSearch.js';
import styles from './PeoplePicker.module.css';

const DEBOUNCE_MS = 200;

export interface PeoplePickerProps {
  readonly viewerActorId: string;
  readonly excludeActorIds?: readonly string[];
  readonly onSelect: (actor: Actor) => void;
  readonly placeholder?: string;
}

/**
 * #322: the one entry point for "who do you want to message" — fuzzy search over
 * handle/display name, followed/following surfaced first, avatars, fully keyboard navigable
 * (Up/Down move, Enter selects, matching the mention-autocomplete affordance from #318). Never
 * an id prompt.
 */
export function PeoplePicker(props: PeoplePickerProps): JSX.Element {
  const {
    viewerActorId,
    excludeActorIds = [],
    onSelect,
    placeholder = 'Search by handle or name',
  } = props;
  const [rawQuery, setRawQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(rawQuery), DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [rawQuery]);

  const { candidates, boostedIds, isLoading, isError } = usePeopleSearch(
    debounced,
    viewerActorId,
    excludeActorIds,
  );

  // Reset the highlighted row whenever the committed query changes, using React's sanctioned
  // "adjust state during render" pattern (comparing against a state-tracked previous value)
  // rather than a `setState` inside a `useEffect`, which would cost an extra render pass.
  const [activeIndexResetFor, setActiveIndexResetFor] = useState(debounced);
  if (activeIndexResetFor !== debounced) {
    setActiveIndexResetFor(debounced);
    setActiveIndex(0);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>): void {
    if (candidates.length === 0) return;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex((index) => (index + 1) % candidates.length);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((index) => (index - 1 + candidates.length) % candidates.length);
    } else if (event.key === 'Enter') {
      const chosen = candidates[activeIndex];
      if (chosen !== undefined) {
        event.preventDefault();
        onSelect(chosen);
      }
    }
  }

  useEffect(() => {
    const active = listRef.current?.querySelector('[aria-selected="true"]');
    // jsdom (unit tests) has no `scrollIntoView` implementation — real browsers do.
    if (active instanceof HTMLElement && typeof active.scrollIntoView === 'function') {
      active.scrollIntoView({ block: 'nearest' });
    }
  }, [activeIndex]);

  return (
    <div className={styles['picker']} role="group" aria-label="Choose who to message">
      <input
        type="text"
        className={styles['input']}
        value={rawQuery}
        onChange={(event) => setRawQuery(event.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        aria-label="Search by handle or name"
        aria-controls="people-picker-results"
        aria-activedescendant={
          candidates[activeIndex] ? `people-picker-${candidates[activeIndex].id}` : undefined
        }
        role="combobox"
        aria-expanded={candidates.length > 0}
        autoFocus
      />
      {isError ? (
        <p role="alert" className={styles['note']}>
          Could not load results.
        </p>
      ) : null}
      {!isLoading && !isError && candidates.length === 0 ? (
        <p className={styles['note']}>
          {debounced.trim() === '' ? 'Not following anyone yet.' : 'No one found.'}
        </p>
      ) : null}
      <div
        id="people-picker-results"
        ref={listRef}
        className={styles['results']}
        role="listbox"
        aria-label="People"
      >
        {candidates.map((actor, index) => (
          <button
            key={actor.id}
            id={`people-picker-${actor.id}`}
            type="button"
            role="option"
            aria-selected={index === activeIndex}
            className={`${styles['row']} ${index === activeIndex ? styles['rowActive'] : ''}`}
            onMouseEnter={() => setActiveIndex(index)}
            // Mousedown fires before the input's blur — keeps click selection working the same
            // way MentionAutocomplete's does.
            onMouseDown={(event) => {
              event.preventDefault();
              onSelect(actor);
            }}
          >
            {actor.avatar?.url ? (
              <img className={styles['avatar']} src={actor.avatar.url} alt="" aria-hidden="true" />
            ) : (
              <span className={styles['avatarPlaceholder']} aria-hidden="true">
                {(actor.displayName || actor.handle).slice(0, 1).toUpperCase()}
              </span>
            )}
            <span className={styles['names']}>
              <span className={styles['name']}>{actor.displayName || actor.handle}</span>
              <span className={styles['handle']}>@{actor.handle}</span>
            </span>
            {boostedIds.has(actor.id) ? (
              <span className={styles['boostedTag']}>Follows</span>
            ) : null}
          </button>
        ))}
      </div>
    </div>
  );
}
