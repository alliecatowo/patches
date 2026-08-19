import { Box, Text } from 'ink';
import type { ReactElement } from 'react';

import { useKeyLayer } from '../app/input.js';
import { sanitizeForTerminal } from '../format/sanitize.js';
import { theme } from '../theme/index.js';

export interface ConfirmDialogProps {
  id: string;
  title: string;
  body: string;
  onConfirm: () => void;
  onCancel: () => void;
  isActive?: boolean;
}

/** A measured three-row strip: title, body, and an unambiguous plain `[y/n]`. */
export function ConfirmDialog({
  id,
  title,
  body,
  onConfirm,
  onCancel,
  isActive = true,
}: ConfirmDialogProps): ReactElement {
  useKeyLayer(
    {
      id: `confirm:${id}`,
      onKey(input, key) {
        if (input.toLowerCase() === 'y') {
          onConfirm();
          return true;
        }
        if (input.toLowerCase() === 'n' || key.escape) {
          onCancel();
          return true;
        }
        return true;
      },
    },
    isActive,
  );

  return (
    <Box flexDirection="column" height={3} flexShrink={0} overflow="hidden">
      <Text color={theme.error} bold wrap="truncate-end">
        {sanitizeForTerminal(title)}
      </Text>
      <Text wrap="truncate-end">{sanitizeForTerminal(body)}</Text>
      <Text color={theme.warn}>[y/n]</Text>
    </Box>
  );
}
