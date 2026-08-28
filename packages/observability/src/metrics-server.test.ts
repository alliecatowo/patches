import { request } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';

import { startMetricsServer, stopMetricsServer } from './metrics-server.js';
import { metricsRegistry } from './metrics.js';

function get(
  port: number,
  path: string,
): Promise<{ status: number; contentType: string | undefined; body: string }> {
  return new Promise((resolve, reject) => {
    const req = request({ host: '127.0.0.1', port, path, method: 'GET' }, (res) => {
      let body = '';
      res.on('data', (chunk: Buffer) => {
        body += chunk.toString('utf8');
      });
      res.on('end', () => {
        resolve({
          status: res.statusCode ?? 0,
          contentType: res.headers['content-type'],
          body,
        });
      });
    });
    req.on('error', reject);
    req.end();
  });
}

describe('startMetricsServer / stopMetricsServer', () => {
  afterEach(async () => {
    await stopMetricsServer();
  });

  it('serves the registry content-type and body on /metrics', async () => {
    const server = await startMetricsServer(0);
    const { port } = server.address() as AddressInfo;

    const response = await get(port, '/metrics');

    expect(response.status).toBe(200);
    expect(response.contentType).toBe(metricsRegistry.contentType);
    expect(response.body).toContain('patches_');
  });

  it('serves a 200 JSON body on /healthz', async () => {
    const server = await startMetricsServer(0);
    const { port } = server.address() as AddressInfo;

    const response = await get(port, '/healthz');

    expect(response.status).toBe(200);
    expect(response.contentType).toBe('application/json');
    expect(JSON.parse(response.body)).toEqual({ status: 'ok' });
  });

  it('serves a 404 for any other path', async () => {
    const server = await startMetricsServer(0);
    const { port } = server.address() as AddressInfo;

    const response = await get(port, '/nope');

    expect(response.status).toBe(404);
  });

  it('start is idempotent when called again with the same requested port', async () => {
    const first = await startMetricsServer(0);
    const second = await startMetricsServer(0);

    expect(second).toBe(first);
  });

  it('rejects loudly when asked to start a second server on a different port (issue #226)', async () => {
    const first = await startMetricsServer(0);
    const { port } = first.address() as AddressInfo;
    const otherPort = port === 65535 ? port - 1 : port + 1;

    await expect(startMetricsServer(otherPort)).rejects.toThrow(/already listening/);
  });

  it('stop is a no-op when no server is running', async () => {
    await expect(stopMetricsServer()).resolves.toBeUndefined();
  });

  it('stop then start again binds a fresh server (stop is not a no-op once one was started)', async () => {
    const first = await startMetricsServer(0);
    const firstPort = (first.address() as AddressInfo).port;
    await stopMetricsServer();

    const second = await startMetricsServer(0);
    expect(second).not.toBe(first);
    await expect(get(firstPort, '/healthz')).rejects.toThrow();
  });
});
