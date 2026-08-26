import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * B-153 regression tests: an updated service worker (installed while a page is already
 * controlled) must reload the page once on takeover, while a first-ever install (no
 * previous controller) must not. The module keeps page-lifetime state, so each test
 * re-imports it fresh via `vi.resetModules()`. `registerServiceWorker()` skips dev
 * builds (dev serves no worker), so each test also stubs `import.meta.env.DEV` off.
 */

class FakeServiceWorker extends EventTarget {
  state = 'installing';
}

class FakeRegistration extends EventTarget {
  readonly installing = new FakeServiceWorker();
  controller: object | null = null;
  update = vi.fn().mockResolvedValue(undefined);
}

interface FakeNavigatorServiceWorker extends EventTarget {
  controller: object | null;
  register: (url: string, options: { scope: string }) => Promise<FakeRegistration>;
}

function installFakeServiceWorker(): {
  fake: FakeNavigatorServiceWorker;
  registration: FakeRegistration;
} {
  const registration = new FakeRegistration();
  const fake = Object.assign(new EventTarget(), {
    controller: null as object | null,
    register: vi.fn().mockResolvedValue(registration),
  }) as FakeNavigatorServiceWorker;
  Object.defineProperty(navigator, 'serviceWorker', {
    value: fake,
    configurable: true,
  });
  return { fake, registration };
}

function stubLocationReload(): ReturnType<typeof vi.fn> {
  const reload = vi.fn();
  Object.defineProperty(window, 'location', {
    value: { ...window.location, reload },
    configurable: true,
  });
  return reload;
}

/** The module adds its listener on `window` 'load' when `registerServiceWorker()` runs;
 * capture it so each test can detach its own listener afterwards — otherwise later
 * tests' load dispatches re-run earlier tests' closures against a replaced
 * `navigator.serviceWorker`. */
let capturedLoadHandlers: ((event: Event) => void)[] = [];

async function importFreshAndRegister(): Promise<void> {
  vi.resetModules();
  vi.stubEnv('DEV', false);
  const mod = await import('./serviceWorkerRegistration.js');
  const addSpy = vi.spyOn(window, 'addEventListener');
  try {
    mod.registerServiceWorker();
  } finally {
    capturedLoadHandlers = addSpy.mock.calls
      .filter(([name]) => name === 'load')
      .map(([, handler]) => handler as (event: Event) => void);
    addSpy.mockRestore();
  }
}

afterEach(() => {
  vi.unstubAllEnvs();
  for (const handler of capturedLoadHandlers) window.removeEventListener('load', handler);
  capturedLoadHandlers = [];
  delete (navigator as Partial<Navigator> & { serviceWorker?: unknown }).serviceWorker;
});

describe('registerServiceWorker', () => {
  it('reloads once when an updated worker takes over an already-controlled page', async () => {
    const reload = stubLocationReload();
    const { fake, registration } = installFakeServiceWorker();
    await importFreshAndRegister();
    window.dispatchEvent(new Event('load'));
    await vi.waitFor(() => expect(fake.register).toHaveBeenCalled());

    // A previous deploy's worker controls the page, and a new one finished installing.
    const oldController = { id: 'old' };
    fake.controller = oldController;
    registration.controller = oldController;
    registration.dispatchEvent(new Event('updatefound'));
    registration.installing.state = 'installed';
    registration.installing.dispatchEvent(new Event('statechange'));

    // Takeover happens later (skipWaiting + clients.claim in sw.ts).
    expect(reload).not.toHaveBeenCalled();
    fake.controller = { id: 'new' };
    fake.dispatchEvent(new Event('controllerchange'));
    expect(reload).toHaveBeenCalledOnce();

    // A duplicate controllerchange (or second in-session deploy) must not reload again.
    fake.dispatchEvent(new Event('controllerchange'));
    expect(reload).toHaveBeenCalledOnce();
  });

  it('does not reload when the worker installs with no previous controller (first install)', async () => {
    const reload = stubLocationReload();
    const { fake, registration } = installFakeServiceWorker();
    await importFreshAndRegister();
    window.dispatchEvent(new Event('load'));
    await vi.waitFor(() => expect(fake.register).toHaveBeenCalled());

    registration.dispatchEvent(new Event('updatefound'));
    registration.installing.state = 'installed';
    registration.installing.dispatchEvent(new Event('statechange'));

    // First install: clients.claim() flips controller from null — must stay put.
    fake.controller = { id: 'first' };
    fake.dispatchEvent(new Event('controllerchange'));
    expect(reload).not.toHaveBeenCalled();
  });

  it('does not register when serviceWorker is unsupported', async () => {
    const reload = stubLocationReload();
    // `'serviceWorker' in navigator` must be false: a defined-as-undefined property
    // would still pass the `in` check and crash on `.register`.
    delete (navigator as Partial<Navigator> & { serviceWorker?: unknown }).serviceWorker;
    await expect(importFreshAndRegister()).resolves.toBeUndefined();
    window.dispatchEvent(new Event('load'));
    expect(reload).not.toHaveBeenCalled();
  });

  it('does not register in dev builds (dev serves no service worker)', async () => {
    const reload = stubLocationReload();
    const { fake } = installFakeServiceWorker();
    vi.resetModules();
    vi.stubEnv('DEV', true);
    const mod = await import('./serviceWorkerRegistration.js');
    const addSpy = vi.spyOn(window, 'addEventListener');
    try {
      mod.registerServiceWorker();
    } finally {
      addSpy.mockRestore();
    }
    window.dispatchEvent(new Event('load'));
    expect(fake.register).not.toHaveBeenCalled();
    expect(reload).not.toHaveBeenCalled();
  });

  /** B-202: a single-page app never performs another full navigation after its first
   * load, so nothing else in the browser ever re-checks `/sw.js` for a byte-diff once
   * this tab is open. These pin the proactive `registration.update()` calls that
   * close that gap — see the doc comment on `scheduleProactiveUpdateChecks`. */
  describe('proactive update checks (B-202)', () => {
    function stubVisibility(state: DocumentVisibilityState): void {
      Object.defineProperty(document, 'visibilityState', {
        value: state,
        configurable: true,
      });
    }

    afterEach(() => {
      vi.useRealTimers();
    });

    it('checks for an update when the tab regains visibility', async () => {
      stubLocationReload();
      const { registration } = installFakeServiceWorker();
      await importFreshAndRegister();
      window.dispatchEvent(new Event('load'));
      await vi.waitFor(() => expect(registration.update).toHaveBeenCalledTimes(1));

      stubVisibility('hidden');
      document.dispatchEvent(new Event('visibilitychange'));
      expect(registration.update).toHaveBeenCalledTimes(1);

      stubVisibility('visible');
      document.dispatchEvent(new Event('visibilitychange'));
      expect(registration.update).toHaveBeenCalledTimes(2);
    });

    it('re-checks on a coarse interval while the tab stays visible, not while hidden', async () => {
      stubLocationReload();
      const { registration } = installFakeServiceWorker();
      stubVisibility('visible');
      vi.useFakeTimers();
      try {
        await importFreshAndRegister();
        window.dispatchEvent(new Event('load'));
        await vi.waitFor(() => expect(registration.update).toHaveBeenCalledTimes(1));

        await vi.advanceTimersByTimeAsync(15 * 60 * 1000);
        expect(registration.update).toHaveBeenCalledTimes(2);

        stubVisibility('hidden');
        await vi.advanceTimersByTimeAsync(15 * 60 * 1000);
        expect(registration.update).toHaveBeenCalledTimes(2);
      } finally {
        vi.clearAllTimers();
      }
    });
  });
});
