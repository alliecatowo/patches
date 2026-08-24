/**
 * B-107 — the enrollment entry points on `:devices` and `:accounts`: capability
 * gating (`GetE2eeCapability`), explicit confirm, progress, and the ADR 0020 §3
 * peer-warning copy surfaced with the result.
 */
import { render } from 'ink-testing-library';
import { describe, expect, it, vi } from 'vitest';

import { stripSgr } from './ansi.js';
import type { ActiveSession } from '../src/auth/session.js';
import { makeActor } from '../src/test/wire-fixtures.js';
import { DevicesScreen } from '../src/screens/DevicesScreen.js';
import { AccountsScreen } from '../src/screens/AccountsScreen.js';
import { ENROLLMENT_PEER_WARNING_COPY } from '../src/e2ee/enrollment.js';
import type { PatchesApi } from '../src/api/client.js';

const KEY = { enter: '\r' } as const;

const session = {
  nodeOrigin: 'patches.test',
  userId: 'actor-1',
  actor: makeActor({ id: 'actor-1', handle: 'alice' }),
  accessToken: 'token-1',
  accessExpiresAt: new Date(Date.now() + 60_000),
  refreshToken: 'r',
  refreshExpiresAt: new Date(Date.now() + 60_000),
  emailVerified: true,
} as ActiveSession;

async function waitForFrame(lastFrame: () => string | undefined, text: string): Promise<string> {
  const deadline = Date.now() + 2_000;
  let frame = stripSgr(lastFrame() ?? '');
  while (!frame.includes(text)) {
    if (Date.now() >= deadline) {
      throw new Error(`Timed out waiting for ${text}. Last frame:\n${frame}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
    frame = stripSgr(lastFrame() ?? '');
  }
  return frame;
}

function devicesApi(): PatchesApi {
  return {
    target: 'patches.test',
    getDeviceRoster: vi.fn(() =>
      Promise.resolve({
        roster: undefined,
        certificates: [
          {
            deviceId: 'device-aaa',
            actorId: 'actor-1',
            rootGeneration: 1,
            status: 1,
          },
        ],
      }),
    ),
  } as unknown as PatchesApi;
}

function accountsApi(): PatchesApi {
  return {
    target: 'patches.test',
    listCredentials: vi.fn(() => Promise.resolve({ credentials: [] })),
  } as unknown as PatchesApi;
}

function enrollOutcomeOk() {
  return () =>
    Promise.resolve({
      ok: true,
      copy: 'This device is enrolled for end-to-end encrypted messages.',
      peerWarning: ENROLLMENT_PEER_WARNING_COPY,
    });
}

describe('DevicesScreen enrollment entry point (B-107)', () => {
  it('offers enroll where the capability allows, confirms, then shows the peer warning', async () => {
    const api = devicesApi();
    const onEnrollE2ee = vi.fn(enrollOutcomeOk());
    const { lastFrame, stdin } = render(
      <DevicesScreen
        api={api}
        session={session}
        isActive
        ensureAccessToken={() => Promise.resolve('token-1')}
        e2eeCapabilityState={5}
        onEnrollE2ee={onEnrollE2ee}
        onBack={() => {}}
      />,
    );
    await waitForFrame(lastFrame, 'device-aaa');
    expect(stripSgr(lastFrame() ?? '')).toContain('e enroll this device');

    stdin.write('e');
    await waitForFrame(lastFrame, 'Enroll THIS computer');
    // The confirm states the key boundary before anything runs.
    expect(stripSgr(lastFrame() ?? '')).toContain('never leave');
    stdin.write('y');
    await waitForFrame(lastFrame, 'new-device security notice');

    expect(onEnrollE2ee).toHaveBeenCalledTimes(1);
    const frame = stripSgr(lastFrame() ?? '');
    expect(frame).toContain('enrolled for end-to-end encrypted messages');
    // ADR 0020 §3: the visible-security-event warning is on the result, not in help.
    expect(frame).toContain('safety number');
  });

  it('hides the entry point when the node reports E2EE disabled', async () => {
    const api = devicesApi();
    const onEnrollE2ee = vi.fn(enrollOutcomeOk());
    const { lastFrame, stdin } = render(
      <DevicesScreen
        api={api}
        session={session}
        isActive
        ensureAccessToken={() => Promise.resolve('token-1')}
        e2eeCapabilityState={1}
        onEnrollE2ee={onEnrollE2ee}
        onBack={() => {}}
      />,
    );
    await waitForFrame(lastFrame, 'device-aaa');
    expect(stripSgr(lastFrame() ?? '')).not.toContain('e enroll this device');
    stdin.write('e');
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(stripSgr(lastFrame() ?? '')).not.toContain('Enroll THIS computer');
    expect(onEnrollE2ee).not.toHaveBeenCalled();
  });

  it('marks the row that is THIS machine once enrolled', async () => {
    const api = devicesApi();
    const { lastFrame } = render(
      <DevicesScreen
        api={api}
        session={session}
        isActive
        ensureAccessToken={() => Promise.resolve('token-1')}
        e2eeCapabilityState={5}
        thisDeviceId="device-aaa"
        onBack={() => {}}
      />,
    );
    const frame = await waitForFrame(lastFrame, 'device-aaa');
    expect(frame).toContain('(this device)');
  });

  it('renders a refusal honestly when enrollment is not possible here', async () => {
    const api = devicesApi();
    const onEnrollE2ee = vi.fn(() =>
      Promise.resolve({
        ok: false,
        copy:
          'This account already has a messaging identity published from another device, and ' +
          'this computer does not hold its authority key.',
      }),
    );
    const { lastFrame, stdin } = render(
      <DevicesScreen
        api={api}
        session={session}
        isActive
        ensureAccessToken={() => Promise.resolve('token-1')}
        e2eeCapabilityState={5}
        onEnrollE2ee={onEnrollE2ee}
        onBack={() => {}}
      />,
    );
    await waitForFrame(lastFrame, 'device-aaa');
    stdin.write('e');
    await waitForFrame(lastFrame, 'Enroll THIS computer');
    stdin.write('y');
    await waitForFrame(lastFrame, 'authority key');
    expect(stripSgr(lastFrame() ?? '')).not.toContain('security notice');
  });
});

describe('AccountsScreen enrollment entry point (B-107)', () => {
  it('shows the encrypted-device flow behind an explicit confirm and the peer warning', async () => {
    const api = accountsApi();
    const onEnrollE2ee = vi.fn(enrollOutcomeOk());
    const { lastFrame, stdin } = render(
      <AccountsScreen
        api={api}
        env={{}}
        session={session}
        isActive
        ensureAccessToken={() => Promise.resolve('token-1')}
        e2eeCapabilityState={4}
        onOpenDevices={() => {}}
        onEnrollE2ee={onEnrollE2ee}
        onLogout={() => {}}
        onResendVerification={() => {}}
        onBack={() => {}}
      />,
    );
    await waitForFrame(lastFrame, 'not enrolled for encrypted messages yet');
    stdin.write('e');
    await waitForFrame(lastFrame, 'Enroll THIS computer');
    stdin.write(KEY.enter);
    await waitForFrame(lastFrame, 'new-device security notice');
    expect(onEnrollE2ee).toHaveBeenCalledTimes(1);
    expect(stripSgr(lastFrame() ?? '')).toContain('enrolled for end-to-end encrypted messages');
  });

  it('states the enrolled device instead of offering re-enrollment', async () => {
    const api = accountsApi();
    const onEnrollE2ee = vi.fn(enrollOutcomeOk());
    const { lastFrame, stdin } = render(
      <AccountsScreen
        api={api}
        env={{}}
        session={session}
        isActive
        ensureAccessToken={() => Promise.resolve('token-1')}
        e2eeCapabilityState={5}
        e2eeEnrolledDeviceId="device-aaa"
        onOpenDevices={() => {}}
        onEnrollE2ee={onEnrollE2ee}
        onLogout={() => {}}
        onResendVerification={() => {}}
        onBack={() => {}}
      />,
    );
    await waitForFrame(lastFrame, 'Encrypted-messaging device enrolled here');
    expect(stripSgr(lastFrame() ?? '')).toContain('D devices');
    stdin.write('e');
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(stripSgr(lastFrame() ?? '')).not.toContain('Enroll THIS computer');
    expect(onEnrollE2ee).not.toHaveBeenCalled();
  });
});
