import type { NextFunction, Request, Response } from 'express';

const ALLOWED_METHODS = 'POST, OPTIONS';
/** `sendBeacon`'s `Blob` sets `Content-Type` itself; the `fetch` fallback sets it explicitly
 * too (`apps/web/src/lib/webVitals.ts`) — nothing else needs to cross this boundary. */
const ALLOWED_HEADERS = 'Content-Type';

/**
 * CORS for `POST /ingest/web-vitals` only (B-182), same shape as
 * `transport/connect/cors.ts`'s `connectCorsMiddleware` but scoped to this one route instead
 * of the `/patches.v1.*` prefix, and with a minimal allow-list (no auth/request-id headers —
 * this endpoint is unauthenticated by design). `application/json` is not a CORS-safelisted
 * content type, so the browser preflights this route's cross-origin `POST`s with an `OPTIONS`
 * request; without a response here that preflight fails and the browser never sends the real
 * request at all.
 *
 * Never emits `Access-Control-Allow-Credentials` and never echoes back `*`: only an origin
 * literally present in `webOrigins` gets a response naming it, same policy as the Connect
 * edge's own CORS middleware.
 */
export function webVitalsCorsMiddleware(webOrigins: readonly string[]) {
  const allowed = new Set(webOrigins);
  return (req: Request, res: Response, next: NextFunction): void => {
    if (req.path !== '/ingest/web-vitals') {
      next();
      return;
    }

    const origin = req.headers.origin;
    if (typeof origin === 'string' && allowed.has(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
      res.setHeader('Access-Control-Allow-Methods', ALLOWED_METHODS);
      res.setHeader('Access-Control-Allow-Headers', ALLOWED_HEADERS);
      res.setHeader('Access-Control-Max-Age', '7200');
    }

    if (req.method === 'OPTIONS') {
      res.statusCode = 204;
      res.end();
      return;
    }
    next();
  };
}
