import { isPageValidationError, parsePageStrict } from '@patches/domain';
import type { UpdatePageResponse } from '../api/wire/types.js';
import { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import type { ReactElement } from 'react';

import type { PatchesApi } from '../api/client.js';
import { describeGrpcError } from '../api/errors.js';
import {
  applyFieldText,
  BLOCK_TYPE_SPECS,
  cycleEnumValue,
  fieldValueToText,
  getBlockTypeSpec,
  type BlockTypeSpec,
} from '../pages/block-editor-schema.js';
import type { PageDraftStore } from '../pages/draft-store.js';
import { sanitizeForTerminal } from '../format/sanitize.js';
import { theme } from '../theme/index.js';

export interface PageBlocksEditorScreenProps {
  api: PatchesApi;
  handle: string;
  /** Which sub-page's `blocks` array this screen edits — every other sub-page, the
   * theme, and any block type this editor doesn't recognize round-trips unchanged. */
  slug: string;
  /** The whole document's current raw JSON text — same string `PageScreen`'s `e`
   * ($EDITOR) round trip works from, already resolved against `draftStore` by the
   * caller (`PageScreen.openBlocksEditor`), same "prefer an unsaved draft over the
   * server's last-known copy" rule the `$EDITOR` flow already follows. */
  rawText: string;
  isActive: boolean;
  ensureAccessToken: () => Promise<string>;
  draftStore: PageDraftStore;
  /** `Esc` — back to `PageScreen`, persisting whatever's in progress (valid or not)
   * to `draftStore` first, same "never lose a draft" rule as the `$EDITOR` flow. */
  onCancel: () => void;
  /** `Ctrl+S` succeeded. */
  onSaved: (response: UpdatePageResponse) => void;
}

type RawBlock = Record<string, unknown>;

interface EditFieldsState {
  index: number;
  spec: BlockTypeSpec;
  texts: Record<string, string>;
  focus: number;
}

type Mode =
  | { mode: 'list' }
  | { mode: 'confirmDelete'; index: number }
  | { mode: 'addPicker'; typeIndex: number }
  | { mode: 'editFields'; state: EditFieldsState };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/** `Array.isArray` narrows `unknown` to `any[]` (a TS stdlib quirk — its type
 * predicate is `arg is any[]` regardless of the input type), so every read of
 * `fullDoc.pages` goes through this rather than a bare `Array.isArray(...) ? x : []`
 * ternary, to keep the `any` from leaking into every caller. */
function asUnknownArray(value: unknown): unknown[] {
  return Array.isArray(value) ? (value as unknown[]) : [];
}

/** Best-effort, never-throws read of `rawText`'s `pages[slug].blocks` — tolerant of a
 * document that doesn't fully validate yet (this screen edits drafts, same spirit as
 * `page.ts`'s `parseSubPageLenient`). `pageIndex === -1` means `slug` wasn't found (the
 * sub-page was deleted from under this screen some other way); `blocks` is then simply
 * empty and `currentRawText` leaves the document otherwise untouched. */
function parseDocumentForEditing(
  rawText: string,
  slug: string,
): { fullDoc: Record<string, unknown>; pageIndex: number; blocks: RawBlock[] } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    parsed = {};
  }
  const fullDoc = isRecord(parsed) ? parsed : {};
  const pages = asUnknownArray(fullDoc.pages);
  const pageIndex = pages.findIndex((page) => isRecord(page) && page.slug === slug);
  const page = pageIndex === -1 ? undefined : pages[pageIndex];
  const rawBlocks = isRecord(page) ? asUnknownArray(page.blocks) : [];
  return { fullDoc, pageIndex, blocks: rawBlocks.filter(isRecord) };
}

/**
 * `E` on `PageScreen` (B-023): a structured, block-by-block editor for the active
 * sub-page — `j`/`k` select, `J`/`K` reorder, `a` add (type picker), `d` delete
 * (`y`/`n` confirm), `Enter` edit the selected block's own scalar fields in a small
 * form, `Ctrl+S` validates the *whole* document with `parsePageStrict` and saves via
 * `UpdatePage`, `Esc` backs out keeping the draft. A block type this editor has no
 * form for (currently only `Links`) still lists, reorders, and deletes — its content
 * just isn't reachable from `Enter` here (the hint points at `PageScreen`'s `e`
 * $EDITOR round trip instead).
 */
export function PageBlocksEditorScreen({
  api,
  handle,
  slug,
  rawText,
  isActive,
  ensureAccessToken,
  draftStore,
  onCancel,
  onSaved,
}: PageBlocksEditorScreenProps): ReactElement {
  const [initial] = useState(() => parseDocumentForEditing(rawText, slug));
  const [blocks, setBlocks] = useState<RawBlock[]>(initial.blocks);
  const [selected, setSelected] = useState(0);
  const [mode, setMode] = useState<Mode>({ mode: 'list' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);

  function currentRawText(withBlocks: RawBlock[] = blocks): string {
    // Copied, never the same array `initial.fullDoc.pages` points at — `initial` is
    // React state from the mount-time `useState` initializer and must never be
    // mutated in place.
    const pages = [...asUnknownArray(initial.fullDoc.pages)];
    if (initial.pageIndex >= 0 && initial.pageIndex < pages.length) {
      const page = pages[initial.pageIndex];
      pages[initial.pageIndex] = { ...(isRecord(page) ? page : {}), blocks: withBlocks };
    }
    return JSON.stringify({ ...initial.fullDoc, pages });
  }

  function backOut(): void {
    void draftStore.save({ handle, rawJson: currentRawText() });
    onCancel();
  }

  function moveBlock(delta: number): void {
    const target = selected + delta;
    if (target < 0 || target >= blocks.length) return;
    const next = [...blocks];
    const a = next[selected];
    const b = next[target];
    if (a === undefined || b === undefined) return;
    next[selected] = b;
    next[target] = a;
    setBlocks(next);
    setSelected(target);
  }

  function openFieldsFor(index: number): void {
    const raw = blocks[index];
    if (raw === undefined) return;
    const type = typeof raw.type === 'string' ? raw.type : undefined;
    const spec = type === undefined ? undefined : getBlockTypeSpec(type);
    if (spec === undefined) {
      setError(`"${type ?? '(no type)'}" isn't editable in this form.`);
      return;
    }
    const texts: Record<string, string> = {};
    for (const field of spec.fields) texts[field.key] = fieldValueToText(field, raw);
    setError(undefined);
    setMode({ mode: 'editFields', state: { index, spec, texts, focus: 0 } });
  }

  function commitFields(state: EditFieldsState): void {
    let nextRaw: RawBlock = { type: state.spec.type };
    for (const field of state.spec.fields) {
      nextRaw = applyFieldText(field, nextRaw, state.texts[field.key] ?? '');
    }
    setBlocks((current) =>
      current.map((block, index) => (index === state.index ? nextRaw : block)),
    );
    setMode({ mode: 'list' });
  }

  /** Always derives the next text from the setter's own `current` mode, never the
   * outer render's closured `mode` — several keystrokes fired in the same tick must
   * each build on the previous one's result (same rule `EditProfileScreen.updateField`
   * follows, for the same reason). */
  function updateFieldText(next: (current: string) => string): void {
    setMode((current) => {
      if (current.mode !== 'editFields') return current;
      const field = current.state.spec.fields[current.state.focus];
      if (field === undefined) return current;
      const currentText = current.state.texts[field.key] ?? '';
      return {
        mode: 'editFields',
        state: {
          ...current.state,
          texts: { ...current.state.texts, [field.key]: next(currentText) },
        },
      };
    });
  }

  function moveFieldFocus(delta: number): void {
    setMode((current) => {
      if (current.mode !== 'editFields') return current;
      const total = current.state.spec.fields.length;
      if (total === 0) return current;
      const nextFocus = (current.state.focus + delta + total) % total;
      return { mode: 'editFields', state: { ...current.state, focus: nextFocus } };
    });
  }

  async function submit(): Promise<void> {
    setSaving(true);
    setError(undefined);
    const nextRawText = currentRawText();
    let parsed;
    try {
      parsed = parsePageStrict(JSON.parse(nextRawText) as unknown);
    } catch (parseError) {
      await draftStore.save({ handle, rawJson: nextRawText });
      setSaving(false);
      setError(
        isPageValidationError(parseError)
          ? parseError.message
          : 'That produced invalid JSON — check your edits.',
      );
      return;
    }
    try {
      const accessToken = await ensureAccessToken();
      const response = await api.updatePage(
        { document: Buffer.from(JSON.stringify(parsed), 'utf8') },
        accessToken,
      );
      await draftStore.clear();
      setSaving(false);
      onSaved(response);
    } catch (saveError) {
      await draftStore.save({ handle, rawJson: nextRawText });
      setSaving(false);
      setError(describeGrpcError(saveError, api.target).title);
    }
  }

  useInput(
    (input, key) => {
      if (saving) return;

      if (mode.mode === 'confirmDelete') {
        if (input === 'y') {
          const nextBlocks = blocks.filter((_, index) => index !== mode.index);
          setBlocks(nextBlocks);
          setSelected((current) => Math.min(current, Math.max(0, nextBlocks.length - 1)));
          setMode({ mode: 'list' });
          return;
        }
        if (input === 'n' || key.escape) setMode({ mode: 'list' });
        return;
      }

      if (mode.mode === 'addPicker') {
        if (key.escape) {
          setMode({ mode: 'list' });
          return;
        }
        // Functional updates, not `mode.typeIndex + 1` off the render closure — several
        // `j`/`k` presses fired in the same tick (e.g. a test's tight loop with no
        // `await` between them) must each build on the previous one's result, same
        // rule `updateFieldText`/`moveFieldFocus` follow below (and
        // `EditProfileScreen.updateField`'s doc comment explains why).
        if (input === 'j' || key.downArrow) {
          setMode((current) =>
            current.mode === 'addPicker'
              ? {
                  mode: 'addPicker',
                  typeIndex: Math.min(current.typeIndex + 1, BLOCK_TYPE_SPECS.length - 1),
                }
              : current,
          );
          return;
        }
        if (input === 'k' || key.upArrow) {
          setMode((current) =>
            current.mode === 'addPicker'
              ? { mode: 'addPicker', typeIndex: Math.max(current.typeIndex - 1, 0) }
              : current,
          );
          return;
        }
        if (key.return) {
          const spec = BLOCK_TYPE_SPECS[mode.typeIndex];
          if (spec === undefined) return;
          const insertAt = blocks.length === 0 ? 0 : selected + 1;
          const nextBlocks = [
            ...blocks.slice(0, insertAt),
            spec.createDefault(),
            ...blocks.slice(insertAt),
          ];
          setBlocks(nextBlocks);
          setSelected(insertAt);
          setMode({ mode: 'list' });
        }
        return;
      }

      if (mode.mode === 'editFields') {
        const { state } = mode;
        if (key.escape) {
          setMode({ mode: 'list' });
          return;
        }
        if (key.ctrl && input === 's') {
          commitFields(state);
          return;
        }
        if (state.spec.fields.length === 0) return;
        const field = state.spec.fields[state.focus];
        if (field === undefined) return;
        if (field.kind === 'enum') {
          if (key.return || key.rightArrow) {
            updateFieldText((value) => cycleEnumValue(field, value, 1));
            return;
          }
          if (key.leftArrow) {
            updateFieldText((value) => cycleEnumValue(field, value, -1));
            return;
          }
        }
        if (key.tab && key.shift) {
          moveFieldFocus(-1);
          return;
        }
        if (key.tab || key.downArrow) {
          moveFieldFocus(1);
          return;
        }
        if (key.upArrow) {
          moveFieldFocus(-1);
          return;
        }
        if (field.kind === 'enum') return; // no free text on an enum field
        if (key.return) {
          if (field.kind === 'multiline') updateFieldText((value) => `${value}\n`);
          return;
        }
        if (key.backspace || key.delete) {
          updateFieldText((value) => value.slice(0, -1));
          return;
        }
        if (key.ctrl || key.meta) return;
        if (input.length > 0) {
          const limit = field.maxChars;
          updateFieldText((value) =>
            limit === undefined || value.length < limit ? value + input : value,
          );
        }
        return;
      }

      // mode === 'list'
      if (key.escape) {
        backOut();
        return;
      }
      if (key.ctrl && input === 's') {
        void submit();
        return;
      }
      if ((input === 'j' || key.downArrow) && blocks.length > 0) {
        setSelected((current) => Math.min(current + 1, blocks.length - 1));
        return;
      }
      if ((input === 'k' || key.upArrow) && blocks.length > 0) {
        setSelected((current) => Math.max(current - 1, 0));
        return;
      }
      if (input === 'J') {
        moveBlock(1);
        return;
      }
      if (input === 'K') {
        moveBlock(-1);
        return;
      }
      if (input === 'a') {
        setMode({ mode: 'addPicker', typeIndex: 0 });
        return;
      }
      if (input === 'd' && blocks.length > 0) {
        setMode({ mode: 'confirmDelete', index: selected });
        return;
      }
      if (key.return && blocks.length > 0) {
        openFieldsFor(selected);
      }
    },
    { isActive },
  );

  return (
    <Box flexDirection="column">
      <Text color={theme.accent}>
        Edit blocks — @{sanitizeForTerminal(handle)}
        {slug === '' ? '' : `/${sanitizeForTerminal(slug)}`}
      </Text>

      {mode.mode === 'addPicker' ? (
        <Box marginTop={1} flexDirection="column">
          <Text color={theme.muted}>Add a block:</Text>
          {BLOCK_TYPE_SPECS.map((spec, index) => (
            <Text
              key={spec.type}
              {...(index === mode.typeIndex ? { color: theme.accent } : {})}
              bold={index === mode.typeIndex}
            >
              {index === mode.typeIndex ? '› ' : '  '}
              {spec.label}
            </Text>
          ))}
          <Text color={theme.muted}>j/k select · Enter add · Esc cancel</Text>
        </Box>
      ) : mode.mode === 'editFields' ? (
        <Box marginTop={1} flexDirection="column">
          <Text color={theme.accent}>{mode.state.spec.label}</Text>
          {mode.state.spec.fields.length === 0 ? (
            <Text color={theme.muted}>{mode.state.spec.formNote ?? 'Nothing to edit here.'}</Text>
          ) : (
            mode.state.spec.fields.map((field, index) => {
              const focused = index === mode.state.focus;
              const text = mode.state.texts[field.key] ?? '';
              return (
                <Box key={field.key} flexDirection="column" marginBottom={1}>
                  <Text color={focused ? theme.accent : theme.muted} bold={focused}>
                    {field.label}
                    {field.maxChars === undefined
                      ? ''
                      : ` (${String(text.length)}/${String(field.maxChars)})`}
                  </Text>
                  <Text wrap="wrap">
                    {sanitizeForTerminal(text === '' ? '(empty)' : text)}
                    {focused && field.kind !== 'enum' ? <Text color={theme.accent}>█</Text> : null}
                  </Text>
                </Box>
              );
            })
          )}
          <Text color={theme.muted}>
            {mode.state.spec.fields.some((field) => field.kind === 'enum')
              ? 'Tab/↑↓ field · ←/→ change · '
              : 'Tab/↑↓ field · '}
            Ctrl+S save block · Esc cancel
          </Text>
        </Box>
      ) : (
        <Box marginTop={1} flexDirection="column">
          {blocks.length === 0 ? (
            <Text color={theme.muted}>No blocks yet — press a to add one.</Text>
          ) : (
            blocks.map((raw, index) => {
              const type = typeof raw.type === 'string' ? raw.type : undefined;
              const spec = type === undefined ? undefined : getBlockTypeSpec(type);
              const isSelected = index === selected;
              const label = spec?.label ?? `Unknown${type === undefined ? '' : ` (${type})`}`;
              const summary = spec?.summarize(raw) ?? 'not editable here';
              return (
                <Text
                  key={index}
                  {...(isSelected ? { color: theme.accent } : {})}
                  bold={isSelected}
                >
                  {isSelected ? '› ' : '  '}
                  {sanitizeForTerminal(label)} — {sanitizeForTerminal(summary)}
                </Text>
              );
            })
          )}
          {mode.mode === 'confirmDelete' ? (
            <Text color={theme.warn}>Delete this block? y/n</Text>
          ) : null}
        </Box>
      )}

      {error === undefined ? null : <Text color={theme.error}>{sanitizeForTerminal(error)}</Text>}
      <Box marginTop={1}>
        <Text color={theme.muted}>
          {saving
            ? 'Saving…'
            : mode.mode === 'list'
              ? 'j/k select · J/K reorder · a add · d delete · Enter edit · Ctrl+S save · Esc back'
              : ''}
        </Text>
      </Box>
    </Box>
  );
}
