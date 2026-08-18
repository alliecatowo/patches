import { Controller } from '@nestjs/common';
import { Payload } from '@nestjs/microservices';
import {
  type FeedServiceController,
  FeedServiceControllerMethods,
  type ListActorPostsRequest,
  type ListActorPostsResponse,
  type ListHomeFeedRequest,
  type ListHomeFeedResponse,
  type ListLocalFeedRequest,
  type ListLocalFeedResponse,
  type Post as ProtoPost,
} from '@patches/proto/nest';

import { AppError } from '../../common/errors/app-error.js';
import { toProtoPost } from '../posts/post.mapper.js';
import { FeedService, type FeedPage } from './feed.service.js';

/**
 * Transport adapter for `patches.v1.FeedService` — protobuf in, protobuf out, no business
 * logic (spec §128). Every list here is readable anonymously; there is no per-viewer state to
 * gate on yet (likes/bookmarks are zeroed in `PostService`'s mapper until `ReactionService`
 * ships).
 *
 * `ListHomeFeed` needs `SocialGraphService`'s follow relationships (Phase 3, spec §50, §59) to
 * mean anything — a feed that silently degraded to "your own posts" would be inventing
 * semantics the spec never asked for, so it returns `NOT_IMPLEMENTED` instead.
 */
@Controller()
@FeedServiceControllerMethods()
export class FeedController implements FeedServiceController {
  constructor(private readonly feeds: FeedService) {}

  listHomeFeed(@Payload() _request: ListHomeFeedRequest): ListHomeFeedResponse {
    throw new AppError('NOT_IMPLEMENTED', 'ListHomeFeed is not available on this node yet.');
  }

  async listLocalFeed(@Payload() request: ListLocalFeedRequest): Promise<ListLocalFeedResponse> {
    return toResponse(await this.feeds.listLocalFeed(request.cursor, request.limit));
  }

  async listActorPosts(@Payload() request: ListActorPostsRequest): Promise<ListActorPostsResponse> {
    return toResponse(
      await this.feeds.listActorPosts(request.actorId, request.cursor, request.limit),
    );
  }
}

function toResponse(page: FeedPage): {
  posts: ProtoPost[];
  page: { nextCursor: string; hasMore: boolean };
} {
  return {
    posts: page.posts.map(toProtoPost),
    page: { nextCursor: page.nextCursor, hasMore: page.hasMore },
  };
}
