/**
 * Demo-sandbox mode (ADR 0044).
 *
 * "Try the demo" does not sign anyone in to the real node. It creates a throwaway account on a
 * separate demo node (`VITE_PATCHES_DEMO_API_BASE`) and the whole app then talks to that node
 * until the sandbox ends. The node an app talks to is fixed when `api/client.ts` is evaluated,
 * so entering and leaving the demo are both a full page load: the flag below is read once, at
 * module load, before any client exists.
 *
 * This file imports nothing from the app on purpose (`session.ts`, `client.ts` and `accounts.ts`
 * all import it, and it must run first); it only knows storage keys.
 */
import { ACTOR_STORAGE_KEY } from '../api/storage-keys.js';

const DEMO_STATE_KEY = 'patches.web.demo.v1';
const SEED_PLAN_KEY = 'patches.web.demo.seed.v1';
const SEED_PROGRESS_KEY = 'patches.web.demo.seed-progress.v1';

/** Where the demo sandbox lives; unset in builds without a demo node (the button then hides). */
const rawDemoBase = import.meta.env['VITE_PATCHES_DEMO_API_BASE'] as string | undefined;
export const DEMO_API_BASE: string | undefined =
  rawDemoBase !== undefined && rawDemoBase.length > 0 ? rawDemoBase : undefined;

/** The production node's base, exactly as `client.ts` always resolved it. */
export const PRIMARY_API_BASE: string =
  (import.meta.env['VITE_PATCHES_API_BASE'] as string | undefined) ?? '/api';

interface StoredDemoState {
  readonly expiresAtMs: number;
}

function credentialKey(base: string): string {
  // Must match `LocalStorageCredentialStore`'s key for the same base.
  return `patches.web.credentials.${base}.v1`;
}

function safeStorage(kind: 'local' | 'session'): Storage | undefined {
  try {
    return kind === 'local' ? window.localStorage : window.sessionStorage;
  } catch {
    // Storage can be blocked (private mode, site settings): the demo then simply cannot persist.
    return undefined;
  }
}

function readState(): StoredDemoState | undefined {
  const raw = safeStorage('local')?.getItem(DEMO_STATE_KEY) ?? null;
  if (raw === null) return undefined;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed === 'object' && parsed !== null) {
      const expiresAtMs = (parsed as Record<string, unknown>)['expiresAtMs'];
      if (typeof expiresAtMs === 'number' && Number.isFinite(expiresAtMs)) return { expiresAtMs };
    }
  } catch {
    // A corrupt value is the same as no demo.
  }
  return undefined;
}

/** Forgets every locally stored trace of a demo session (tokens, cached actor, seed plan). */
export function clearDemoLocalState(): void {
  const local = safeStorage('local');
  local?.removeItem(DEMO_STATE_KEY);
  local?.removeItem(ACTOR_STORAGE_KEY);
  if (DEMO_API_BASE !== undefined) local?.removeItem(credentialKey(DEMO_API_BASE));
  safeStorage('session')?.removeItem(SEED_PLAN_KEY);
  safeStorage('session')?.removeItem(SEED_PROGRESS_KEY);
}

/**
 * A sandbox that expired while no tab was open: drop it before anything reads the cached actor,
 * so the app starts signed out on the landing page rather than "signed in" to a dead account.
 * Runs once, at module load.
 */
function dropExpiredDemo(): void {
  const state = readState();
  if (state !== undefined && state.expiresAtMs <= Date.now()) clearDemoLocalState();
}
dropExpiredDemo();

/** The active, unexpired sandbox, or `undefined`. */
export function activeDemo(nowMs: number = Date.now()): StoredDemoState | undefined {
  if (DEMO_API_BASE === undefined) return undefined;
  const state = readState();
  return state !== undefined && state.expiresAtMs > nowMs ? state : undefined;
}

/** Evaluated at module load by `client.ts`: which node this page load talks to. */
export const DEMO_ACTIVE: boolean = activeDemo() !== undefined;
export const ACTIVE_API_BASE: string =
  DEMO_ACTIVE && DEMO_API_BASE !== undefined ? DEMO_API_BASE : PRIMARY_API_BASE;

/** Records a freshly created sandbox (the page then reloads onto the demo node). */
export function markDemoActive(expiresAtMs: number): void {
  safeStorage('local')?.setItem(DEMO_STATE_KEY, JSON.stringify({ expiresAtMs }));
}

// ---------------------------------------------------------------- seed plan

/** What the browser needs to seal the seeded direct messages after the page reloads. */
export interface DemoSeedPlan {
  readonly visitorActorId: string;
  readonly friends: ReadonlyArray<{
    readonly key: string;
    readonly actorId: string;
    readonly handle: string;
    readonly displayName: string;
    readonly accessToken: string;
  }>;
}

/** Held in `sessionStorage` (this tab only, gone when it closes). The friend tokens belong to
 * throwaway accounts that exist only inside the sandbox. */
export function saveSeedPlan(plan: DemoSeedPlan): void {
  safeStorage('session')?.setItem(SEED_PLAN_KEY, JSON.stringify(plan));
}

export function loadSeedPlan(): DemoSeedPlan | undefined {
  const raw = safeStorage('session')?.getItem(SEED_PLAN_KEY) ?? null;
  if (raw === null) return undefined;
  try {
    const parsed = JSON.parse(raw) as DemoSeedPlan;
    return typeof parsed.visitorActorId === 'string' && Array.isArray(parsed.friends)
      ? parsed
      : undefined;
  } catch {
    return undefined;
  }
}

export function clearSeedPlan(): void {
  safeStorage('session')?.removeItem(SEED_PLAN_KEY);
  safeStorage('session')?.removeItem(SEED_PROGRESS_KEY);
}

/**
 * How far sealing got, so a hard reload resumes instead of starting over (starting over is what
 * created duplicate conversations). `conversations` maps a friend key to the conversation that
 * friend already opened and how many scripted messages it has sent; `done` lists finished
 * friends. Holds ids and counters only, never a key or a message body.
 */
export interface DemoSeedProgress {
  readonly visitorEnrolled: boolean;
  readonly done: readonly string[];
  readonly conversations: Readonly<Record<string, { readonly id: string; readonly sent: number }>>;
}

export const EMPTY_SEED_PROGRESS: DemoSeedProgress = {
  visitorEnrolled: false,
  done: [],
  conversations: {},
};

export function saveSeedProgress(progress: DemoSeedProgress): void {
  safeStorage('session')?.setItem(SEED_PROGRESS_KEY, JSON.stringify(progress));
}

export function loadSeedProgress(): DemoSeedProgress {
  const raw = safeStorage('session')?.getItem(SEED_PROGRESS_KEY) ?? null;
  if (raw === null) return EMPTY_SEED_PROGRESS;
  try {
    const parsed = JSON.parse(raw) as Partial<DemoSeedProgress> | null;
    if (
      parsed !== null &&
      typeof parsed === 'object' &&
      typeof parsed.visitorEnrolled === 'boolean' &&
      Array.isArray(parsed.done) &&
      typeof parsed.conversations === 'object' &&
      parsed.conversations !== null
    ) {
      return parsed as DemoSeedProgress;
    }
  } catch {
    // Corrupt progress is the same as none.
  }
  return EMPTY_SEED_PROGRESS;
}
