/** `localStorage` key for the cached signed-in actor (`session.ts`). Shared with
 * `demo/demo-mode.ts`, which has to clear it without importing `session.ts` (that file imports
 * the demo module first, so the reverse import would be a cycle). */
export const ACTOR_STORAGE_KEY = 'patches.web.actor.v1';
