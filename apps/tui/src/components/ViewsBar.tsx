import { useEffect, useState } from 'react';
import { Box, Text, useInput } from 'ink';
import type { ReactElement } from 'react';

import {
  sourceLabel,
  type SavedView,
  type SavedViewSource,
  type SavedViewsKey,
  type SavedViewsStore,
} from '../views/saved-views-store.js';
import { theme } from '../theme/index.js';

export interface ViewsBarProps {
  store: SavedViewsStore;
  storeKey: SavedViewsKey;
  isActive: boolean;
  activeSource: SavedViewSource | undefined;
  onActiveSourceChange: (source: SavedViewSource | undefined) => void;
  /** Told whenever the inline create-form opens/closes, so the host screen can stop
   * its own `useInput` from also reacting to the same keystrokes (e.g. `n`/`R`) while
   * the caller is typing a view name. */
  onEditingChange?: ((editing: boolean) => void) | undefined;
}

const KINDS: readonly SavedViewSource['kind'][] = ['tag', 'community', 'home', 'local'];

type CreateStep = 'field' | 'name';

interface CreateDraft {
  kindIndex: number;
  step: CreateStep;
  field: string;
  name: string;
}

function draftSource(draft: CreateDraft): SavedViewSource {
  const kind = KINDS[draft.kindIndex] ?? 'tag';
  switch (kind) {
    case 'tag':
      return { kind: 'tag', tag: draft.field.trim().replace(/^#/u, '') };
    case 'community':
      return {
        kind: 'community',
        communityId: draft.field.trim(),
        communityName: draft.field.trim(),
      };
    case 'home':
    case 'local':
      return { kind };
  }
}

function requiresField(kind: SavedViewSource['kind']): boolean {
  return kind === 'tag' || kind === 'community';
}

/**
 * #192: named, client-persisted views over the existing chronological feed RPCs — a
 * switcher strip, not a new server surface. `v` starts a view; `1`-`9` jump straight
 * to one of the first nine saved views; `x` deletes whichever one is active. No RPC
 * gains a `sort`/`order` parameter here (Amendment B §194) — a view just remembers
 * which existing chronological call to make.
 */
export function ViewsBar({
  store,
  storeKey,
  isActive,
  activeSource,
  onActiveSourceChange,
  onEditingChange,
}: ViewsBarProps): ReactElement | null {
  const [views, setViews] = useState<readonly SavedView[]>([]);
  const [activeId, setActiveId] = useState<string | undefined>(undefined);
  const [draft, setDraft] = useState<CreateDraft | undefined>(undefined);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    onEditingChange?.(draft !== undefined);
  }, [draft, onEditingChange]);

  useEffect(() => {
    let cancelled = false;
    void store.list(storeKey).then((loaded) => {
      if (!cancelled) setViews(loaded);
    });
    return () => {
      cancelled = true;
    };
  }, [store, storeKey, refreshKey]);

  useInput(
    (input, key) => {
      if (draft !== undefined) {
        if (key.escape) {
          setDraft(undefined);
          return;
        }
        if (key.leftArrow || key.rightArrow) {
          if (draft.step !== 'field' || !requiresField(KINDS[draft.kindIndex] ?? 'tag')) {
            const delta = key.leftArrow ? -1 : 1;
            const nextIndex = (draft.kindIndex + delta + KINDS.length) % KINDS.length;
            setDraft({ ...draft, kindIndex: nextIndex });
          }
          return;
        }
        if (key.return) {
          const kind = KINDS[draft.kindIndex] ?? 'tag';
          if (draft.step === 'field' && requiresField(kind)) {
            if (draft.field.trim() === '') return;
            setDraft({ ...draft, step: 'name' });
            return;
          }
          if (draft.name.trim() === '') return;
          const source = draftSource(draft);
          void store.create(storeKey, draft.name, source).then((created) => {
            if (created === undefined) return;
            setRefreshKey((current) => current + 1);
            setActiveId(created.id);
            onActiveSourceChange(created.source);
          });
          setDraft(undefined);
          return;
        }
        if (key.backspace || key.delete) {
          if (draft.step === 'name') setDraft({ ...draft, name: draft.name.slice(0, -1) });
          else setDraft({ ...draft, field: draft.field.slice(0, -1) });
          return;
        }
        if (input.length === 1 && input >= ' ') {
          if (draft.step === 'name') setDraft({ ...draft, name: draft.name + input });
          else setDraft({ ...draft, field: draft.field + input });
        }
        return;
      }

      if (input === 'v') {
        setDraft({ kindIndex: 0, step: 'field', field: '', name: '' });
        return;
      }
      if (input === 'x' && activeId !== undefined) {
        void store.remove(storeKey, activeId).then(() => {
          setRefreshKey((current) => current + 1);
        });
        setActiveId(undefined);
        onActiveSourceChange(undefined);
        return;
      }
      if (input === '0') {
        setActiveId(undefined);
        onActiveSourceChange(undefined);
        return;
      }
      const digit = Number(input);
      if (Number.isInteger(digit) && digit >= 1 && digit <= 9) {
        const view = views[digit - 1];
        if (view !== undefined) {
          setActiveId(view.id);
          onActiveSourceChange(view.source);
        }
      }
    },
    { isActive },
  );

  if (draft !== undefined) {
    const kind = KINDS[draft.kindIndex] ?? 'tag';
    return (
      <Box>
        <Text color={theme.accent}>
          New view [{kind}]
          {requiresField(kind) ? ` ${draft.step === 'field' ? '>' : draft.field} ` : ' '}
          {draft.step === 'name' ? `name: ${draft.name}` : ''}
          <Text dimColor> (←/→ kind, enter next, esc cancel)</Text>
        </Text>
      </Box>
    );
  }

  if (views.length === 0 && activeSource === undefined) {
    return (
      <Box>
        <Text dimColor>v: save a view of a tag/community/home/local</Text>
      </Box>
    );
  }

  return (
    <Box>
      <Text>
        {views.map((view, index) => (
          <Text key={view.id}>
            <Text
              color={view.id === activeId ? theme.accent : theme.muted}
              bold={view.id === activeId}
            >
              {index < 9 ? `${String(index + 1)}:` : ''}
              {view.name}
            </Text>
            {index < views.length - 1 ? '  ' : ''}
          </Text>
        ))}
        {views.length > 0 ? <Text dimColor> (0: clear, x: delete active, v: new)</Text> : null}
      </Text>
    </Box>
  );
}

export { sourceLabel };
