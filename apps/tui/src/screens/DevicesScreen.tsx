import { Box, Text, useInput } from 'ink';
import type { ReactElement } from 'react';
import { useEffect, useState } from 'react';

import type { PatchesApi } from '../api/client.js';
import { describeGrpcError, type FriendlyError } from '../api/errors.js';
import type { ActiveSession } from '../auth/session.js';
import { theme } from '../theme/index.js';
import { Loading } from '../components/Loading.js';

export interface DevicesScreenProps {
  api: PatchesApi;
  session: ActiveSession;
  isActive: boolean;
  ensureAccessToken: () => Promise<string>;
  onBack: () => void;
}

interface DeviceEntry {
  deviceId: string;
  actorId: string;
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
  | { status: 'error'; message: string };

function loadDevices(api: PatchesApi, session: ActiveSession): Promise<DeviceEntry[]> {
  const actorId = session.actor?.id;
  if (actorId === undefined) return Promise.resolve([]);
  return api.getDeviceRoster({ actorId }).then((response) =>
    response.certificates.map((cert) => ({
      deviceId: cert.deviceId,
      actorId: cert.actorId,
    })),
  );
}

/**
 * `:devices` command — list and revoke E2EE enrolled devices (P13-010).
 * Uses `GetDeviceRoster` which returns the full certificate list.
 */
export function DevicesScreen({
  api,
  session,
  isActive,
  ensureAccessToken,
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
      setRevokeFlow({ status: 'done', message: `Revoked device ${device.deviceId}.` });
      const devices = await loadDevices(api, session);
      setState({ status: 'ready', devices });
      setSelectedDevice((index) => Math.min(index, Math.max(devices.length - 1, 0)));
    } catch (error) {
      setRevokeFlow({ status: 'error', message: describeGrpcError(error, api.target).title });
    }
  }

  useInput(
    (input, key) => {
      if (key.escape) {
        if (
          revokeFlow.status === 'confirming' ||
          revokeFlow.status === 'done' ||
          revokeFlow.status === 'error'
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
      if (revokeFlow.status === 'revoking') return;
      if (revokeFlow.status === 'done' || revokeFlow.status === 'error') {
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
            return (
              <Text
                key={device.deviceId}
                color={selected ? theme.accent : theme.muted}
                bold={selected}
              >
                {selected ? '› ' : '  '}
                {device.deviceId}
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
        {revokeFlow.status === 'done' && <Text color={theme.ok}>{revokeFlow.message}</Text>}
        {revokeFlow.status === 'error' && <Text color={theme.error}>{revokeFlow.message}</Text>}
        {revokeFlow.status === 'idle' && (
          <Text color={theme.muted}>j/k select · v revoke · Esc back</Text>
        )}
      </Box>
    </Box>
  );
}
