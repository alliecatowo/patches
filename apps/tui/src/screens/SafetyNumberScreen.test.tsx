import { generateSigningKeyPair } from '@patches/crypto';
import { render } from 'ink-testing-library';
import { describe, expect, it, vi } from 'vitest';

import { stripSgr } from '../../test/ansi.js';
import { flush } from '../../test/harness.js';
import type { ActiveSession } from '../auth/session.js';
import {
  buildIdentityRootWire,
  buildRosterWire,
  enrollRequestFromRecord,
  generateEnrollment,
} from '../e2ee/enrollment.js';
import { SafetyNumberScreen } from './SafetyNumberScreen.js';

const nowMs = Date.now();

function mint(actorId: string, generation: number) {
  const record = generateEnrollment({
    actorId,
    nowMs,
    root: { ...generateSigningKeyPair(), createdAtMs: nowMs - 1000, generation },
  }).record;
  return {
    root: buildIdentityRootWire(record.identity.ownRoster.root),
    roster: buildRosterWire(record.identity.ownRoster),
    certificates: [enrollRequestFromRecord(record).certificate],
  };
}

async function waitFor(lastFrame: () => string | undefined, text: string): Promise<string> {
  for (let i = 0; i < 100; i += 1) {
    const frame = stripSgr(lastFrame() ?? '');
    if (frame.includes(text)) return frame;
    await flush();
  }
  throw new Error(`never saw "${text}" in:\n${stripSgr(lastFrame() ?? '')}`);
}

function setup(pending: boolean) {
  const me = mint('actor-me', 1);
  const peer = mint('actor-peer', 2);
  const api = {
    target: 'test',
    getIdentityRoot: vi.fn((request: { actorId: string }) =>
      Promise.resolve({
        identityRoot: request.actorId === 'actor-me' ? me.root : peer.root,
        identityChangedSinceAcknowledged: false,
      }),
    ),
    getDeviceRoster: vi.fn(() =>
      Promise.resolve({ roster: peer.roster, certificates: peer.certificates }),
    ),
    getActor: vi.fn(() => Promise.resolve({ actor: { handle: 'peer' } })),
  };
  const onCheckResetPending = vi.fn(() => Promise.resolve(pending));
  const onAcceptReset = vi.fn(() => Promise.resolve());
  const view = render(
    <SafetyNumberScreen
      api={api as never}
      session={{ actor: { id: 'actor-me' }, userId: 'user' } as unknown as ActiveSession}
      isActive
      targetActorId="actor-peer"
      ensureAccessToken={() => Promise.resolve('token')}
      onCheckResetPending={onCheckResetPending}
      onAcceptReset={onAcceptReset}
      onBack={() => undefined}
    />,
  );
  return { ...view, onAcceptReset, onCheckResetPending, peerRoot: peer.root };
}

describe('SafetyNumberScreen identity reset re-trust (P2-H2)', () => {
  it('needs a second, explicit y before it re-pins, and cancels on any other key', async () => {
    const { lastFrame, stdin, onAcceptReset, peerRoot } = setup(true);
    await waitFor(lastFrame, 'reset their messaging identity');

    stdin.write('a');
    await waitFor(lastFrame, 'Press y now');
    stdin.write('n');
    await flush();
    expect(onAcceptReset).not.toHaveBeenCalled();

    stdin.write('a');
    await waitFor(lastFrame, 'Press y now');
    stdin.write('y');
    await waitFor(lastFrame, 'New identity accepted.');
    expect(onAcceptReset).toHaveBeenCalledTimes(1);
    // Exactly the root the number was computed from, nothing the node could swap in later.
    expect(onAcceptReset).toHaveBeenCalledWith({
      rootBytes: peerRoot.rootBytes,
      selfSignature: peerRoot.selfSignature,
    });
  });

  it('shows no accept prompt when the root is not a pending reset', async () => {
    const { lastFrame, stdin, onAcceptReset } = setup(false);
    await waitFor(lastFrame, 'Safety Number');
    stdin.write('a');
    await flush();
    expect(stripSgr(lastFrame() ?? '')).not.toContain('reset their messaging identity');
    expect(onAcceptReset).not.toHaveBeenCalled();
  });
});
