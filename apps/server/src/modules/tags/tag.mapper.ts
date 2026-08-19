import { dateToTimestamp } from '@patches/proto';
import type { Tag as ProtoTag } from '@patches/proto';

import type { TagView } from './tag.dto.js';

/** Application DTO → protobuf message (spec §128), field-by-field. */
export function toProtoTag(view: TagView): ProtoTag {
  return {
    id: view.id,
    name: view.name,
    displayName: view.displayName,
    createdAt: dateToTimestamp(view.createdAt),
  };
}
