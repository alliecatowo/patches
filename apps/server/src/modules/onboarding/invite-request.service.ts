import { createHash } from 'node:crypto';

import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { InviteRequest } from '@patches/database';
import { type DataSource, IsNull } from 'typeorm';
import { z } from 'zod';

import { getRequestContext } from '../../common/context/request-context.js';
import { AppError } from '../../common/errors/app-error.js';
import { enforceWindowPeerRateLimit } from '../../common/rate-limit/window-rate-limiter.js';
import { DbRateLimitStore } from '../auth/db-rate-limit-store.service.js';
import { peerBucket } from './peer-bucket.js';

const HOUR_MS = 60 * 60_000;
const PER_PEER_PER_HOUR = 5;
/** Pending requests the table will hold; beyond this a flood gets a polite refusal instead of
 * growing the database without bound. The operator clears the list with `invite-requests handle`. */
export const MAX_PENDING_INVITE_REQUESTS = 500;
export const INVITE_MESSAGE_MAX_CHARS = 500;

const contactSchema = z.string().trim().max(254).pipe(z.email());

/** Control characters (C0/C1, DEL), bidi overrides and zero-width characters: nothing an
 * operator reading this in a terminal should have to trust. Newlines and tabs survive as spaces. */
const UNSAFE_TEXT =
  // eslint-disable-next-line no-control-regex -- stripping control characters is the point
  /[\u0000-\u0008\u000b-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2066-\u2069\ufeff]/g;

export function cleanMessage(raw: string): string | null {
  const cleaned = raw
    .replace(/[\t\r\n]+/g, ' ')
    .replace(UNSAFE_TEXT, '')
    .trim();
  if (cleaned.length === 0) return null;
  return cleaned.slice(0, INVITE_MESSAGE_MAX_CHARS);
}

/**
 * `OnboardingService.RequestInvite` (ADR 0044): writes one row for the operator to read. It is
 * unauthenticated, so it is deliberately inert: no account, no email, no outbound call, a
 * per-peer rate limit, one pending row per address, a global pending cap, and an identical
 * answer for a duplicate so it cannot be used to probe which addresses already asked.
 */
@Injectable()
export class InviteRequestService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly rateLimitStore: DbRateLimitStore,
  ) {}

  async request(rawContact: string, rawMessage: string, now: Date = new Date()): Promise<void> {
    const parsed = contactSchema.safeParse(rawContact);
    if (!parsed.success) throw AppError.validation('That does not look like an email address.');
    const contact = parsed.data;

    const bucket = peerBucket(getRequestContext()?.peer);
    await enforceWindowPeerRateLimit(
      this.rateLimitStore,
      'invite_request',
      bucket,
      PER_PEER_PER_HOUR,
      HOUR_MS,
      now,
    );

    const repository = this.dataSource.getRepository(InviteRequest);
    const pending = await repository.count({ where: { handledAt: IsNull() } });
    if (pending >= MAX_PENDING_INVITE_REQUESTS) {
      throw new AppError(
        'SERVICE_UNAVAILABLE',
        'Invite requests are paused for now. Please try again later.',
      );
    }

    // ON CONFLICT DO NOTHING on the partial unique index: a repeat from the same address is a
    // silent success, indistinguishable from the first.
    await repository
      .createQueryBuilder()
      .insert()
      .values({
        contact,
        contactNormalized: contact.toLowerCase(),
        message: cleanMessage(rawMessage),
        peerHash: createHash('sha256').update(bucket).digest('hex'),
      })
      .orIgnore()
      .execute();
  }
}
