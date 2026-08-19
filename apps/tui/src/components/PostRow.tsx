import { present } from '../api/present.js';
import { timestampToDate, type Post } from '@patches/proto';
import { Box, Text } from 'ink';
import type { ReactElement } from 'react';

import { formatRelativeTime } from '../format/relative-time.js';
import { RichBody } from '../format/rich-text.js';
import { sanitizeForTerminal } from '../format/sanitize.js';
import { theme } from '../theme/index.js';
import { usePlainMode } from '../theme/plain-mode.js';
import { MediaAttachments } from './MediaAttachments.js';
import { Nameplate } from './Nameplate.js';
import { BODY_INDENT_COLS, measurePostBody } from './post-height.js';

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
  /** Expands a body beyond the default measured eight-row preview. */
  expanded?: boolean;
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
  expanded = false,
}: PostRowProps): ReactElement {
  const plain = usePlainMode();
  const createdAt = timestampToDate(post.createdAt);
  const when = present(createdAt) ? formatRelativeTime(createdAt) : '';
  const handle = post.author?.handle ?? post.author?.id ?? 'unknown';
  const hasWarning = !post.deleted && post.contentWarning !== '';
  const bodyText = post.body === '' ? post.linkUrl : post.body;
  const bodyWidth = Math.max(1, (width ?? 40) - BODY_INDENT_COLS);
  const quoted = present(post.quotedPost) ? post.quotedPost : undefined;
  const repostHandles = post.repostedBy
    .map((actor) => actor.handle || actor.id)
    .filter((value) => value !== '');
  const remainingReposters = Math.max(0, post.repostedByTotal - repostHandles.length);
  const repostAttribution =
    repostHandles.length === 0
      ? ''
      : `↻ ${repostHandles.map((value) => `@${value}`).join(', ')}${remainingReposters > 0 ? ` +${String(remainingReposters)}` : ''} reposted`;
  // The viewer's actual mode (P12-128): rich and quiet wrap identically (quiet only
  // hides *other* actors' cosmetics, never the body's own layout), only plain mode
  // reflows the source markers, so measuring anything but the mode about to draw is
  // what reserves rows a decorated body never fills, or under-counts a plain one.
  const bodyMeasurement = measurePostBody(post, width ?? 40, expanded, plain);

  return (
    <Box flexDirection="column" flexShrink={0} marginBottom={1} width={width} overflow="hidden">
      {repostAttribution === '' ? null : (
        <Text color={theme.muted} wrap="truncate-end">
          {repostAttribution}
        </Text>
      )}
      <Box overflow="hidden" flexShrink={0} height={1}>
        {/* Rich mode marks the selected row with bold + accent alone; plain mode
            can't rely on colour reaching the terminal, so it gets its own `> `
            gutter instead (spec table §2.7) — never both, never neither. */}
        {plain ? <Text>{selected ? '> ' : '  '}</Text> : null}
        <Nameplate
          handle={handle}
          nameplate={post.author?.nameplate ?? undefined}
          bold={selected}
          fallbackColor={selected ? theme.accent : undefined}
        />
        {present(post.community) ? (
          <Text color={theme.accent}> · c/{sanitizeForTerminal(post.community.name)}</Text>
        ) : null}
        {when === '' ? null : <Text color={theme.muted}> · {when}</Text>}
        {present(post.editedAt) ? <Text color={theme.muted}> · edited</Text> : null}
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
          <Box
            flexDirection="column"
            height={bodyMeasurement.rows}
            flexShrink={0}
            marginLeft={BODY_INDENT_COLS}
            overflow="hidden"
          >
            <RichBody text={bodyText} width={bodyWidth} maxRows={bodyMeasurement.rows} />
          </Box>
          {bodyMeasurement.folded ? <Text color={theme.muted}>… press v to expand</Text> : null}
          <MediaAttachments
            attachments={post.media}
            maxCols={Math.min(40, Math.max(12, (width ?? 40) - 2))}
            inline={selected}
          />
          {quoted === undefined ? null : <QuotedPost post={quoted} />}
        </>
      )}
      {present(post.counts) ? (
        <Text
          wrap="truncate-end"
          color={present(post.viewerState) && post.viewerState.liked ? theme.accent : theme.muted}
        >
          {present(post.viewerState) && post.viewerState.liked ? '♥' : '♡'} {post.counts.likes} ·{' '}
          {post.counts.replies} {post.counts.replies === 1 ? 'reply' : 'replies'}
          {post.counts.reposts > 0 ? ` · ↻ ${String(post.counts.reposts)}` : ''}
          {post.counts.quotes > 0 ? ` · ❝ ${String(post.counts.quotes)}` : ''}
          {present(post.viewerState) && post.viewerState.reposted ? ' · reposted' : ''}
          {present(post.viewerState) && post.viewerState.bookmarked ? ' · ★ bookmarked' : ''}
        </Text>
      ) : null}
    </Box>
  );
}

/** A quote is a pointer preview, never a recursively rendered post. Keeping it to
 * three measured rows makes deeply nested quote chains impossible and keeps a
 * timeline resize from changing navigation state (spec §180/§188). */
function QuotedPost({ post }: { post: Post }): ReactElement {
  const handle = post.author?.handle ?? post.author?.id ?? 'unknown';
  const body = post.deleted ? '[deleted]' : post.body === '' ? post.linkUrl : post.body;
  return (
    <Box flexDirection="column" height={3} flexShrink={0} overflow="hidden" marginTop={1}>
      <Text color={theme.muted} wrap="truncate-end">
        ┌ quoted @{sanitizeForTerminal(handle)}
      </Text>
      <Text wrap="truncate-end">│ {sanitizeForTerminal(body)}</Text>
      <Text color={theme.muted}>└ Enter opens the thread</Text>
    </Box>
  );
}
