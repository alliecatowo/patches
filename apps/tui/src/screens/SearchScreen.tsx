import type { Actor } from '@patches/proto';
import { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import type { ReactElement } from 'react';

import type { PatchesApi } from '../api/client.js';
import { describeGrpcError, type FriendlyError } from '../api/errors.js';
import { Nameplate } from '../components/Nameplate.js';
import { sanitizeForTerminal } from '../format/sanitize.js';
import { theme } from '../theme/index.js';

export interface SearchScreenProps {
  api: PatchesApi;
  isActive: boolean;
  /** `Enter` on a result — opens that actor's profile. */
  onOpenActor: (actor: Actor) => void;
  /** `Esc` — leaves the screen without picking anyone. */
  onCancel: () => void;
}

type Status =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; actors: Actor[] }
  | { status: 'error'; error: FriendlyError };

/**
 * `/` or `g s` — handle-prefix + display-name search (spec §112). Typing edits the
 * query; `Enter` runs the search the first time, then moves selection into the
 * results and opens the selected actor's profile.
 */
export function SearchScreen({
  api,
  isActive,
  onOpenActor,
  onCancel,
}: SearchScreenProps): ReactElement {
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(0);
  const [status, setStatus] = useState<Status>({ status: 'idle' });

  async function runSearch(): Promise<void> {
    const trimmed = query.trim();
    if (trimmed === '') return;
    setStatus({ status: 'loading' });
    try {
      const response = await api.searchActors({ query: trimmed, cursor: '', limit: 20 });
      setStatus({ status: 'ready', actors: [...response.actors] });
      setSelected(0);
    } catch (error) {
      setStatus({ status: 'error', error: describeGrpcError(error, api.target) });
    }
  }

  useInput(
    (input, key) => {
      if (status.status === 'loading') return;
      if (key.escape) {
        onCancel();
        return;
      }

      const results = status.status === 'ready' ? status.actors : [];
      if (results.length > 0) {
        if (input === 'j' || key.downArrow) {
          setSelected((current) => Math.min(current + 1, results.length - 1));
          return;
        }
        if (input === 'k' || key.upArrow) {
          setSelected((current) => Math.max(current - 1, 0));
          return;
        }
        if (key.return) {
          const actor = results[selected];
          if (actor !== undefined) onOpenActor(actor);
          return;
        }
      } else if (key.return) {
        void runSearch();
        return;
      }

      if (key.backspace || key.delete) {
        setQuery((value) => value.slice(0, -1));
        return;
      }
      if (key.ctrl || key.meta || key.tab) return;
      if (input.length > 0) setQuery((value) => value + input);
    },
    { isActive },
  );

  return (
    <Box flexDirection="column">
      <Text color={theme.accent}>Search</Text>
      <Box marginTop={1}>
        <Text color={theme.muted}>query </Text>
        <Text>
          {sanitizeForTerminal(query)}
          <Text color={theme.accent}>█</Text>
        </Text>
      </Box>
      {status.status === 'loading' ? <Text color={theme.muted}>Searching…</Text> : null}
      {status.status === 'error' ? <Text color={theme.error}>{status.error.title}</Text> : null}
      {status.status === 'ready' && (
        <Box marginTop={1} flexDirection="column">
          {status.actors.length === 0 ? (
            <Text color={theme.muted}>No matches.</Text>
          ) : (
            status.actors.map((actor, index) => (
              <Box key={actor.id}>
                <Nameplate
                  handle={actor.handle}
                  nameplate={actor.nameplate ?? undefined}
                  bold={index === selected}
                  fallbackColor={index === selected ? theme.accent : undefined}
                />
                {actor.displayName === '' ? null : (
                  <Text color={theme.muted}> · {sanitizeForTerminal(actor.displayName)}</Text>
                )}
              </Box>
            ))
          )}
        </Box>
      )}
      <Box marginTop={1}>
        <Text color={theme.muted}>
          {status.status === 'ready'
            ? 'j/k select · Enter open profile · Esc cancel'
            : 'Enter search · Esc cancel'}
        </Text>
      </Box>
    </Box>
  );
}
