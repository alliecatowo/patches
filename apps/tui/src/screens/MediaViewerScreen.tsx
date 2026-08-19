import type { MediaAttachment } from '@patches/proto';
import { Box, Text, useInput } from 'ink';
import { useState } from 'react';
import type { ReactElement } from 'react';

import { useContentSize } from '../app/layout.js';
import { MediaAttachments } from '../components/MediaAttachments.js';
import { sanitizeForTerminal } from '../format/sanitize.js';
import { theme } from '../theme/index.js';

export interface MediaViewerScreenProps {
  attachments: readonly MediaAttachment[];
  initialIndex?: number;
  isActive: boolean;
  onOpenExternal?: ((attachment: MediaAttachment) => void) | undefined;
  onCancel?: (() => void) | undefined;
}

/** Stable one-placement media viewer. Unlike a timeline it never scrolls content
 * underneath a Kitty placement; switching images unmounts the previous owner, whose
 * hook emits the terminal delete before preparing the next one (P12-018). */
export function MediaViewerScreen({
  attachments,
  initialIndex = 0,
  isActive,
  onOpenExternal,
  onCancel,
}: MediaViewerScreenProps): ReactElement {
  const content = useContentSize();
  const [selected, setSelected] = useState(() =>
    Math.min(Math.max(initialIndex, 0), Math.max(attachments.length - 1, 0)),
  );
  const effectiveSelected = Math.min(selected, Math.max(attachments.length - 1, 0));
  const currentAttachment = attachments[effectiveSelected];

  useInput(
    (input, key) => {
      if (key.escape || input === 'q') {
        onCancel?.();
        return;
      }
      if (attachments.length === 0) return;
      if (key.leftArrow || key.upArrow || input === 'h' || input === 'k') {
        setSelected((current) => Math.max(0, current - 1));
        return;
      }
      if (key.rightArrow || key.downArrow || input === 'l' || input === 'j') {
        setSelected((current) => Math.min(attachments.length - 1, current + 1));
        return;
      }
      if (input === 'o' && currentAttachment !== undefined) {
        onOpenExternal?.(currentAttachment);
      }
    },
    { isActive },
  );

  return (
    <Box flexDirection="column" height={content.rows} overflow="hidden">
      <Text color={theme.accent} wrap="truncate-end">
        Media{' '}
        {attachments.length === 0
          ? '0/0'
          : `${String(effectiveSelected + 1)}/${String(attachments.length)}`}
      </Text>
      {currentAttachment === undefined ? (
        <Text color={theme.muted}>This post has no media.</Text>
      ) : (
        <>
          <Box height={Math.max(3, content.rows - 4)} flexShrink={0} overflow="hidden">
            <MediaAttachments
              key={currentAttachment.mediaId}
              attachments={[currentAttachment]}
              maxCols={Math.max(12, content.columns - 2)}
              maxRows={Math.max(3, content.rows - 5)}
              inline
            />
          </Box>
          <Text wrap="truncate-end">
            {currentAttachment.altText === ''
              ? '[No alt text was provided]'
              : sanitizeForTerminal(currentAttachment.altText)}
          </Text>
        </>
      )}
      <Text color={theme.muted} wrap="truncate-end">
        h/l or arrows previous/next · o open externally · Esc back
      </Text>
    </Box>
  );
}
