import { timestampToDate, type Post } from '@patches/proto';
import { Box, Text } from 'ink';
import type { ReactElement } from 'react';

import { formatRelativeTime } from '../format/relative-time.js';
import { theme } from '../theme/index.js';

export interface PostRowProps {
  post: Post;
  /** Highlights the row when it is the list's current selection. */
  selected?: boolean;
}

/**
 * One post in a timeline: author, relative time, body.
 *
 * `wrap="wrap"` (Ink's default) is used deliberately, never `"truncate"` — a
 * truncated line silently drops text a reader never asked to lose, and (per
 * `.claude/rules/tui.md`) `"truncate"` corrupts Kitty placeholder rows once
 * images share this component (spec §73–76). There is no `content_warning`
 * field on `Post` yet (proto is owned by another workstream in this change),
 * so there is nothing to collapse here — see the implementer report.
 */
export function PostRow({ post, selected = false }: PostRowProps): ReactElement {
  const createdAt = timestampToDate(post.createdAt);
  const when = createdAt === undefined ? '' : formatRelativeTime(createdAt);
  const handle = post.author?.handle ?? post.author?.id ?? 'unknown';

  return (
    <Box flexDirection="column" marginBottom={1}>
      <Box>
        <Text color={selected ? theme.accent : theme.text} bold={selected}>
          @{handle}
        </Text>
        {when === '' ? null : <Text color={theme.muted}> · {when}</Text>}
      </Box>
      {post.deleted ? (
        <Text color={theme.muted}>[deleted]</Text>
      ) : (
        <Text wrap="wrap">{post.body === '' ? post.linkUrl : post.body}</Text>
      )}
      {post.counts === undefined ? null : (
        <Text color={theme.muted}>
          ♥ {post.counts.likes} · {post.counts.replies}{' '}
          {post.counts.replies === 1 ? 'reply' : 'replies'}
        </Text>
      )}
    </Box>
  );
}
