import type { IncomingMessage, ServerResponse } from 'node:http';

export interface RequestWithRawBody extends IncomingMessage {
  rawBody?: Buffer;
}

/**
 * Collects the exact request body bytes onto `req.rawBody`, enforcing `maxBytes` itself
 * (P8-006's inbox body cap) rather than relying on a body-parser's own limit — this node
 * needs the *exact* bytes (not a parser's re-serialization) to verify the `Digest` header
 * (P8-005), so a raw collector replaces `express.json()` entirely on this HTTP app rather
 * than running alongside it.
 */
export function rawBodyCollector(maxBytes: number) {
  return (req: RequestWithRawBody, res: ServerResponse, next: (err?: unknown) => void): void => {
    const chunks: Buffer[] = [];
    let received = 0;
    let rejected = false;

    req.on('data', (chunk: Buffer) => {
      if (rejected) return;
      received += chunk.length;
      if (received > maxBytes) {
        rejected = true;
        res.statusCode = 413;
        res.end('Payload too large');
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (rejected) return;
      req.rawBody = Buffer.concat(chunks);
      next();
    });
    req.on('error', (error: Error) => {
      next(error);
    });
  };
}
