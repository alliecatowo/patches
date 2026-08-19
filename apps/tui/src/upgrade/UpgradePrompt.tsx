import { Box, Text, useInput } from 'ink';
import Spinner from 'ink-spinner';
import { useRef, useState, type ReactElement } from 'react';

import type { UpgradeInfo } from './check.js';
import type { InstallResult } from './install.js';

export interface UpgradePromptProps {
  currentVersion: string;
  upgrade: UpgradeInfo;
  install: (upgrade: UpgradeInfo, onOutput: (line: string) => void) => Promise<InstallResult>;
  /** Called when the user declines (`n`/Esc/Enter), or dismisses a failure with any key — never
   * called on success, since a successful upgrade is meant to stay on screen until Ctrl+C. */
  onDone: () => void;
  /** No `usePlainMode()` here on purpose: this renders in its own `render()` call, before (and
   * outside) the `App` tree that owns `PlainModeProvider` — the caller passes the same
   * already-resolved flag it will hand `App` (spec §173, `Loading.tsx`'s pattern). */
  plain?: boolean;
}

type Status = 'prompt' | 'installing' | 'success' | 'failure';

/**
 * "A Patches upgrade is available… [y/n]" — rendered before the main app, not on the alternate
 * screen, so its output stays in scrollback either way (harness brief: launch → prompt → the
 * ordinary TUI, or launch → prompt → upgrade → stay put for Ctrl+C).
 */
export function UpgradePrompt({
  currentVersion,
  upgrade,
  install,
  onDone,
  plain = false,
}: UpgradePromptProps): ReactElement {
  const [status, setStatus] = useState<Status>('prompt');
  const [lastLine, setLastLine] = useState('');
  const [failure, setFailure] = useState<InstallResult | undefined>(undefined);
  const startedRef = useRef(false);

  useInput((input, key) => {
    if (status === 'prompt') {
      if (input === 'y' || input === 'Y') {
        if (startedRef.current) return;
        startedRef.current = true;
        setStatus('installing');
        install(upgrade, (line) => setLastLine(line))
          .then((result) => {
            if (result.ok) {
              setStatus('success');
            } else {
              setFailure(result);
              setStatus('failure');
            }
          })
          .catch((error: unknown) => {
            setFailure({
              ok: false,
              message: error instanceof Error ? error.message : String(error),
            });
            setStatus('failure');
          });
        return;
      }
      if (input === 'n' || input === 'N' || key.escape || key.return) {
        onDone();
      }
      return;
    }

    if (status === 'failure') {
      // "Continue on any key" (harness brief) — installing/success ignore all keys; Ctrl+C
      // exits the process instead (the render() call this mounts under sets exitOnCtrlC: true).
      onDone();
    }
  });

  if (status === 'prompt') {
    return (
      <Box flexDirection="column">
        <Text>
          A Patches upgrade is available: {currentVersion} → {upgrade.latestVersion}. Upgrade now?
          [y/n]
        </Text>
      </Box>
    );
  }

  if (status === 'installing') {
    return (
      <Box flexDirection="column">
        {plain ? (
          <Text>Upgrading…</Text>
        ) : (
          <Text>
            <Spinner type="dots" /> Upgrading…
          </Text>
        )}
        {lastLine !== '' ? <Text dimColor>{lastLine}</Text> : null}
      </Box>
    );
  }

  if (status === 'success') {
    return (
      <Box flexDirection="column">
        <Text>Upgraded to {upgrade.latestVersion}.</Text>
        <Text>Press Ctrl+C to exit, then relaunch `patches`.</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      <Text>Upgrade failed: {failure?.message ?? 'unknown error'}</Text>
      {failure?.manualCommand !== undefined ? (
        <Text dimColor>Try it by hand: {failure.manualCommand}</Text>
      ) : null}
      <Text dimColor>Press any key to continue.</Text>
    </Box>
  );
}
