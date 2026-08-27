import { Code, ConnectError } from '@connectrpc/connect';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { DEVICE_LINK_ERROR_COPY } from '../../e2ee/device-link.js';
import { NEEDS_AUTHORITY_COPY, enrollThisDevice } from '../../e2ee/enrollment.js';
import {
  createFakeE2eeNode,
  fakeTransport,
  memoryVault,
  publishedRoot,
} from '../../e2ee/test-support.js';
import { NeedsAuthorityChooser, NeedsAuthorityFlow } from './NeedsAuthorityFlow.js';

describe('NeedsAuthorityChooser', () => {
  it('renders exactly the three fixed options as buttons and dispatches each', () => {
    const onChoose = vi.fn();
    render(<NeedsAuthorityChooser onChoose={onChoose} />);

    expect(screen.getByText(NEEDS_AUTHORITY_COPY.summary)).toBeInTheDocument();
    const group = screen.getByRole('group', { name: 'This device cannot enroll on its own' });
    expect(within(group).getAllByRole('button')).toHaveLength(3);

    fireEvent.click(within(group).getByRole('button', { name: /link this device/i }));
    expect(onChoose).toHaveBeenLastCalledWith('link');

    fireEvent.click(within(group).getByRole('button', { name: /start a new identity/i }));
    expect(onChoose).toHaveBeenLastCalledWith('rotate');

    fireEvent.click(within(group).getByRole('button', { name: /^cancel$/i }));
    expect(onChoose).toHaveBeenLastCalledWith('cancel');
  });
});

describe('NeedsAuthorityFlow', () => {
  it('cancel resolves immediately without touching the vault', () => {
    const onResolved = vi.fn();
    const vault = memoryVault();
    const transport = fakeTransport({ actorId: 'actor-1' });

    render(
      <NeedsAuthorityFlow
        actorId="actor-1"
        vault={vault}
        transport={transport}
        onResolved={onResolved}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /^cancel$/i }));
    expect(onResolved).toHaveBeenCalledWith('cancelled');
    expect(transport.getIdentityRoot).not.toHaveBeenCalled();
  });

  it('link choice moves into the LinkThisDevicePanel and shows a SAS', async () => {
    const node = createFakeE2eeNode();
    node.rootByActor.set('actor-1', publishedRoot('actor-1', new Uint8Array(32).fill(7)));
    const transport = fakeTransport({ actorId: 'actor-1', node });
    const vault = memoryVault();

    render(
      <NeedsAuthorityFlow
        actorId="actor-1"
        vault={vault}
        transport={transport}
        onResolved={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /link this device/i }));
    await waitFor(() => expect(screen.getByLabelText('Safety code')).toBeInTheDocument());
    expect(screen.getByText(/Compare this code/)).toBeInTheDocument();
  });

  it('rotate choice shows the ADR §2 warning copy and, on confirm, calls rotateMessagingRoot', async () => {
    const onResolved = vi.fn();
    const node = createFakeE2eeNode();
    // A real bootstrapped root: `rotateMessagingRoot` verifies the served root's own
    // self-signature, which an unsigned `publishedRoot()` fixture does not carry.
    await enrollThisDevice({
      actorId: 'actor-1',
      transport: fakeTransport({ actorId: 'actor-1', node }),
      vault: memoryVault(),
      nowMs: Date.now,
    });
    const transport = fakeTransport({ actorId: 'actor-1', node });
    const vault = memoryVault();

    render(
      <NeedsAuthorityFlow
        actorId="actor-1"
        vault={vault}
        transport={transport}
        onResolved={onResolved}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /start a new identity/i }));
    expect(screen.getByText(/everyone you message will be warned/i)).toBeInTheDocument();
    expect(screen.getByText(/history on/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /^start new identity$/i }));
    await waitFor(() => expect(onResolved).toHaveBeenCalledWith('enrolled'));
    expect(transport.publishIdentityRoot).toHaveBeenCalled();
  });

  /** Sets up an already-enrolled actor on a bootstrapped node, so `rotateMessagingRoot`
   * gets past root/roster verification and fails only where `publishIdentityRoot` rejects —
   * the real-account-with-a-real-root case the owner hit in production. */
  async function renderAtRotateConfirm(): Promise<{
    transport: ReturnType<typeof fakeTransport>;
    onResolved: ReturnType<typeof vi.fn>;
  }> {
    const node = createFakeE2eeNode();
    await enrollThisDevice({
      actorId: 'actor-1',
      transport: fakeTransport({ actorId: 'actor-1', node }),
      vault: memoryVault(),
      nowMs: Date.now,
    });
    const transport = fakeTransport({ actorId: 'actor-1', node });
    const vault = memoryVault();
    const onResolved = vi.fn();

    render(
      <NeedsAuthorityFlow
        actorId="actor-1"
        vault={vault}
        transport={transport}
        onResolved={onResolved}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /start a new identity/i }));
    return { transport, onResolved };
  }

  it('a DeviceLinkError from rotation shows its own message verbatim', async () => {
    const { transport, onResolved } = await renderAtRotateConfirm();
    // `rotateMessagingRoot` itself throws `DeviceLinkError('no-remote-root')` when the served
    // root comes back empty — the cheapest real (not stubbed) way to hit this branch.
    transport.getIdentityRoot.mockResolvedValueOnce(undefined);

    fireEvent.click(screen.getByRole('button', { name: /^start new identity$/i }));
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
    expect(screen.getByRole('alert')).toHaveTextContent(DEVICE_LINK_ERROR_COPY['no-remote-root']);
    expect(onResolved).not.toHaveBeenCalledWith('enrolled');
  });

  it('a ConnectError from rotation shows only the code name, never the raw message', async () => {
    const { transport, onResolved } = await renderAtRotateConfirm();
    transport.publishIdentityRoot.mockRejectedValueOnce(
      new ConnectError(
        'internal roster digest mismatch: user=42 secret=xyz',
        Code.FailedPrecondition,
      ),
    );

    fireEvent.click(screen.getByRole('button', { name: /^start new identity$/i }));
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
    const alertText = screen.getByRole('alert').textContent ?? '';
    expect(alertText).toContain('FailedPrecondition');
    expect(alertText).not.toContain('secret=xyz');
    expect(onResolved).not.toHaveBeenCalledWith('enrolled');
  });

  it('any other failure from rotation shows a fixed, non-committal message', async () => {
    const { transport, onResolved } = await renderAtRotateConfirm();
    transport.publishIdentityRoot.mockRejectedValueOnce(new TypeError('unexpected'));

    fireEvent.click(screen.getByRole('button', { name: /^start new identity$/i }));
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Something went wrong before any change was made. Try again.',
    );
    expect(onResolved).not.toHaveBeenCalledWith('enrolled');
  });
});
