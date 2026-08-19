/**
 * `@patches/proto/es` — protobuf-es (Connect) flavoured generated output (ADR 0016 §2).
 *
 * A third, independent codegen family alongside the package root (ts-proto, proto-loader
 * runtime shapes) and `./nest` (the same ts-proto output plus Nest decorators) — kept in its
 * own entry point on purpose, exactly like `./nest` is kept out of the root. The three never
 * meet in one process: `apps/server`'s Connect edge decodes a Connect request into a
 * protobuf-es message here, re-encodes it to protobuf binary, and hands those bytes to the
 * *existing* gRPC server, which parses them with proto-loader/ts-proto as always — nothing
 * downstream of the gRPC boundary ever sees a protobuf-es message instance. `@patches/client`
 * (P10-003) and browser/RN callers are the only intended consumers of this entry point.
 *
 * `export *` is safe across every generated file here (unlike `./nest`, which has to
 * enumerate re-exports to dodge an ambiguous `protobufPackage` collision) because
 * protoc-gen-es doesn't emit a package-level constant per file — only per-file `file_...`,
 * per-message `{Name}`/`{Name}Schema`, and per-service `{Name}` consts, none of which collide
 * across this schema's `.proto` files.
 */
export * from './generated-es/patches/v1/common_pb.js';
export * from './generated-es/patches/v1/system_pb.js';
export * from './generated-es/patches/v1/auth_pb.js';
export * from './generated-es/patches/v1/actors_pb.js';
export * from './generated-es/patches/v1/communities_pb.js';
export * from './generated-es/patches/v1/posts_pb.js';
export * from './generated-es/patches/v1/feeds_pb.js';
export * from './generated-es/patches/v1/social_graph_pb.js';
export * from './generated-es/patches/v1/node_pb.js';
export * from './generated-es/patches/v1/reactions_pb.js';
export * from './generated-es/patches/v1/notifications_pb.js';
export * from './generated-es/patches/v1/moderation_pb.js';
export * from './generated-es/patches/v1/media_pb.js';
export * from './generated-es/patches/v1/pages_pb.js';
export * from './generated-es/patches/v1/messages_pb.js';
export * from './generated-es/patches/v1/tags_pb.js';

import { file_patches_v1_actors } from './generated-es/patches/v1/actors_pb.js';
import { file_patches_v1_auth } from './generated-es/patches/v1/auth_pb.js';
import { file_patches_v1_common } from './generated-es/patches/v1/common_pb.js';
import { file_patches_v1_communities } from './generated-es/patches/v1/communities_pb.js';
import { file_patches_v1_feeds } from './generated-es/patches/v1/feeds_pb.js';
import { file_patches_v1_media } from './generated-es/patches/v1/media_pb.js';
import { file_patches_v1_messages } from './generated-es/patches/v1/messages_pb.js';
import { file_patches_v1_moderation } from './generated-es/patches/v1/moderation_pb.js';
import { file_patches_v1_node } from './generated-es/patches/v1/node_pb.js';
import { file_patches_v1_notifications } from './generated-es/patches/v1/notifications_pb.js';
import { file_patches_v1_pages } from './generated-es/patches/v1/pages_pb.js';
import { file_patches_v1_posts } from './generated-es/patches/v1/posts_pb.js';
import { file_patches_v1_reactions } from './generated-es/patches/v1/reactions_pb.js';
import { file_patches_v1_social_graph } from './generated-es/patches/v1/social_graph_pb.js';
import { file_patches_v1_system } from './generated-es/patches/v1/system_pb.js';
import { file_patches_v1_tags } from './generated-es/patches/v1/tags_pb.js';
import { type GenFile } from '@bufbuild/protobuf/codegenv2';

/**
 * Every generated `patches.v1` file, `common.proto` included (it declares no service but its
 * messages are `import`ed by the others — listing it is harmless, `DescFile.services` is just
 * empty for it). The Connect edge (`apps/server/src/transport/connect/`) walks
 * `.services` on each of these to register every RPC generically, so this list — not any
 * one entry — is what "every service is exposed" actually means; a `.proto` file left out of
 * it silently never reaches Connect clients. protoc-gen-es emits no barrel/index of its own
 * (verified `docs/research/connect-es.md` §2), so this array is hand-maintained: add the new
 * `file_...` import + array entry here whenever a `.proto` file is added to `proto/patches/v1/`.
 */
export const PATCHES_V1_FILES: readonly GenFile[] = Object.freeze([
  file_patches_v1_common,
  file_patches_v1_system,
  file_patches_v1_auth,
  file_patches_v1_actors,
  file_patches_v1_communities,
  file_patches_v1_posts,
  file_patches_v1_feeds,
  file_patches_v1_social_graph,
  file_patches_v1_node,
  file_patches_v1_reactions,
  file_patches_v1_notifications,
  file_patches_v1_moderation,
  file_patches_v1_media,
  file_patches_v1_pages,
  file_patches_v1_messages,
  file_patches_v1_tags,
]);
