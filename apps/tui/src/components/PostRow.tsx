import { present } from '../api/present.js';
import { timestampToDate, type Post } from '@patches/proto';
import { Box, Text } from 'ink';
import type { ReactElement } from 'react';

import { formatRelativeTime } from '../format/relative-time.js';
import { RichBody } from '../format/rich-text.js';
import { sanitizeForTerminal } from '../format/sanitize.js';
import { theme } from '../theme/index.js';
import { MediaAttachments } from './MediaAttachments.js';
import { Nameplate } from './Nameplate.js';

export interface PostRowProps {
  post: Post;
  /** Highlights the row when it is the list's current selection. */
  selected?: boolean;
  /** Reveals `post.content_warning`-gated content — off by default (B-018/P3-003). */
  revealed?: boolean;
  /** Columns this row may use. Single-line rows are hard-clipped to it and the body
   * wraps inside it, so the row's height always matches what
   * `measurePostRowHeight` predicted — an unmeasured soft-wrap is what corrupts
   * Ink's frame diff (see `format/measure.ts`). */
  width?: number;
}

/**
 * One post in a timeline: author, relative time, body.
 *
 * `wrap="wrap"` (Ink's default) is used deliberately, never `"truncate"` — a
 * truncated line silently drops text a reader never asked to lose, and (per
 * `.claude/rules/tui.md`) `"truncate"` corrupts Kitty placeholder rows once
 * images share this component (spec §73–76).
 */
export function PostRow({
  post,
  selected = false,
  revealed = false,
  width,
}: PostRowProps): ReactElement {
  const createdAt = timestampToDate(post.createdAt);
  const when = present(createdAt) ? formatRelativeTime(createdAt) : '';
  const handle = post.author?.handle ?? post.author?.id ?? 'unknown';
  const hasWarning = !post.deleted && post.contentWarning !== '';
  const bodyText = post.body === '' ? post.linkUrl : post.body;

  return (
    <Box flexDirection="column" flexShrink={0} marginBottom={1} width={width} overflow="hidden">
      <Box overflow="hidden" flexShrink={0} height={1}>
        <Nameplate
          handle={handle}
          nameplate={post.author?.nameplate ?? undefined}
          bold={selected}
          fallbackColor={selected ? theme.accent : undefined}
        />
        {when === '' ? null : <Text color={theme.muted}> · {when}</Text>}
      </Box>
      {post.deleted ? (
        <Text color={theme.muted}>[deleted]</Text>
      ) : hasWarning && !revealed ? (
        <Text color={theme.warn} wrap="truncate-end">
          ⚠ {sanitizeForTerminal(post.contentWarning)} — press v to reveal
        </Text>
      ) : (
        <>
          {hasWarning ? (
            <Text color={theme.warn} wrap="truncate-end">
              ⚠ {sanitizeForTerminal(post.contentWarning)}
            </Text>
          ) : null}
          <RichBody text={bodyText} />
          <MediaAttachments
            attachments={post.media}
            maxCols={Math.min(40, Math.max(12, (width ?? 40) - 2))}
          />
        </>
      )}
      {present(post.counts) ? (
        <Text
          wrap="truncate-end"
          color={present(post.viewerState) && post.viewerState.liked ? theme.accent : theme.muted}
        >
          {present(post.viewerState) && post.viewerState.liked ? '♥' : '♡'} {post.counts.likes} ·{' '}
          {post.counts.replies} {post.counts.replies === 1 ? 'reply' : 'replies'}
          {present(post.viewerState) && post.viewerState.bookmarked ? ' · ★ bookmarked' : ''}
        </Text>
      ) : null}
    </Box>
  );
}
