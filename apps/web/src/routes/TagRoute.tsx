import type { JSX } from 'react';
import { useParams } from 'react-router-dom';

import { api } from '../api/client.js';
import { PostTimeline } from '../components/PostTimeline.js';

export function TagRoute(): JSX.Element {
  const { tag } = useParams<{ tag: string }>();
  const tagName = tag ?? '';
  return (
    <div>
      <h1 style={{ padding: '1rem 1rem 0' }}>#{tagName}</h1>
      <PostTimeline
        queryKey={['feed', 'tag', tagName]}
        fetchPage={(cursor) => api.feed.listTagFeed({ tag: tagName, cursor, limit: 30 })}
        emptyMessage={`No posts tagged #${tagName} yet.`}
      />
    </div>
  );
}
