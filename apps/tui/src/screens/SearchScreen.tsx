import { status as GrpcStatus } from '@grpc/grpc-js';
import type { Actor, Post } from '@patches/proto';
import { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import type { ReactElement } from 'react';

import { movementTarget } from '../app/list-movement.js';
import { present } from '../api/present.js';
import type { PatchesApi } from '../api/client.js';
import { describeGrpcError, grpcStatusCode, type FriendlyError } from '../api/errors.js';
import { Loading } from '../components/Loading.js';
import { Nameplate } from '../components/Nameplate.js';
import { PostList, type PostRowActions } from '../components/PostList.js';
import { sanitizeForTerminal } from '../format/sanitize.js';
import { theme } from '../theme/index.js';

export interface SearchScreenProps {
  api: PatchesApi;
  isActive: boolean;
  /** Enables looking up a remote `user@domain` handle via `ResolveActor` (B-028) —
   * omitted (signed out) falls back to always treating the query as a local search,
   * since `ResolveActor` requires a session. */
  ensureAccessToken?: (() => Promise<string>) | undefined;
  /** `Enter` on a result — opens that actor's profile. */
  onOpenActor: (actor: Actor) => void;
  /** Row actions for the Posts tab — the same bag every timeline uses, so `Enter`,
   * `l`, `b`, `r` and `f` behave identically in search results. */
  actions?: PostRowActions;
  /** `Esc` — leaves the screen without picking anyone. */
  onCancel: () => void;
}

type Status =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; actors: Actor[] }
  | { status: 'posts'; posts: Post[]; hasMore: boolean }
  | { status: 'error'; error: FriendlyError };

/** A remote `user@domain` handle, `@`-prefix optional (B-028) — anything else is a
 * local handle-prefix/display-name query. */
const REMOTE_ACCT_PATTERN = /^@?[\w.-]+@[\w.-]+\.[a-z]+$/;

/** What the query is searched against. `Tab` switches between them. */
export type SearchMode = 'people' | 'posts';

/**
 * `/` or `g s` — handle-prefix + display-name search (spec §112), or a remote-actor
 * lookup by `user@domain` (spec §174/B-028) when the query matches that shape.
 * Typing edits the query; `Enter` runs the search the first time, then moves
 * selection into the results and opens the selected actor's profile.
 */
export function SearchScreen({
  api,
  isActive,
  ensureAccessToken,
  onOpenActor,
  actions,
  onCancel,
}: SearchScreenProps): ReactElement {
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(0);
  const [status, setStatus] = useState<Status>({ status: 'idle' });
  const [mode, setMode] = useState<SearchMode>('people');

  async function resolveRemoteActor(rawAcct: string): Promise<void> {
    if (ensureAccessToken === undefined) {
      setStatus({
        status: 'error',
        error: {
          title: 'Sign in to look up a remote account.',
          hint: '',
          retryable: false,
          code: GrpcStatus.UNAUTHENTICATED,
        },
      });
      return;
    }
    const acct = rawAcct.startsWith('@') ? rawAcct.slice(1) : rawAcct;
    setStatus({ status: 'loading' });
    try {
      const accessToken = await ensureAccessToken();
      const response = await api.resolveActor({ acct }, accessToken);
      setStatus({ status: 'ready', actors: present(response.actor) ? [response.actor] : [] });
      setSelected(0);
    } catch (error) {
      if (grpcStatusCode(error) === GrpcStatus.UNIMPLEMENTED) {
        setStatus({
          status: 'error',
          error: {
            title: 'This node has federation disabled.',
            hint: '',
            retryable: false,
            code: GrpcStatus.UNIMPLEMENTED,
          },
        });
        return;
      }
      setStatus({ status: 'error', error: describeGrpcError(error, api.target) });
    }
  }

  async function runPostSearch(trimmed: string): Promise<void> {
    setStatus({ status: 'loading' });
    try {
      const accessToken = ensureAccessToken === undefined ? undefined : await ensureAccessToken();
      // Newest-first keyset, never relevance-by-engagement (§194).
      const response = await api.searchPosts(
        { query: trimmed, cursor: '', limit: 20, authorHandle: '', includeReplies: true },
        accessToken,
      );
      setStatus({
        status: 'posts',
        posts: [...response.posts],
        hasMore: response.page?.hasMore ?? false,
      });
      setSelected(0);
    } catch (error) {
      setStatus({ status: 'error', error: describeGrpcError(error, api.target) });
    }
  }

  async function runSearch(): Promise<void> {
    const trimmed = query.trim();
    if (trimmed === '') return;
    if (mode === 'posts') {
      await runPostSearch(trimmed);
      return;
    }
    if (REMOTE_ACCT_PATTERN.test(trimmed)) {
      await resolveRemoteActor(trimmed);
      return;
    }
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
      if (key.tab) {
        setMode((current) => (current === 'people' ? 'posts' : 'people'));
        setStatus({ status: 'idle' });
        setSelected(0);
        return;
      }
      // Post results are a normal `PostList`: it owns j/k/Enter/l/b/r/f, so this
      // handler steps aside except for leaving and re-editing the query.
      if (status.status === 'posts') {
        if (key.backspace || key.delete) {
          setStatus({ status: 'idle' });
          setQuery((value) => value.slice(0, -1));
        }
        return;
      }

      const results = status.status === 'ready' ? status.actors : [];
      if (results.length > 0) {
        // Same movement vocabulary as every other list (j/k, arrows, Ctrl+D/U, G) —
        // typing only edits the query while there are no results to move through.
        const moved = movementTarget({
          input,
          key,
          current: selected,
          total: results.length,
          pageSize: 10,
        });
        if (moved !== undefined) {
          setSelected(moved);
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
      if (key.ctrl || key.meta) return;
      if (input.length > 0) setQuery((value) => value + input);
    },
    { isActive },
  );

  return (
    <Box flexDirection="column">
      <Box>
        <Text color={theme.accent}>Search </Text>
        <Text color={mode === 'people' ? theme.accent : theme.muted} bold={mode === 'people'}>
          [people]
        </Text>
        <Text color={theme.muted}> </Text>
        <Text color={mode === 'posts' ? theme.accent : theme.muted} bold={mode === 'posts'}>
          [posts]
        </Text>
        <Text color={theme.muted}> Tab switches</Text>
      </Box>
      <Box marginTop={1}>
        <Text color={theme.muted}>query </Text>
        <Text>
          {sanitizeForTerminal(query)}
          <Text color={theme.accent}>█</Text>
        </Text>
      </Box>
      {status.status === 'loading' ? <Loading label="Searching" /> : null}
      {status.status === 'error' ? <Text color={theme.error}>{status.error.title}</Text> : null}
      {status.status === 'posts' && (
        <Box marginTop={1}>
          <PostList
            posts={status.posts}
            loading={false}
            hasMore={status.hasMore}
            emptyMessage="No posts matched."
            isActive={isActive}
            chromeRows={5}
            {...actions}
          />
        </Box>
      )}
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
            ? 'j/k select · Enter open profile · Tab people/posts · Esc cancel'
            : status.status === 'posts'
              ? 'j/k · Enter thread · Backspace edit · Tab people/posts · Esc cancel'
              : 'Enter search · Tab people/posts · Esc cancel'}
        </Text>
      </Box>
    </Box>
  );
}
