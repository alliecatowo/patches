import { create } from '@bufbuild/protobuf';
import { timestampFromDate } from '@bufbuild/protobuf/wkt';
import { ActorSchema, type Actor } from '@patches/proto/es';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  getAccount,
  listAccounts,
  removeAccount,
  saveAccount,
  subscribeAccounts,
} from './accounts.js';

function actor(id: string, handle: string): Actor {
  return create(ActorSchema, {
    id,
    handle,
    displayName: handle,
    joinedAt: timestampFromDate(new Date('2026-08-19T12:00:00.000Z')),
  });
}

const tokens = (n: number) => ({ accessToken: `access-${n}`, refreshToken: `refresh-${n}` });

describe('accounts registry', () => {
  beforeEach(() => {
    window.localStorage.clear();
    // Reset the module-level cache so each test starts from an empty read.
    listAccounts();
  });

  it('starts empty', () => {
    expect(listAccounts()).toEqual([]);
  });

  it('saves and lists secret-free summaries', () => {
    saveAccount(actor('a1', 'alice'), tokens(1));
    saveAccount(actor('a2', 'bob'), tokens(2));

    const summaries = listAccounts();
    expect(summaries).toEqual([
      { userId: 'a1', handle: 'alice', displayName: 'alice', avatarUrl: undefined },
      { userId: 'a2', handle: 'bob', displayName: 'bob', avatarUrl: undefined },
    ]);
  });

  it('never exposes tokens through the public listing', () => {
    saveAccount(actor('a1', 'alice'), tokens(1));
    expect(JSON.stringify(listAccounts())).not.toContain('access-1');
    expect(JSON.stringify(listAccounts())).not.toContain('refresh-1');
  });

  it('returns tokens through the account-keyed lookup used for switching', () => {
    saveAccount(actor('a1', 'alice'), tokens(1));
    expect(getAccount('a1')?.tokens).toEqual({
      accessToken: 'access-1',
      refreshToken: 'refresh-1',
    });
    expect(getAccount('missing')).toBeUndefined();
  });

  it('persists an actor carrying bigint-backed timestamps and reads it back', () => {
    saveAccount(actor('a1', 'alice'), tokens(1));
    const restored = getAccount('a1');
    expect(restored?.actor.joinedAt?.seconds).toBe(
      BigInt(Math.floor(Date.UTC(2026, 7, 19, 12, 0, 0) / 1000)),
    );
  });

  it('upserts an existing account by user id rather than duplicating it', () => {
    saveAccount(actor('a1', 'alice'), tokens(1));
    saveAccount(actor('a1', 'alice-new'), tokens(3));
    expect(listAccounts()).toHaveLength(1);
    expect(listAccounts()[0]?.handle).toBe('alice-new');
    expect(getAccount('a1')?.tokens.refreshToken).toBe('refresh-3');
  });

  it('removes an account by user id', () => {
    saveAccount(actor('a1', 'alice'), tokens(1));
    saveAccount(actor('a2', 'bob'), tokens(2));
    removeAccount('a1');
    expect(listAccounts()).toEqual([
      { userId: 'a2', handle: 'bob', displayName: 'bob', avatarUrl: undefined },
    ]);
    expect(getAccount('a1')).toBeUndefined();
  });

  it('notifies subscribers on save and remove', () => {
    const listener = vi.fn();
    const unsubscribe = subscribeAccounts(listener);
    saveAccount(actor('a1', 'alice'), tokens(1));
    expect(listener).toHaveBeenCalledTimes(1);
    removeAccount('a1');
    expect(listener).toHaveBeenCalledTimes(2);
    unsubscribe();
    saveAccount(actor('a2', 'bob'), tokens(2));
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('persists saved accounts across a module reload (fresh read)', async () => {
    saveAccount(actor('a1', 'alice'), tokens(1));
    saveAccount(actor('a2', 'bob'), tokens(2));

    vi.resetModules();
    const fresh = await import('./accounts.js');
    expect(fresh.listAccounts()).toEqual([
      { userId: 'a1', handle: 'alice', displayName: 'alice', avatarUrl: undefined },
      { userId: 'a2', handle: 'bob', displayName: 'bob', avatarUrl: undefined },
    ]);
    expect(fresh.getAccount('a1')?.tokens.refreshToken).toBe('refresh-1');
  });

  it('treats a corrupt stored value as no saved accounts', async () => {
    window.localStorage.setItem('patches.web.accounts./api.v1', 'not-json');
    vi.resetModules();
    const fresh = await import('./accounts.js');
    expect(fresh.listAccounts()).toEqual([]);
  });
});
