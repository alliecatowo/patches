import { fromDate } from '../api/wire/time.js';
import { afterEach, describe, expect, it, vi } from 'vitest';

const getServerInfo = vi.fn();
const close = vi.fn();

vi.mock('../api/client.js', () => ({
  PatchesApi: vi.fn().mockImplementation(function PatchesApiStub(this: object) {
    return Object.assign(this, { getServerInfo, close });
  }),
}));

const { runPing } = await import('./ping.js');

afterEach(() => {
  vi.clearAllMocks();
});

const TARGET = '127.0.0.1:50051';

describe('runPing', () => {
  it('reports ok:true with server info on a successful round trip', async () => {
    getServerInfo.mockResolvedValue({
      serverVersion: '0.1.0',
      protocolVersion: 1,
      minClientVersion: '0.1.0',
      instanceName: 'patches-dev',
      serverTime: fromDate(new Date('2026-01-01T00:00:00.000Z')),
      features: ['system.ping'],
    });

    const result = await runPing({ target: TARGET, insecure: true });
    const parsed: Record<string, unknown> = JSON.parse(result.json) as Record<string, unknown>;

    expect(result.exitCode).toBe(0);
    expect(parsed.ok).toBe(true);
    expect(parsed.target).toBe(TARGET);
    expect((parsed.server as Record<string, unknown>).version).toBe('0.1.0');
    expect((parsed.server as Record<string, unknown>).instanceName).toBe('patches-dev');
    expect((parsed.server as Record<string, unknown>).serverTime).toBe('2026-01-01T00:00:00.000Z');
  });

  it('always closes the client, even on success', async () => {
    getServerInfo.mockResolvedValue({
      serverVersion: '0.1.0',
      protocolVersion: 1,
      minClientVersion: '0.1.0',
      instanceName: 'patches-dev',
      serverTime: fromDate(new Date()),
      features: [],
    });

    await runPing({ target: TARGET, insecure: true });
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('reports ok:false with a friendly error and exit code 1 on failure', async () => {
    const grpcError = Object.assign(new Error('unavailable'), {
      code: 14, // UNAVAILABLE
      details: 'connection refused',
    });
    getServerInfo.mockRejectedValue(grpcError);

    const result = await runPing({ target: TARGET, insecure: true });
    const parsed: Record<string, unknown> = JSON.parse(result.json) as Record<string, unknown>;

    expect(result.exitCode).toBe(1);
    expect(parsed.ok).toBe(false);
    expect(parsed.target).toBe(TARGET);
    expect(parsed.error).toBeDefined();
    // Never a raw stack trace or gRPC status string in what a human reads (spec §81).
    expect(result.json).not.toContain('    at ');
  });

  it('closes the client even when the call fails', async () => {
    getServerInfo.mockRejectedValue(new Error('boom'));
    await runPing({ target: TARGET, insecure: true });
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('always includes the client name and TUI version', async () => {
    getServerInfo.mockRejectedValue(new Error('boom'));
    const result = await runPing({ target: TARGET, insecure: true });
    const parsed: Record<string, unknown> = JSON.parse(result.json) as Record<string, unknown>;
    const client = parsed.client as Record<string, unknown>;

    expect(client.name).toBe('tui');
    expect(typeof client.version).toBe('string');
  });
});
