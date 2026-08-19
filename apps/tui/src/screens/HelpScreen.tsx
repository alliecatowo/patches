import { timestampToDate } from '@patches/proto';
import { Box, Text, type Key } from 'ink';
import { useState } from 'react';
import type { ReactElement } from 'react';

import { helpSections, SCREEN_TITLES, type Binding, type Screen } from '../app/keymap.js';
import { useKeyLayer } from '../app/input.js';
import { useContentSize } from '../app/layout.js';
import type { ServerInfoState } from '../hooks/useServerInfo.js';
import { theme } from '../theme/index.js';
import { TUI_VERSION } from '../version.js';

export interface HelpScreenProps {
  target: string;
  /** The connection this node reports — the old `connect` screen's content, folded in
   * here so connection state lives in the status bar plus one reference screen rather
   * than blocking the app behind a splash on launch. */
  serverInfo: ServerInfoState;
  /** The screen `?` was pressed from — its keys are listed first ("Here"). */
  contextScreen: Screen;
  isActive: boolean;
  onClose: () => void;
}

type HelpLine =
  | { kind: 'heading'; text: string }
  | { kind: 'binding'; keys: string; text: string }
  | { kind: 'blank' };

function bindingLine(binding: Binding): HelpLine {
  return {
    kind: 'binding',
    keys: binding.keys,
    text: binding.description ?? binding.hint,
  };
}

function buildLines(contextScreen: Screen): HelpLine[] {
  const lines: HelpLine[] = [];
  const contextBindings = helpSections()
    .flatMap((section) => section.bindings)
    .filter((binding) => binding.on !== 'global' && binding.on.includes(contextScreen));

  if (contextBindings.length > 0) {
    lines.push({ kind: 'heading', text: `Here — ${SCREEN_TITLES[contextScreen]}` });
    for (const binding of contextBindings) lines.push(bindingLine(binding));
    lines.push({ kind: 'blank' });
  }

  for (const section of helpSections()) {
    lines.push({ kind: 'heading', text: section.group });
    for (const binding of section.bindings) lines.push(bindingLine(binding));
    lines.push({ kind: 'blank' });
  }
  return lines;
}

/**
 * `?` — the complete keymap, grouped and scrollable, generated from
 * `app/keymap.ts`. The status bar's hint line comes from the same table, so the two
 * can never drift apart (spec §69: keybindings must stay discoverable).
 */
export function HelpScreen({
  target,
  serverInfo,
  contextScreen,
  isActive,
  onClose,
}: HelpScreenProps): ReactElement {
  const content = useContentSize();
  const [offset, setOffset] = useState(0);
  const lines = buildLines(contextScreen);
  // Header line, its margin, and the position/scroll line at the bottom.
  const visible = Math.max(4, content.rows - 3);
  const maxOffset = Math.max(0, lines.length - visible);
  const effectiveOffset = Math.min(offset, maxOffset);

  // Help owns only its own keys. Anything else (`g h`, `q`, Ctrl+P) falls through to
  // the shell, so the overlay never becomes a trap the viewer has to Esc out of first.
  function handleKey(input: string, key: Key): boolean {
    if (input === '?' || key.escape) {
      onClose();
      return true;
    }
    if (input === 'j' || key.downArrow) {
      setOffset(Math.min(effectiveOffset + 1, maxOffset));
      return true;
    }
    if (input === 'k' || key.upArrow) {
      setOffset(Math.max(effectiveOffset - 1, 0));
      return true;
    }
    // The full keymap is far longer than any terminal, so line-at-a-time scrolling
    // alone would bury the grouped sections behind ~90 keypresses.
    if (input === ' ' || key.pageDown) {
      setOffset(Math.min(effectiveOffset + visible, maxOffset));
      return true;
    }
    if (key.pageUp) {
      setOffset(Math.max(effectiveOffset - visible, 0));
      return true;
    }
    return false;
  }

  // The shell dispatches through the layer stack (`app/input.tsx`); registering a
  // second `useInput` here would run every key twice (scrolling two rows per press).
  useKeyLayer({ id: 'help-scroll', onKey: handleKey }, isActive);

  const window = lines.slice(effectiveOffset, effectiveOffset + visible);

  return (
    <Box flexDirection="column">
      {/* One clipped line: a header that soft-wraps costs a row the layout has
          already budgeted, and everything below it slides. */}
      <Box height={1} flexShrink={0} overflow="hidden">
        <Text color={theme.muted} wrap="truncate-end">
          <Text color={theme.accent}>patches {TUI_VERSION}</Text> · {target} ·{' '}
          <ServerSummary state={serverInfo} />
        </Text>
      </Box>
      <Box flexDirection="column" flexShrink={0} marginTop={1} height={visible} overflow="hidden">
        {window.map((line, index) => {
          const key = `${String(effectiveOffset + index)}:${line.kind}`;
          if (line.kind === 'blank') return <Text key={key}> </Text>;
          if (line.kind === 'heading') {
            return (
              <Text key={key} color={theme.accent} bold>
                {line.text}
              </Text>
            );
          }
          return (
            <Box key={key} flexShrink={0} height={1} overflow="hidden">
              <Box width={12} flexShrink={0}>
                <Text color={theme.warn}>{line.keys}</Text>
              </Box>
              <Text color={theme.muted} wrap="truncate-end">
                {line.text}
              </Text>
            </Box>
          );
        })}
      </Box>
      <Text color={theme.muted} wrap="truncate-end">
        {`${String(effectiveOffset + window.length)}/${String(lines.length)} · j/k line · Space/PgDn page · ? or Esc close`}
      </Text>
    </Box>
  );
}

/** One line of "what is this node" — the reason the old `connect` splash existed. */
function ServerSummary({ state }: { state: ServerInfoState }): ReactElement {
  if (state.status === 'connecting') return <Text color={theme.warn}>connecting…</Text>;
  if (state.status === 'error') {
    return <Text color={theme.error}>offline — {state.error.title}</Text>;
  }
  const serverTime = timestampToDate(state.info.serverTime);
  return (
    <Text color={theme.ok}>
      {state.info.instanceName} · {state.info.serverVersion} (protocol v
      {String(state.info.protocolVersion)}) · min client {state.info.minClientVersion} ·{' '}
      {serverTime?.toISOString() ?? 'unknown time'}
    </Text>
  );
}
