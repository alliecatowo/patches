import { buildFallbackBox, InlineImage, useOptionalMediaRenderer } from '@patches/terminal-media';
import type { PreparedImage, TerminalMediaRenderer } from '@patches/terminal-media';
import type { MediaAttachment } from '../api/wire/types.js';
import { Box, Text } from 'ink';
import type { ReactElement } from 'react';

import { useMediaAttachment } from '../hooks/useMediaAttachment.js';
import { useOptionalMediaSession, type MediaSession } from '../media/media-session.js';
import { useInlineImagesAllowed } from '../app/layout.js';
import { usePlainMode } from '../theme/plain-mode.js';

export interface MediaAttachmentsProps {
  attachments: readonly MediaAttachment[];
  /** Cell budget per image. Defaults chosen to read as "a photo", not dominate a
   * timeline row. */
  maxCols?: number;
  maxRows?: number;
  /**
   * Draw the real Kitty image, rather than the §75 description box.
   *
   * **Focused-only in timelines, on purpose.** Kitty images are written straight to
   * `process.stdout` as APC sequences (they cannot go through Ink's text tree), so
   * Ink has no idea they are there: as soon as the list scrolls, the placement stays
   * behind and the frame diff drifts — the owner saw a solid purple block wedged
   * between rows and every row below it shifted by one (2026-08-18, reproduced on
   * v0.1.0-alpha.2). A scrolling virtualized list cannot safely own several
   * placements, so only its selected row mounts a real image; every other row shows
   * the equal-height fallback box. A dedicated full-screen viewer is the other safe
   * inline owner.
   */
  inline?: boolean;
}

const DEFAULT_MAX_COLS = 40;
// Inline and fallback forms deliberately occupy the same three-row cell budget.
// Switching the selected row from a fallback box to a Kitty placement must never
// reflow the list; a height change during an Ink diff is how the live TUI smeared.
const DEFAULT_MAX_ROWS = 3;

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
    return (
      <Box height={maxRows} flexShrink={0} overflow="hidden">
        <InlineImageRow renderer={renderer} image={state.prepared} />
      </Box>
    );
  }
  if (state.status === 'error') {
    return (
      <Box height={maxRows} flexShrink={0} overflow="hidden">
        <FallbackAttachment attachment={attachment} cols={maxCols} />
      </Box>
    );
  }
  const rows = buildFallbackBox(maxCols, 'loading image…');
  return (
    <Box flexDirection="column" height={maxRows} flexShrink={0} overflow="hidden">
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
 * Shared attachment rendering (B-004/P12-018, spec §73–76): Kitty inline images only
 * when the caller explicitly owns a stable placement, the spec §75 fallback box
 * everywhere else. Renders nothing for a post with no attachments.
 */
export function MediaAttachments({
  attachments,
  maxCols = DEFAULT_MAX_COLS,
  maxRows = DEFAULT_MAX_ROWS,
  inline = false,
}: MediaAttachmentsProps): ReactElement | null {
  const plain = usePlainMode();
  const renderer = useOptionalMediaRenderer();
  const session = useOptionalMediaSession();
  const inlineAllowed = useInlineImagesAllowed();

  if (attachments.length === 0) return null;

  const useInline =
    inline &&
    inlineAllowed &&
    !plain &&
    renderer !== undefined &&
    renderer.kind === 'kitty' &&
    session !== undefined;

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
