import { beforeEach, describe, expect, it, vi } from 'vitest';

import type * as DemoMode from './demo-mode.js';
import type { DemoSeedPlan } from './demo-mode.js';

const createConversation = vi.fn();
const send = vi.fn();
const enroll = vi.fn();
const listConversations = vi.fn();
const wipeVaultStorage = vi.fn();
let friendStatus = 'not-enrolled';

vi.mock('./demo-mode.js', async () => {
  const actual = await vi.importActual<typeof DemoMode>('./demo-mode.js');
  return { ...actual, DEMO_API_BASE: 'https://demo.example.test' };
});
vi.mock('@patches/client', () => ({
  createPatchesApi: () => ({ messages: { listConversations } }),
}));
vi.mock('@patches/client/connect', () => ({ createConnectTransport: () => ({}) }));
vi.mock('../e2ee/vault.js', () => ({ wipeVaultStorage }));
vi.mock('../e2ee/web-e2ee.js', () => {
  const manager = () => ({
    getStatus: () => ({ kind: friendStatus }),
    subscribe: () => () => undefined,
    setActor: vi.fn().mockResolvedValue(undefined),
    enroll,
    createConversation,
    send,
  });
  return {
    webE2ee: () => ({
      getStatus: () => ({ kind: 'enrolled' }),
      subscribe: () => () => undefined,
      enroll: vi.fn().mockResolvedValue({ status: 'enrolled' }),
    }),
    createWebE2eeManager: manager,
  };
});

const { seedDemoInbox, SeedError } = await import('./seed-inbox.js');
const { loadSeedProgress } = await import('./demo-mode.js');

const PLAN: DemoSeedPlan = {
  visitorActorId: 'visitor',
  friends: ['maya', 'jun', 'ines'].map((key) => ({
    key,
    actorId: `${key}-id`,
    handle: `${key}_x`,
    displayName: key,
    accessToken: 't',
  })),
};

describe('seedDemoInbox', () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    vi.clearAllMocks();
    friendStatus = 'enrolled';
    listConversations.mockResolvedValue({ conversations: [] });
    createConversation.mockImplementation((_to: string[], _body: string) =>
      Promise.resolve('c-new'),
    );
    send.mockResolvedValue(undefined);
  });

  it('reports real progress and opens exactly one conversation per friend', async () => {
    createConversation
      .mockResolvedValueOnce('c1')
      .mockResolvedValueOnce('c2')
      .mockResolvedValueOnce('c3');
    const events: string[] = [];
    await seedDemoInbox(PLAN, 'visitor', (e) =>
      events.push(`${e.step}:${String(e.friendsDone)}/${String(e.friendsTotal)}`),
    );
    expect(createConversation).toHaveBeenCalledTimes(3);
    // maya has 3 messages, jun 2, ines 1: first goes through createConversation, the rest send.
    expect(send).toHaveBeenCalledTimes(3);
    expect(events).toEqual([
      'keys:0/3',
      'friends:0/3',
      'friends:1/3',
      'friends:2/3',
      'friends:3/3',
      'ready:3/3',
    ]);
    expect(loadSeedProgress().done).toEqual(['maya', 'jun', 'ines']);
  });

  it('resumes after a reload without opening a second conversation', async () => {
    window.sessionStorage.setItem(
      'patches.web.demo.seed-progress.v1',
      JSON.stringify({
        visitorEnrolled: true,
        done: ['maya'],
        conversations: { jun: { id: 'c-jun', sent: 1 } },
      }),
    );
    await seedDemoInbox(PLAN, 'visitor');
    // maya is skipped; jun resumes at its second message; only ines opens a new conversation.
    expect(createConversation).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith('c-jun', expect.any(String));
  });

  it('adopts a conversation the node already reserved for a friend', async () => {
    listConversations.mockResolvedValue({ conversations: [{ id: 'reserved' }] });
    await seedDemoInbox(PLAN, 'visitor');
    expect(createConversation).not.toHaveBeenCalled();
    expect(send).toHaveBeenCalledWith('reserved', expect.any(String));
  });

  it('fails with the step, keeps progress, and a retry finishes the rest', async () => {
    createConversation.mockResolvedValueOnce('c1');
    send.mockRejectedValueOnce(new Error('boom'));
    await expect(seedDemoInbox(PLAN, 'visitor')).rejects.toBeInstanceOf(SeedError);
    expect(loadSeedProgress().conversations['maya']).toEqual({ id: 'c1', sent: 1 });

    createConversation.mockResolvedValue('c-other');
    await seedDemoInbox(PLAN, 'visitor');
    // maya reuses c1, so only jun and ines open conversations.
    expect(createConversation).toHaveBeenCalledTimes(3);
    expect(loadSeedProgress().done).toEqual(['maya', 'jun', 'ines']);
  });
});
