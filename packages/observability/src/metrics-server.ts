import { createServer, type Server } from 'node:http';
import { metricsRegistry } from './metrics.js';

let metricsServer: Server | undefined;
let metricsServerPort: number | undefined;

/**
 * Starts (or, if one is already listening, returns) the `/metrics`+`/healthz` HTTP server.
 *
 * A second call while a server is already listening on a *different* port throws rather than
 * silently returning the first server on the first port (issue #226 defect 1) — a caller that
 * asked for port B and got back a server still bound to port A needs to know that, not discover
 * it later from a connection failure.
 */
export async function startMetricsServer(port: number = 9090): Promise<Server> {
  if (metricsServer) {
    if (metricsServerPort !== port) {
      throw new Error(
        `Metrics server is already listening on port ${String(metricsServerPort)}; cannot ` +
          `start a second one on port ${port}. Call stopMetricsServer() first.`,
      );
    }
    return metricsServer;
  }

  return new Promise((resolve, reject) => {
    // Tracks whether `listen()`'s callback has already resolved this promise — an `error` event
    // after that point (e.g. a socket error on an already-accepted connection) must be reported,
    // not silently dropped, but it is also too late to `reject()` a promise the caller has
    // already resolved (issue #226 defect 2).
    let listening = false;

    const server = createServer((req, res) => {
      if (req.url === '/metrics') {
        void (async () => {
          try {
            res.setHeader('Content-Type', metricsRegistry.contentType);
            const metrics = await metricsRegistry.metrics();
            res.end(metrics);
          } catch (error) {
            res.statusCode = 500;
            res.end(
              `Error generating metrics: ${error instanceof Error ? error.message : String(error)}`,
            );
          }
        })();
      } else if (req.url === '/healthz') {
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ status: 'ok' }));
      } else {
        res.statusCode = 404;
        res.end('Not Found');
      }
    });

    server.on('error', (error) => {
      if (!listening) {
        reject(error);
        return;
      }
      // This package has no logger of its own (`@patches/observability` is what *provides*
      // logging/metrics infrastructure to its consumers); a post-startup socket error must
      // still surface somewhere rather than vanish.
      console.error('[observability] Metrics server error after startup:', error);
    });

    server.listen(port, () => {
      listening = true;
      metricsServer = server;
      metricsServerPort = port;
      resolve(server);
    });
  });
}

export async function stopMetricsServer(): Promise<void> {
  if (metricsServer) {
    return new Promise((resolve) => {
      metricsServer!.close(() => {
        metricsServer = undefined;
        metricsServerPort = undefined;
        resolve();
      });
    });
  }
}
