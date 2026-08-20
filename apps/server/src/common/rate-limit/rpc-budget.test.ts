import { describe, expect, it } from 'vitest';

import { classifyRpc, ConcurrencyGate, RpcBudgetLimiter } from './rpc-budget.js';

describe('classifyRpc (S-001/S-002)', () => {
  it('classifies Get*/List*/Stream* as read', () => {
    expect(classifyRpc('patches.v1.PostService/GetPost')).toBe('read');
    expect(classifyRpc('patches.v1.FeedService/ListHomeFeed')).toBe('read');
    expect(classifyRpc('patches.v1.SomeService/StreamThing')).toBe('read');
  });

  it('classifies SearchPosts as its own, tighter search class', () => {
    expect(classifyRpc('patches.v1.PostService/SearchPosts')).toBe('search');
  });

  it('classifies everything else as write', () => {
    expect(classifyRpc('patches.v1.PostService/CreatePost')).toBe('write');
    expect(classifyRpc('patches.v1.GraphService/FollowActor')).toBe('write');
    expect(classifyRpc('patches.v1.MessageService/SendMessage')).toBe('write');
  });

  it('handles the Controller/handler fallback shape the same way', () => {
    expect(classifyRpc('PostController/getPost')).toBe('write'); // lowercase handler name
    expect(classifyRpc('PostController/GetPost')).toBe('read');
  });
});

describe('RpcBudgetLimiter (S-001)', () => {
  it('allows every call at or below the limit within the window', () => {
    const limiter = new RpcBudgetLimiter({ limit: 3, windowMs: 60_000 });
    const now = 1_000;
    expect(limiter.tryConsume('peer-1', now)).toBe(true);
    expect(limiter.tryConsume('peer-1', now)).toBe(true);
    expect(limiter.tryConsume('peer-1', now)).toBe(true);
  });

  it('rejects the call that would exceed the limit', () => {
    const limiter = new RpcBudgetLimiter({ limit: 2, windowMs: 60_000 });
    const now = 1_000;
    expect(limiter.tryConsume('peer-1', now)).toBe(true);
    expect(limiter.tryConsume('peer-1', now)).toBe(true);
    expect(limiter.tryConsume('peer-1', now)).toBe(false);
  });

  it('never lets one key exhaust another key’s budget', () => {
    const limiter = new RpcBudgetLimiter({ limit: 1, windowMs: 60_000 });
    const now = 1_000;
    expect(limiter.tryConsume('peer-1', now)).toBe(true);
    expect(limiter.tryConsume('peer-2', now)).toBe(true);
  });

  it('resets once the window elapses', () => {
    const limiter = new RpcBudgetLimiter({ limit: 1, windowMs: 1_000 });
    expect(limiter.tryConsume('peer-1', 0)).toBe(true);
    expect(limiter.tryConsume('peer-1', 500)).toBe(false);
    expect(limiter.tryConsume('peer-1', 1_001)).toBe(true);
  });
});

describe('ConcurrencyGate (S-002 load-shedding)', () => {
  it('admits up to the limit, then sheds', () => {
    const gate = new ConcurrencyGate(2);
    expect(gate.tryAcquire()).toBe(true);
    expect(gate.tryAcquire()).toBe(true);
    expect(gate.tryAcquire()).toBe(false);
  });

  it('frees a slot on release', () => {
    const gate = new ConcurrencyGate(1);
    expect(gate.tryAcquire()).toBe(true);
    expect(gate.tryAcquire()).toBe(false);
    gate.release();
    expect(gate.tryAcquire()).toBe(true);
  });

  it('never goes negative on an unmatched release', () => {
    const gate = new ConcurrencyGate(1);
    gate.release();
    gate.release();
    expect(gate.current).toBe(0);
    expect(gate.tryAcquire()).toBe(true);
    expect(gate.tryAcquire()).toBe(false);
  });
});
