import { createServer, type Server } from 'node:http';
import { metricsRegistry } from './metrics.js';

let metricsServer: Server | undefined;

export async function startMetricsServer(port: number = 9090): Promise<Server> {
  if (metricsServer) {
    return metricsServer;
  }

  return new Promise((resolve, reject) => {
    metricsServer = createServer((req, res) => {
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

    metricsServer.on('error', (error) => {
      reject(error);
    });

    metricsServer.listen(port, () => {
      resolve(metricsServer!);
    });
  });
}

export async function stopMetricsServer(): Promise<void> {
  if (metricsServer) {
    return new Promise((resolve) => {
      metricsServer!.close(() => {
        metricsServer = undefined;
        resolve();
      });
    });
  }
}
