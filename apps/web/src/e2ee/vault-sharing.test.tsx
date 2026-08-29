/**
 * Regression test for issue #279: `DevicesRoute` (authority-side link/rotate/recovery UI,
 * `useE2eeVaultAccess`) and `LinkThisDevicePanel` (new-device-side link UI, reached from
 * `MessagesRoute`'s `NeedsAuthorityFlow`) both read the SAME actor's vault through
 * `WebE2eeManager.withVault` rather than each opening its own `createRatchetSessionVault`
 * connection to the account's IndexedDB (ADR 0020 §4: one connection at a time).
 */
import 'fake-indexeddb/auto';

import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { DevicesRoute } from '../routes/settings/DevicesRoute.js';
import { LinkThisDevicePanel } from '../components/e2ee/LinkThisDevicePanel.js';
import { useE2ee, useE2eeVaultAccess } from './use-e2ee.js';
import type { JSX } from 'react';

const ACTOR_ID = 'actor-shared-vault';

vi.mock('../api/client.js', () => ({ api: { e2ee: {} } }));

vi.mock('../hooks/useSession.js', () => ({
  useSession: () => ({ actor: { id: ACTOR_ID, handle: 'shared' } }),
}));

// `withVault` hands out `createWebEnrollmentTransport({ api })`; the two panels under
// test only exercise it via `listPendingDeviceLinks`/`beginDeviceLinkOffer`-equivalents,
// so a single shared fake node — never the real `api.e2ee` stub above — is enough.
vi.mock('./transports.js', async () => {
  const support = await import('./test-support.js');
  const node = support.createFakeE2eeNode();
  // `LinkThisDevicePanel` refuses to start without a published root for the account to
  // link against — mirrors the state a real second device would find already published.
  node.rootByActor.set(
    'actor-shared-vault',
    support.publishedRoot('actor-shared-vault', new Uint8Array(32).fill(7)),
  );
  const transport = support.fakeTransport({ actorId: 'actor-shared-vault', node });
  return {
    createWebEnrollmentTransport: (): unknown => transport,
    createWebE2eeTransports: (): never => {
      throw new Error('not exercised: this test never reaches an enrolled identity');
    },
    bindConversationCreate: (): never => {
      throw new Error('not exercised: this test never reaches an enrolled identity');
    },
  };
});

/** Mounts `LinkThisDevicePanel` exactly the way `NeedsAuthorityFlow` does once the
 * new-device chooser picks "link" — via the manager's own vault, never a second
 * `createRatchetSessionVault` connection. */
function LinkThisDeviceHarness(): JSX.Element | null {
  const status = useE2ee({ actor: { id: ACTOR_ID } });
  const { vault, actorId, transport, ready } = useE2eeVaultAccess(status);
  if (!ready || vault === undefined || actorId === undefined || transport === undefined) {
    return null;
  }
  return (
    <LinkThisDevicePanel
      actorId={actorId}
      vault={vault}
      transport={transport}
      onEnrolled={() => undefined}
      onCancel={() => undefined}
    />
  );
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('DevicesRoute + LinkThisDevicePanel sharing one actor', () => {
  it('opens exactly one createRatchetSessionVault connection for the account', async () => {
    const vaultModule = await import('./vault.js');
    const openSpy = vi.spyOn(vaultModule, 'createRatchetSessionVault');

    // Mounted sequentially, the way the two real routes reach this state in practice
    // (a settings tab already open, then a messages tab opened alongside it) — this
    // exercises `WebE2eeManager.setActor`'s post-completion no-op join (`web-e2ee.ts`:
    // "already the bound actor with an open vault"). Mounting both in the same commit
    // would instead race two concurrent `setActor` calls for the same actor before
    // either reaches `this.vault !== undefined`, which is a distinct, already-covered
    // scenario (`web-e2ee.test.ts`'s "overlapping calls" suite) — not what this seam
    // (`withVault`, issue #279) is about.
    const { rerender } = render(<DevicesRoute />);
    await screen.findByRole('heading', { name: 'Pending link requests' });

    rerender(
      <>
        <DevicesRoute />
        <LinkThisDeviceHarness />
      </>,
    );

    // The new-device panel only reaches its "Safety code" UI once it has a vault and
    // transport, i.e. after `withVault` resolved for both consumers.
    await screen.findByLabelText('Safety code');

    expect(openSpy).toHaveBeenCalledTimes(1);
    expect(openSpy).toHaveBeenCalledWith({
      account: { origin: location.origin, actorId: ACTOR_ID },
    });
  });
});
