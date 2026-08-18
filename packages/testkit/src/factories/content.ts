import { randomUUID } from 'node:crypto';
import { Post } from '@patches/database';
import type { PostType, PostVisibility } from '@patches/database';
import type { EntityManager } from 'typeorm';

export interface CreateTestPostOptions {
  authorActorId: string;
  body?: string | null;
  postType?: PostType;
  linkUrl?: string | null;
  visibility?: PostVisibility;
  /** Pass a parent post to make this a reply; `rootPostId` is inherited from it. */
  inReplyTo?: Pick<Post, 'id' | 'rootPostId'> | null;
  clientRequestId?: string | null;
  createdAt?: Date;
}

/**
 * A post, or a reply when `inReplyTo` is given (§23–24).
 *
 * The id is generated here rather than by the column default because a root post's
 * `root_post_id` is its own id — the value has to exist before the INSERT, which is exactly
 * what `PostService` will have to do too.
 */
export async function createTestPost(
  manager: EntityManager,
  options: CreateTestPostOptions,
): Promise<Post> {
  const id = randomUUID();
  const posts = manager.getRepository(Post);
  const post = posts.create({
    id,
    authorActorId: options.authorActorId,
    body: options.body === undefined ? `test post ${id}` : options.body,
    postType: options.postType ?? 'NOTE',
    linkUrl: options.linkUrl ?? null,
    visibility: options.visibility ?? 'PUBLIC',
    inReplyToId: options.inReplyTo?.id ?? null,
    rootPostId: options.inReplyTo?.rootPostId ?? id,
    isLocal: true,
    clientRequestId: options.clientRequestId ?? null,
    ...(options.createdAt === undefined ? {} : { createdAt: options.createdAt }),
  });
  return posts.save(post);
}
