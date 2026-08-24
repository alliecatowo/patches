import { Box, Text, useInput } from 'ink';
import type { ReactElement } from 'react';
import { useEffect, useState } from 'react';

import type { PatchesApi } from '../api/client.js';
import { describeGrpcError, type FriendlyError } from '../api/errors.js';
import { E2EE_DEVICE_STATUS_SCHEMA, enumWireName } from '../api/wire/enums.js';
import type { ActiveSession } from '../auth/session.js';
import { theme } from '../theme/index.js';
import { Loading } from '../components/Loading.js';

export interface DevicesScreenProps {
  api: PatchesApi;
  session: ActiveSession;
  isActive: boolean;
  ensureAccessToken: () => Promise<string>;
  /**
   * Erases this machine's stored encrypted-message state (`wipeE2eeState`, P13-006).
   * Offered as an explicit opt-in after a successful revocation — revocation stops
   * future delivery but is never a remote wipe and cannot retract what a device
   * already holds (ADR 0020 §10), so erasing what *this* computer keeps is a separate,
   * viewer-chosen act.
   */
  onWipeE2ee?: (() => Promise<void>) | undefined;
  onBack: () => void;
}

interface DeviceEntry {
  deviceId: string;
  actorId: string;
  /** Wire name of `E2eeDeviceStatus`, e.g. `ACTIVE` / `REVOKED` / `EXPIRED`. */
  status: string;
  rootGeneration: number;
}

type DevicesState =
  | { status: 'loading' }
  | { status: 'ready'; devices: DeviceEntry[] }
  | { status: 'error'; error: FriendlyError };

type RevokeFlow =
  | { status: 'idle' }
  | { status: 'confirming'; device: DeviceEntry }
  | { status: 'revoking'; device: DeviceEntry }
  | { status: 'done'; message: string }
  | { status: 'offering_wipe' }
  | { status: 'wiping' }
  | { status: 'wiped' }
  | { status: 'error'; message: string };

function loadDevices(api: PatchesApi, session: ActiveSession): Promise<DeviceEntry[]> {
  const actorId = session.actor?.id;
  if (actorId === undefined) return Promise.resolve([]);
  return api.getDeviceRoster({ actorId }).then((response) =>
    response.certificates.map((cert) => ({
      deviceId: cert.deviceId,
      actorId: cert.actorId,
      status:
        cert.status === undefined || cert.status === null
          ? 'UNKNOWN'
          : enumWireName(E2EE_DEVICE_STATUS_SCHEMA, cert.status),
      rootGeneration: cert.rootGeneration ?? 0,
    })),
  );
}

/**
 * `:devices` command — list and revoke E2EE enrolled devices (P13-010).
 * Uses `GetDeviceRoster` which returns the full certificate list; revocation asks
 * twice where it must: once for the server-side revoke, then — only after it
 * succeeds — an explicit y/n for erasing this machine's own encrypted history.
 */
export function DevicesScreen({
  api,
  session,
  isActive,
  ensureAccessToken,
  onWipeE2ee,
  onBack,
}: DevicesScreenProps): ReactElement {
  const [state, setState] = useState<DevicesState>({ status: 'loading' });
  const [revokeFlow, setRevokeFlow] = useState<RevokeFlow>({ status: 'idle' });
  const [selectedDevice, setSelectedDevice] = useState(0);

  useEffect(() => {
    let cancelled = false;
    loadDevices(api, session)
      .then((devices) => {
        if (!cancelled) setState({ status: 'ready', devices });
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setState({ status: 'error', error: describeGrpcError(error, api.target) });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [api, session]);

  async function revokeDevice(device: DeviceEntry): Promise<void> {
    setRevokeFlow({ status: 'revoking', device });
    try {
      const accessToken = await ensureAccessToken();
      await api.revokeDevice({ deviceId: device.deviceId }, accessToken);
      setRevokeFlow({
        status: 'done',
        message:
          `Revoked device ${device.deviceId}. Future messages stop here — this cannot recall ` +
          'anything that device already received.',
      });
      const devices = await loadDevices(api, session);
      setState({ status: 'ready', devices });
      setSelectedDevice((index) => Math.min(index, Math.max(devices.length - 1, 0)));
    } catch (error) {
      setRevokeFlow({ status: 'error', message: describeGrpcError(error, api.target).title });
    }
  }

  async function wipeLocalState(): Promise<void> {
    if (onWipeE2ee === undefined) return;
    setRevokeFlow({ status: 'wiping' });
    try {
      await onWipeE2ee();
      setRevokeFlow({ status: 'wiped' });
    } catch {
      setRevokeFlow({
        status: 'error',
        message: 'Could not erase the local encrypted state on this machine.',
      });
    }
  }

  useInput(
    (input, key) => {
      if (key.escape) {
        if (
          revokeFlow.status === 'confirming' ||
          revokeFlow.status === 'done' ||
          revokeFlow.status === 'error' ||
          revokeFlow.status === 'wiped'
        ) {
          setRevokeFlow({ status: 'idle' });
          return;
        }
        onBack();
        return;
      }
      if (revokeFlow.status === 'confirming') {
        if (input === 'y' || key.return) void revokeDevice(revokeFlow.device);
        else if (input === 'n') setRevokeFlow({ status: 'idle' });
        return;
      }
      if (revokeFlow.status === 'offering_wipe') {
        if (input === 'y') void wipeLocalState();
        else if (input === 'n' || key.escape) setRevokeFlow({ status: 'idle' });
        return;
      }
      if (revokeFlow.status === 'revoking' || revokeFlow.status === 'wiping') return;
      if (revokeFlow.status === 'done' || revokeFlow.status === 'error') {
        // After a successful revoke, move on to the opt-in wipe question instead of
        // dismissing straight back to the list.
        if (revokeFlow.status === 'done' && onWipeE2ee !== undefined) {
          setRevokeFlow({ status: 'offering_wipe' });
          return;
        }
        setRevokeFlow({ status: 'idle' });
        return;
      }
      if (state.status === 'ready' && state.devices.length > 0) {
        if (input === 'j' || key.downArrow) {
          setSelectedDevice((index) => Math.min(index + 1, state.devices.length - 1));
          return;
        }
        if (input === 'k' || key.upArrow) {
          setSelectedDevice((index) => Math.max(index - 1, 0));
          return;
        }
        if (input === 'v') {
          const device = state.devices[selectedDevice];
          if (device !== undefined) setRevokeFlow({ status: 'confirming', device });
          return;
        }
      }
    },
    { isActive },
  );

  if (state.status === 'loading') return <Loading label="Loading devices..." />;
  if (state.status === 'error') {
    return (
      <Box flexDirection="column" gap={1}>
        <Text color={theme.error}>Failed to load devices</Text>
        <Text>{state.error.title}</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      <Text color={theme.accent} bold>
        E2EE Devices
      </Text>
      <Box marginTop={1} flexDirection="column">
        {state.devices.length === 0 ? (
          <Text color={theme.muted}>No E2EE devices enrolled.</Text>
        ) : (
          state.devices.map((device, index) => {
            const selected = index === selectedDevice;
            const revoked = device.status !== 'ACTIVE';
            return (
              <Text
                key={device.deviceId}
                color={selected ? theme.accent : theme.muted}
                bold={selected}
              >
                {selected ? '› ' : '  '}
                {device.deviceId} · root gen {String(device.rootGeneration)} ·{' '}
                {revoked ? `${device.status} — no longer delivered to` : device.status}
              </Text>
            );
          })
        )}
      </Box>
      <Box marginTop={1} flexDirection="column">
        {revokeFlow.status === 'confirming' && (
          <Text color={theme.warn}>
            Revoke device {revokeFlow.device.deviceId}? y/Enter confirm · n/Esc cancel
          </Text>
        )}
        {revokeFlow.status === 'revoking' && <Loading label="Revoking..." />}
        {revokeFlow.status === 'done' && (
          <Text color={theme.ok} wrap="wrap">
            {revokeFlow.message}
          </Text>
        )}
        {revokeFlow.status === 'offering_wipe' && (
          <Box flexDirection="column">
            <Text color={theme.warn} wrap="wrap">
              Also erase THIS computer’s stored encrypted message history? Revocation alone never
              removes what a device already holds.
            </Text>
            <Text color={theme.muted}>y erase · n/Esc keep</Text>
          </Box>
        )}
        {revokeFlow.status === 'wiping' && <Loading label="Erasing local encrypted state..." />}
        {revokeFlow.status === 'wiped' && (
          <Text color={theme.ok}>Local encrypted state erased on this machine.</Text>
        )}
        {revokeFlow.status === 'error' && (
          <Text color={theme.error} wrap="wrap">
            {revokeFlow.message}
          </Text>
        )}
        {revokeFlow.status === 'idle' && (
          <Text color={theme.muted}>j/k select · v revoke · Esc back</Text>
        )}
      </Box>
    </Box>
  );
}
