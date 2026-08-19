import { timestampToDate } from '@patches/proto';
import { Box, Text, useInput, useWindowSize } from 'ink';
import { useState } from 'react';
import type { ReactElement } from 'react';

import { helpSections, SCREEN_TITLES, type Binding, type Screen } from '../app/keymap.js';
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
}: HelpScreenProps): ReactElement {
  const { rows } = useWindowSize();
  const [offset, setOffset] = useState(0);
  const lines = buildLines(contextScreen);
  // The header block above plus the shell's separator/status bar cost ~9 rows.
  const visible = Math.max(4, rows - 9);
  const maxOffset = Math.max(0, lines.length - visible);
  const effectiveOffset = Math.min(offset, maxOffset);

  useInput(
    (input, key) => {
      if (input === 'j' || key.downArrow) {
        setOffset(Math.min(effectiveOffset + 1, maxOffset));
        return;
      }
      if (input === 'k' || key.upArrow) {
        setOffset(Math.max(effectiveOffset - 1, 0));
      }
    },
    { isActive },
  );

  const window = lines.slice(effectiveOffset, effectiveOffset + visible);

  return (
    <Box flexDirection="column">
      <Box>
        <Text color={theme.accent}>patches {TUI_VERSION}</Text>
        <Text color={theme.muted}> · {target} · </Text>
        <ServerSummary state={serverInfo} />
      </Box>
      <Box flexDirection="column" marginTop={1}>
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
            <Box key={key}>
              <Box width={12}>
                <Text color={theme.warn}>{line.keys}</Text>
              </Box>
              <Text color={theme.muted} wrap="truncate-end">
                {line.text}
              </Text>
            </Box>
          );
        })}
      </Box>
      <Text color={theme.muted}>
        {effectiveOffset + window.length}/{lines.length} · j/k scroll · ? or Esc close
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
