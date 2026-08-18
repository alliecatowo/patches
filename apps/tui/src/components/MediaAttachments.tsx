import { buildFallbackBox, InlineImage, useOptionalMediaRenderer } from '@patches/terminal-media';
import type { PreparedImage, TerminalMediaRenderer } from '@patches/terminal-media';
import type { MediaAttachment } from '@patches/proto';
import { Box, Text } from 'ink';
import type { ReactElement } from 'react';

import { useMediaAttachment } from '../hooks/useMediaAttachment.js';
import { useOptionalMediaSession, type MediaSession } from '../media/media-session.js';
import { usePlainMode } from '../theme/plain-mode.js';

export interface MediaAttachmentsProps {
  attachments: readonly MediaAttachment[];
  /** Cell budget per image. Defaults chosen to read as "a photo", not dominate a
   * timeline row. */
  maxCols?: number;
  maxRows?: number;
}

const DEFAULT_MAX_COLS = 40;
const DEFAULT_MAX_ROWS = 12;

function mimeSubtype(mime: string): string {
  const slash = mime.indexOf('/');
  return slash === -1 ? mime : mime.slice(slash + 1);
}

/** The spec §75 box, built directly from `MediaAttachment`'s own fields — no network
 * call, so this is what every attachment renders as before a Kitty fetch resolves, in
 * plain mode, in a non-Kitty terminal, and in `PostRow`'s own unit tests (no provider
 * in scope at all). */
function FallbackAttachment({
  attachment,
  cols,
}: {
  attachment: MediaAttachment;
  cols: number;
}): ReactElement {
  const format = mimeSubtype(attachment.mimeType);
  const size =
    attachment.width > 0 && attachment.height > 0
      ? `${String(attachment.width)}×${String(attachment.height)}`
      : 'unknown size';
  const rows = buildFallbackBox(cols, `image · ${size} · ${format}`);
  return (
    <Box flexDirection="column">
      {rows.map((row, index) => (
        // The array index IS the row coordinate here (mirrors `InlineImage`'s own
        // `${image.id}:${index}` keys) — row N of this box is always row N.
        <Text key={`${attachment.mediaId}:${index}`}>{row}</Text>
      ))}
    </Box>
  );
}

/** Fetches and draws one attachment inline once the Kitty renderer confirms it,
 * falling back to the description box on any error (a private/expired media id, a
 * network failure, an unauthenticated viewer — `useMediaAttachment` folds all of these
 * into `status: 'error'`, never a thrown exception the render tree has to catch). */
function InlineAttachment({
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
    return <InlineImageRow renderer={renderer} image={state.prepared} />;
  }
  if (state.status === 'error') {
    return <FallbackAttachment attachment={attachment} cols={maxCols} />;
  }
  const rows = buildFallbackBox(maxCols, 'loading image…');
  return (
    <Box flexDirection="column">
      {rows.map((row, index) => (
        <Text key={`${attachment.mediaId}:loading:${index}`}>{row}</Text>
      ))}
    </Box>
  );
}

function InlineImageRow({
  renderer,
  image,
}: {
  renderer: TerminalMediaRenderer;
  image: PreparedImage;
}): ReactElement {
  return <InlineImage renderer={renderer} image={image} />;
}

/**
 * `PostRow`/`ThreadScreen` attachment rendering (B-004, spec §73–76): Kitty inline
 * images where the terminal supports it and a `MediaSession` is in scope, the spec §75
 * fallback box everywhere else. Renders nothing for a post with no attachments.
 */
export function MediaAttachments({
  attachments,
  maxCols = DEFAULT_MAX_COLS,
  maxRows = DEFAULT_MAX_ROWS,
}: MediaAttachmentsProps): ReactElement | null {
  const plain = usePlainMode();
  const renderer = useOptionalMediaRenderer();
  const session = useOptionalMediaSession();

  if (attachments.length === 0) return null;

  const useInline =
    !plain && renderer !== undefined && renderer.kind === 'kitty' && session !== undefined;

  return (
    <Box flexDirection="column" marginTop={1}>
      {attachments.map((attachment) =>
        useInline ? (
          <InlineAttachment
            key={attachment.mediaId}
            session={session}
            renderer={renderer}
            attachment={attachment}
            maxCols={maxCols}
            maxRows={maxRows}
          />
        ) : (
          <FallbackAttachment key={attachment.mediaId} attachment={attachment} cols={maxCols} />
        ),
      )}
    </Box>
  );
}
