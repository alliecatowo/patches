import { Text } from 'ink';
import type { ReactElement } from 'react';

import { sanitizeForTerminal } from '../format/sanitize.js';
import { theme } from '../theme/index.js';
import { usePlainMode } from '../theme/plain-mode.js';

export type ToastKind = 'info' | 'success' | 'error';

export interface Toast {
  message: string;
  kind: ToastKind;
}

const GLYPHS: Readonly<Record<ToastKind, string>> = {
  info: '·',
  success: '✓',
  error: '✗',
};

function colorFor(kind: ToastKind): string {
  switch (kind) {
    case 'info':
      return theme.warn;
    case 'success':
      return theme.ok;
    case 'error':
      return theme.error;
  }
}

/**
 * The in-app message line, just above the status bar: a like registering, a report
 * sent, a gRPC error. Auto-clears (`App` owns the timer) so it never becomes
 * permanent chrome. Plain mode drops the glyph, keeping the words (spec §173).
 */
export function ToastLine({ toast }: { toast: Toast | undefined }): ReactElement | null {
  const plain = usePlainMode();
  if (toast === undefined) return null;
  return (
    <Text color={colorFor(toast.kind)} wrap="truncate-end">
      {plain ? '' : `${GLYPHS[toast.kind]} `}
      {sanitizeForTerminal(toast.message)}
    </Text>
  );
}
