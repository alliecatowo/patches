import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { beginDeviceLinkOffer } from '../../e2ee/device-link.js';
import { enrollThisDevice } from '../../e2ee/enrollment.js';
import { createFakeE2eeNode, fakeTransport, memoryVault } from '../../e2ee/test-support.js';
import {
  MISMATCH_DISCARD_COPY,
  NOT_AUTHORITY_COPY,
  PendingLinkRequests,
} from './PendingLinkRequests.js';

const ACTOR_ID = 'actor-pending-requests';

describe('PendingLinkRequests', () => {
  it('lists a pending offer and approves it once the match checkbox is confirmed', async () => {
    const node = createFakeE2eeNode();
    const authorityTransport = fakeTransport({ actorId: ACTOR_ID, node });
    const authorityVault = memoryVault();
    await enrollThisDevice({
      actorId: ACTOR_ID,
      transport: authorityTransport,
      vault: authorityVault,
      nowMs: Date.now,
    });

    const newDeviceTransport = fakeTransport({ actorId: ACTOR_ID, node });
    const newDeviceVault = memoryVault();
    await beginDeviceLinkOffer({
      actorId: ACTOR_ID,
      transport: newDeviceTransport,
      vault: newDeviceVault,
      nowMs: Date.now,
    });

    render(
      <PendingLinkRequests
        actorId={ACTOR_ID}
        vault={authorityVault}
        transport={authorityTransport}
        pollIntervalMs={50}
      />,
    );

    await screen.findByLabelText('Safety code');
    const approveButton = screen.getByRole('button', { name: 'Approve' });
    expect(approveButton).toBeDisabled();

    fireEvent.click(screen.getByLabelText('The code on the other device matches'));
    expect(approveButton).toBeEnabled();
    fireEvent.click(approveButton);

    await waitFor(() => expect(authorityTransport.enrollDevice).toHaveBeenCalled());
  });

  it('discards a mismatched offer without approving it', async () => {
    const node = createFakeE2eeNode();
    const authorityTransport = fakeTransport({ actorId: ACTOR_ID, node });
    const authorityVault = memoryVault();
    await enrollThisDevice({
      actorId: ACTOR_ID,
      transport: authorityTransport,
      vault: authorityVault,
      nowMs: Date.now,
    });

    const newDeviceTransport = fakeTransport({ actorId: ACTOR_ID, node });
    const newDeviceVault = memoryVault();
    await beginDeviceLinkOffer({
      actorId: ACTOR_ID,
      transport: newDeviceTransport,
      vault: newDeviceVault,
      nowMs: Date.now,
    });

    // Bootstrap already called `enrollDevice` once for its own generation-1 self-enrollment
    // (unrelated to the link this test discards) — clear that call before asserting below.
    authorityTransport.enrollDevice.mockClear();

    render(
      <PendingLinkRequests
        actorId={ACTOR_ID}
        vault={authorityVault}
        transport={authorityTransport}
        pollIntervalMs={50}
      />,
    );

    await screen.findByLabelText('Safety code');
    fireEvent.click(screen.getByRole('button', { name: /doesn.t match/i }));

    expect(await screen.findByText(MISMATCH_DISCARD_COPY)).toBeInTheDocument();
    expect(authorityTransport.enrollDevice).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByLabelText('Safety code')).not.toBeInTheDocument());
  });

  it('shows the not-authority copy when this device does not hold the root', async () => {
    const node = createFakeE2eeNode();
    const otherAuthorityTransport = fakeTransport({ actorId: ACTOR_ID, node });
    const otherAuthorityVault = memoryVault();
    await enrollThisDevice({
      actorId: ACTOR_ID,
      transport: otherAuthorityTransport,
      vault: otherAuthorityVault,
      nowMs: Date.now,
    });

    // This device's own vault never bootstrapped/linked, so it holds no rootPrivate.
    const linkedTransport = fakeTransport({ actorId: ACTOR_ID, node });
    const linkedVault = memoryVault();

    render(
      <PendingLinkRequests
        actorId={ACTOR_ID}
        vault={linkedVault}
        transport={linkedTransport}
        pollIntervalMs={50}
      />,
    );

    expect(await screen.findByText(NOT_AUTHORITY_COPY)).toBeInTheDocument();
  });
});
