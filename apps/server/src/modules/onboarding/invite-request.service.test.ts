import { describe, expect, it, vi } from 'vitest';

import { isAppError } from '../../common/errors/app-error.js';
import {
  cleanMessage,
  InviteRequestService,
  MAX_PENDING_INVITE_REQUESTS,
} from './invite-request.service.js';

function build(pending = 0, count = 1) {
  const execute = vi.fn().mockResolvedValue({});
  const values = vi.fn().mockReturnValue({ orIgnore: () => ({ execute }) });
  const repository = {
    count: vi.fn().mockResolvedValue(pending),
    createQueryBuilder: () => ({ insert: () => ({ values }) }),
  };
  const store = { increment: vi.fn().mockResolvedValue(count) };
  const service = new InviteRequestService(
    { getRepository: () => repository } as never,
    store as never,
  );
  return { service, values, execute, store, repository };
}

async function codeOf(promise: Promise<unknown>): Promise<string | undefined> {
  try {
    await promise;
  } catch (error) {
    return isAppError(error) ? error.code : 'NOT_AN_APP_ERROR';
  }
  return undefined;
}

describe('cleanMessage', () => {
  it('drops control, bidi and zero-width characters and flattens whitespace', () => {
    expect(cleanMessage('hi\u001b[31m there\u202e\nline\u200b2')).toBe('hi[31m there line2');
  });
  it('is null when nothing is left and caps at 500 characters', () => {
    expect(cleanMessage('  \u200b \n')).toBeNull();
    expect(cleanMessage('x'.repeat(900))?.length).toBe(500);
  });
});

describe('InviteRequestService', () => {
  it('stores a normalized request without any raw address', async () => {
    const { service, values } = build();
    await service.request(' Me@Example.TEST ', ' hello ');
    const row = values.mock.calls[0]?.[0] as Record<string, string>;
    expect(row['contact']).toBe('Me@Example.TEST');
    expect(row['contactNormalized']).toBe('me@example.test');
    expect(row['message']).toBe('hello');
    expect(row['peerHash']).toMatch(/^[0-9a-f]{64}$/);
  });

  it('rejects a non-email before touching the database or the rate limiter', async () => {
    const { service, store, repository } = build();
    expect(await codeOf(service.request('not an email', ''))).toBe('VALIDATION_ERROR');
    expect(store.increment).not.toHaveBeenCalled();
    expect(repository.count).not.toHaveBeenCalled();
  });

  it('rate-limits per peer', async () => {
    const { service, execute } = build(0, 6);
    expect(await codeOf(service.request('a@example.test', ''))).toBe('RATE_LIMITED');
    expect(execute).not.toHaveBeenCalled();
  });

  it('stops accepting when the pending list is full', async () => {
    const { service, execute } = build(MAX_PENDING_INVITE_REQUESTS);
    expect(await codeOf(service.request('a@example.test', ''))).toBe('SERVICE_UNAVAILABLE');
    expect(execute).not.toHaveBeenCalled();
  });
});
