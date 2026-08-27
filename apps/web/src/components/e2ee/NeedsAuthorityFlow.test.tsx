import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { NEEDS_AUTHORITY_COPY, enrollThisDevice } from '../../e2ee/enrollment.js';
import {
  createFakeE2eeNode,
  fakeTransport,
  memoryVault,
  publishedRoot,
} from '../../e2ee/test-support.js';
import { NeedsAuthorityChooser, NeedsAuthorityFlow } from './NeedsAuthorityFlow.js';

describe('NeedsAuthorityChooser', () => {
  it('renders exactly the three fixed options and dispatches each', () => {
    const onChoose = vi.fn();
    render(<NeedsAuthorityChooser onChoose={onChoose} />);

    expect(screen.getByText(NEEDS_AUTHORITY_COPY.summary)).toBeInTheDocument();
    const group = screen.getByRole('group', { name: 'This device cannot enroll on its own' });
    expect(group.querySelectorAll('button')).toHaveLength(3);

    fireEvent.click(screen.getByText(NEEDS_AUTHORITY_COPY.link));
    expect(onChoose).toHaveBeenLastCalledWith('link');

    fireEvent.click(screen.getByText(NEEDS_AUTHORITY_COPY.rotate));
    expect(onChoose).toHaveBeenLastCalledWith('rotate');

    fireEvent.click(screen.getByText(NEEDS_AUTHORITY_COPY.cancel));
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

    fireEvent.click(screen.getByText(NEEDS_AUTHORITY_COPY.cancel));
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

    fireEvent.click(screen.getByText(NEEDS_AUTHORITY_COPY.link));
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

    fireEvent.click(screen.getByText(NEEDS_AUTHORITY_COPY.rotate));
    expect(screen.getByText(/everyone you message will be warned/i)).toBeInTheDocument();
    expect(screen.getByText(/history on/i)).toBeInTheDocument();

    fireEvent.click(screen.getByText('Start a new identity'));
    await waitFor(() => expect(onResolved).toHaveBeenCalledWith('enrolled'));
    expect(transport.publishIdentityRoot).toHaveBeenCalled();
  });
});
