import { toDate } from '../api/wire/time.js';

import { PatchesApi } from '../api/client.js';
import { describeGrpcError } from '../api/errors.js';
import { CLIENT_NAME, TUI_VERSION } from '../version.js';

export interface PingResult {
  json: string;
  exitCode: 0 | 1;
}

/**
 * The non-interactive half of the CLI: one real gRPC round trip, JSON on stdout,
 * a meaningful exit code.
 *
 * This exists so the client/server contract can be verified in CI and by a human
 * without driving a full-screen Ink app, and so `patches ping` is a usable
 * troubleshooting tool when the TUI won't connect.
 */
export async function runPing(options: { target: string; insecure: boolean }): Promise<PingResult> {
  const api = new PatchesApi(options);
  const startedAt = process.hrtime.bigint();

  try {
    const info = await api.getServerInfo();
    const latencyMs = Number(process.hrtime.bigint() - startedAt) / 1e6;

    return {
      exitCode: 0,
      json: stringify({
        ok: true,
        target: options.target,
        latencyMs: Math.round(latencyMs * 100) / 100,
        client: { name: CLIENT_NAME, version: TUI_VERSION },
        server: {
          version: info.serverVersion,
          protocolVersion: info.protocolVersion,
          minClientVersion: info.minClientVersion,
          instanceName: info.instanceName,
          serverTime: toDate(info.serverTime)?.toISOString() ?? null,
          features: info.features,
        },
      }),
    };
  } catch (error: unknown) {
    const friendly = describeGrpcError(error, options.target);
    return {
      exitCode: 1,
      json: stringify({
        ok: false,
        target: options.target,
        client: { name: CLIENT_NAME, version: TUI_VERSION },
        error: friendly,
      }),
    };
  } finally {
    api.close();
  }
}

function stringify(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}
