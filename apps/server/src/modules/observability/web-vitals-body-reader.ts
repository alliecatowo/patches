import type { IncomingMessage } from 'node:http';

/** Thrown when the request stream exceeds `maxBytes` — the controller maps this to `413`. */
export class BodyTooLargeError extends Error {
  constructor() {
    super('request body exceeded the configured byte limit');
    this.name = 'BodyTooLargeError';
  }
}

/**
 * Collects a request body into one `Buffer`, enforcing `maxBytes` itself rather than relying
 * on a body-parser's limit — this HTTP app runs with Nest's `bodyParser: false` (`main.ts`,
 * ADR 0016 §"bodyParser: false") so nothing upstream has consumed or size-capped the stream
 * yet. Same technique as `modules/federation/http/raw-body.middleware.ts`'s
 * `rawBodyCollector`, reimplemented here as a `Promise` (not Express middleware) since this
 * controller is the only consumer and needs no `req.rawBody` side channel.
 */
export function readBoundedBody(req: IncomingMessage, maxBytes: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let received = 0;
    let rejected = false;

    req.on('data', (chunk: Buffer) => {
      if (rejected) return;
      received += chunk.length;
      if (received > maxBytes) {
        rejected = true;
        req.destroy();
        reject(new BodyTooLargeError());
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (!rejected) resolve(Buffer.concat(chunks));
    });
    req.on('error', (error: Error) => {
      if (!rejected) reject(error);
    });
  });
}
