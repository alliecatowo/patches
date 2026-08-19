import type { JSX } from 'react';

import { api } from '../api/client.js';
import { PostTimeline } from '../components/PostTimeline.js';

export function BookmarksRoute(): JSX.Element {
  return (
    <div>
      <h1 style={{ padding: '1rem 1rem 0' }}>Bookmarks</h1>
      <PostTimeline
        queryKey={['bookmarks']}
        fetchPage={(cursor) => api.reaction.listBookmarks({ cursor, limit: 30 })}
        emptyMessage="Nothing bookmarked yet."
      />
    </div>
  );
}
