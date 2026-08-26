import type { Actor } from '@patches/proto/es';
import type { Decorator } from '@storybook/react-vite';

import { clearActorSession, setActorSession } from '../src/api/session.js';
import { resetStorybookScenario } from './mocks/apiClient.js';

/**
 * Story scenario helpers. `scenario()` wraps a story's setup in the two resets every
 * story needs: the mock API's scenario state (see `mocks/apiClient.ts`) and the app's
 * module-level session store + compose drafts. Without this, a signed-in story would
 * leak its actor into the next story via `localStorage`, and a typed compose draft would
 * reappear hours later on the same story.
 */

const DRAFT_KEY_PREFIX = 'patches.web.draft.';

function clearDrafts(): void {
  for (const key of Object.keys(window.localStorage)) {
    if (key.startsWith(DRAFT_KEY_PREFIX)) window.localStorage.removeItem(key);
  }
}

/** Resets all mock + session state, then runs the story's setup and renders it. */
export function scenario(setup: () => void = () => undefined): Decorator {
  return (Story) => {
    resetStorybookScenario();
    clearActorSession();
    clearDrafts();
    setup();
    return <Story />;
  };
}

/** The default signed-out story. */
export const signedOut: Decorator = scenario();

/** Signs the story in as `actor` (viewer fixtures live in `.storybook/fixtures.ts`). */
export function signedInAs(actor: Actor): Decorator {
  return scenario(() => setActorSession(actor));
}
