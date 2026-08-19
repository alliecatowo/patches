import { dateToTimestamp } from '@patches/proto';
import type {
  FollowRequest as ProtoFollowRequest,
  Relationship as ProtoRelationship,
} from '@patches/proto';
import { FollowState } from '@patches/proto/nest';

import { toProtoActor } from '../actors/actor.mapper.js';
import type { FollowRequestView, RelationshipView } from './graph.dto.js';

const STATE_TO_PROTO: Readonly<Record<RelationshipView['state'], FollowState>> = Object.freeze({
  NONE: FollowState.FOLLOW_STATE_NONE,
  PENDING: FollowState.FOLLOW_STATE_PENDING,
  FOLLOWING: FollowState.FOLLOW_STATE_FOLLOWING,
});

/** Application DTO → protobuf message (spec §128), field-by-field. */
export function toProtoRelationship(view: RelationshipView): ProtoRelationship {
  return {
    state: STATE_TO_PROTO[view.state],
    followedBy: view.followedBy,
    blocking: view.blocking,
    muting: view.muting,
    requested: view.requested,
    requestedBy: view.requestedBy,
  };
}

/** §197.5. */
export function toProtoFollowRequest(view: FollowRequestView): ProtoFollowRequest {
  return {
    actor: toProtoActor(view.actor),
    createdAt: dateToTimestamp(view.createdAt),
  };
}
