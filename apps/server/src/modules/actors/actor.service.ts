import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { Actor, Post } from '@patches/database';
import { IsNull, type DataSource } from 'typeorm';

import { AppError } from '../../common/errors/app-error.js';
import { normalizeHandle } from '../auth/validation.js';
import { toActorProfile, type ActorCountsSummary, type ActorProfile } from './actor.dto.js';
import {
  bioSchema,
  displayNameSchema,
  locationTextSchema,
  parseInput,
  uuidInputSchema,
  websiteUrlSchema,
} from './validation.js';

/**
 * The application service behind `patches.v1.ActorService` (spec §19, §21, §49).
 *
 * `followers`/`following` are hard-coded to `0` until `SocialGraphService` (Phase 3) exists
 * to compute them — not a placeholder left to rot, but the honest answer for a node that has
 * no follow relationships to count yet.
 */

export interface UpdateProfileInput {
  actorId: string;
  displayName?: string;
  bio?: string;
  locationText?: string;
  websiteUrl?: string;
  /** Proto field names (snake_case), e.g. `["display_name", "bio"]`; only these are applied. */
  updateMask: readonly string[];
}

@Injectable()
export class ActorService {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async getActor(id: string): Promise<ActorProfile> {
    const parsed = parseInput(uuidInputSchema, id);
    const actor = await this.dataSource.getRepository(Actor).findOne({ where: { id: parsed } });
    if (actor === null || actor.deletedAt !== null) throw actorNotFound();
    return toActorProfile(actor, await this.countsFor(actor.id));
  }

  async getActorByHandle(handle: string): Promise<ActorProfile> {
    const handleNormalized = normalizeHandle(handle);
    const actor = await this.dataSource
      .getRepository(Actor)
      .findOne({ where: { handleNormalized } });
    if (actor === null || actor.deletedAt !== null) throw actorNotFound();
    return toActorProfile(actor, await this.countsFor(actor.id));
  }

  /** Partial update of the caller's own profile, driven by `update_mask` (spec: `actors.proto`'s
   * `UpdateProfileRequest` doc). A field not named in the mask is left untouched even if set on
   * the request — that is the whole point of a `FieldMask` over plain optional fields. */
  async updateProfile(input: UpdateProfileInput): Promise<ActorProfile> {
    const paths = new Set(input.updateMask);
    const patch: Partial<Pick<Actor, 'displayName' | 'bio' | 'locationText' | 'websiteUrl'>> = {};

    if (paths.has('display_name')) {
      const value = parseInput(displayNameSchema, input.displayName ?? '');
      patch.displayName = value.length === 0 ? null : value;
    }
    if (paths.has('bio')) {
      const value = parseInput(bioSchema, input.bio ?? '');
      patch.bio = value.length === 0 ? null : value;
    }
    if (paths.has('location_text')) {
      const value = parseInput(locationTextSchema, input.locationText ?? '');
      patch.locationText = value.length === 0 ? null : value;
    }
    if (paths.has('website_url')) {
      const raw = (input.websiteUrl ?? '').trim();
      patch.websiteUrl = raw.length === 0 ? null : parseInput(websiteUrlSchema, raw);
    }

    return this.dataSource.transaction(async (manager) => {
      const actors = manager.getRepository(Actor);
      const actor = await actors.findOne({ where: { id: input.actorId } });
      if (actor === null || actor.deletedAt !== null) throw actorNotFound();

      if (Object.keys(patch).length > 0) {
        await actors.update({ id: actor.id }, patch);
      }

      const updated = await actors.findOneOrFail({ where: { id: actor.id } });
      return toActorProfile(updated, await this.countsFor(updated.id, manager.getRepository(Post)));
    });
  }

  // ---------------------------------------------------------------- internals

  private async countsFor(
    actorId: string,
    posts = this.dataSource.getRepository(Post),
  ): Promise<ActorCountsSummary> {
    const postCount = await posts.countBy({ authorActorId: actorId, deletedAt: IsNull() });
    // Social graph counts land with `SocialGraphService` (Phase 3, spec §50) — a clearly
    // named seam rather than an invented follow model.
    return { followers: 0, following: 0, posts: postCount };
  }
}

function actorNotFound(): AppError {
  return new AppError('ACTOR_NOT_FOUND', 'That actor does not exist.');
}
