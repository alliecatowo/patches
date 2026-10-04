import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type * as DemoMode from './demo-mode.js';

const STATE_KEY = 'patches.web.demo.v1';
const ACTOR_KEY = 'patches.web.actor.v1';
const DEMO_BASE = 'https://demo.example.test';
const CREDENTIAL_KEY = `patches.web.credentials.${DEMO_BASE}.v1`;

async function loadModule(demoBase: string | undefined): Promise<typeof DemoMode> {
  vi.resetModules();
  vi.stubEnv('VITE_PATCHES_DEMO_API_BASE', demoBase ?? '');
  vi.stubEnv('VITE_PATCHES_API_BASE', 'https://primary.example.test');
  return import('./demo-mode.js');
}

describe('demo-mode', () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('talks to the primary node when there is no sandbox', async () => {
    const mod = await loadModule(DEMO_BASE);
    expect(mod.DEMO_ACTIVE).toBe(false);
    expect(mod.ACTIVE_API_BASE).toBe('https://primary.example.test');
  });

  it('talks to the demo node while a sandbox is live', async () => {
    window.localStorage.setItem(STATE_KEY, JSON.stringify({ expiresAtMs: Date.now() + 60_000 }));
    const mod = await loadModule(DEMO_BASE);
    expect(mod.DEMO_ACTIVE).toBe(true);
    expect(mod.ACTIVE_API_BASE).toBe(DEMO_BASE);
  });

  it('never activates in a build without a demo node', async () => {
    window.localStorage.setItem(STATE_KEY, JSON.stringify({ expiresAtMs: Date.now() + 60_000 }));
    const mod = await loadModule(undefined);
    expect(mod.DEMO_API_BASE).toBeUndefined();
    expect(mod.DEMO_ACTIVE).toBe(false);
  });

  it('drops an expired sandbox, its tokens and its cached actor at load', async () => {
    window.localStorage.setItem(STATE_KEY, JSON.stringify({ expiresAtMs: Date.now() - 1 }));
    window.localStorage.setItem(ACTOR_KEY, '{"actor":{}}');
    window.localStorage.setItem(CREDENTIAL_KEY, '{"accessToken":"a","refreshToken":"r"}');
    window.localStorage.setItem('patches.web.theme.v1', 'dark');
    const mod = await loadModule(DEMO_BASE);
    expect(mod.DEMO_ACTIVE).toBe(false);
    expect(window.localStorage.getItem(STATE_KEY)).toBeNull();
    expect(window.localStorage.getItem(ACTOR_KEY)).toBeNull();
    expect(window.localStorage.getItem(CREDENTIAL_KEY)).toBeNull();
    // Unrelated preferences stay.
    expect(window.localStorage.getItem('patches.web.theme.v1')).toBe('dark');
  });

  it('treats a corrupt state value as no sandbox', async () => {
    window.localStorage.setItem(STATE_KEY, 'not json');
    const mod = await loadModule(DEMO_BASE);
    expect(mod.DEMO_ACTIVE).toBe(false);
    expect(mod.activeDemo()).toBeUndefined();
  });

  it('round-trips the seed plan through sessionStorage and clears it', async () => {
    const mod = await loadModule(DEMO_BASE);
    const plan = {
      visitorActorId: 'v1',
      friends: [
        { key: 'maya', actorId: 'f1', handle: 'maya_x', displayName: 'Maya', accessToken: 't' },
      ],
    };
    mod.saveSeedPlan(plan);
    expect(mod.loadSeedPlan()).toEqual(plan);
    mod.clearSeedPlan();
    expect(mod.loadSeedPlan()).toBeUndefined();
  });

  it('clearDemoLocalState removes the seed plan too', async () => {
    const mod = await loadModule(DEMO_BASE);
    mod.markDemoActive(Date.now() + 1000);
    mod.saveSeedPlan({ visitorActorId: 'v1', friends: [] });
    mod.clearDemoLocalState();
    expect(window.localStorage.getItem(STATE_KEY)).toBeNull();
    expect(mod.loadSeedPlan()).toBeUndefined();
  });
});
