import type { MediaAttachment } from '@patches/proto';
import { buildFallbackBox, InlineImage, useOptionalMediaRenderer } from '@patches/terminal-media';
import type { PreparedImage, TerminalMediaRenderer } from '@patches/terminal-media';
import { Box, Text, useInput } from 'ink';
import { useState } from 'react';
import type { ReactElement } from 'react';

import { useContentSize } from '../app/layout.js';
import { MediaAttachments } from '../components/MediaAttachments.js';
import { sanitizeForTerminal } from '../format/sanitize.js';
import { useMediaAttachment } from '../hooks/useMediaAttachment.js';
import { useOptionalMediaSession, type MediaSession } from '../media/media-session.js';
import { usePlainMode } from '../theme/plain-mode.js';
import { theme } from '../theme/index.js';

export interface MediaViewerScreenProps {
  attachments: readonly MediaAttachment[];
  initialIndex?: number;
  isActive: boolean;
  onOpenExternal?: ((attachment: MediaAttachment) => void) | undefined;
  onCancel?: (() => void) | undefined;
}

/**
 * Draws the largest art the active renderer supports for one attachment, filling the
 * viewer's whole art budget. Unlike `MediaAttachments` (built for a scrolling
 * timeline, where only Kitty is safe to inline — see its own doc comment) the viewer
 * owns exactly one stable placement at a time, so half-block/ascii art — plain `<Text>`
 * content, no raw stdout writes, no scroll-smear risk — is just as safe to inline here
 * as Kitty is.
 */
function ArtAttachment({
  session,
  renderer,
  attachment,
  maxCols,
  maxRows,
}: {
  session: MediaSession;
  renderer: TerminalMediaRenderer;
  attachment: MediaAttachment;
  maxCols: number;
  maxRows: number;
}): ReactElement {
  const state = useMediaAttachment(session, renderer, attachment, { maxCols, maxRows });
  if (state.status === 'ready') {
    return <ArtImageRow renderer={renderer} image={state.prepared} />;
  }
  const rows = buildFallbackBox(
    maxCols,
    state.status === 'error' ? `image · ${mimeSubtype(attachment.mimeType)}` : 'loading image…',
  );
  return (
    <Box flexDirection="column">
      {rows.map((row, index) => (
        <Text key={`${attachment.mediaId}:${state.status}:${index}`}>{row}</Text>
      ))}
    </Box>
  );
}

function ArtImageRow({
  renderer,
  image,
}: {
  renderer: TerminalMediaRenderer;
  image: PreparedImage;
}): ReactElement {
  return <InlineImage renderer={renderer} image={image} />;
}

function mimeSubtype(mime: string): string {
  const slash = mime.indexOf('/');
  return slash === -1 ? mime : mime.slice(slash + 1);
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
  const plain = usePlainMode();
  const renderer = useOptionalMediaRenderer();
  const session = useOptionalMediaSession();
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

  const artCols = Math.max(12, content.columns - 2);
  const artRows = Math.max(3, content.rows - 5);
  // The whole point of forcing a specific `images` mode (spec §75-adjacent: "shows
  // the largest art that fits when not Kitty") is that the *viewer* itself never
  // second-guesses the renderer's kind beyond "is it art at all" — `box`/`off` modes
  // already surface as `renderer.kind === 'box'` by the time createRenderer() picked
  // one, so this is the single place that decision is consumed.
  const useArt =
    !plain &&
    renderer !== undefined &&
    renderer.kind !== 'box' &&
    session !== undefined &&
    currentAttachment !== undefined;

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
            {useArt && renderer !== undefined && session !== undefined ? (
              <ArtAttachment
                key={currentAttachment.mediaId}
                session={session}
                renderer={renderer}
                attachment={currentAttachment}
                maxCols={artCols}
                maxRows={artRows}
              />
            ) : (
              <MediaAttachments
                key={currentAttachment.mediaId}
                attachments={[currentAttachment]}
                maxCols={artCols}
                maxRows={artRows}
                inline
              />
            )}
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
