import type { NextFunction, Request, Response } from 'express';
import { cors as connectCors } from '@connectrpc/connect';
import { ERROR_CODE_METADATA_KEY, METADATA_KEYS } from '@patches/proto';

/** Custom headers this app sends/reads on top of Connect's own protocol headers (which
 * `connectCors.allowedHeaders`/`.exposedHeaders` already cover) — the `cors.ts` doc comment
 * on the `@connectrpc/connect` export explicitly calls out adding these (ADR 0016 §6/§7). */
const APP_ALLOWED_REQUEST_HEADERS: readonly string[] = [
  METADATA_KEYS.authorization,
  METADATA_KEYS.requestId,
  METADATA_KEYS.client,
  METADATA_KEYS.clientVersion,
];
const APP_EXPOSED_RESPONSE_HEADERS: readonly string[] = [
  ERROR_CODE_METADATA_KEY,
  METADATA_KEYS.requestId,
];

const ALLOWED_METHODS = connectCors.allowedMethods.join(', ');
const ALLOWED_HEADERS = [...connectCors.allowedHeaders, ...APP_ALLOWED_REQUEST_HEADERS].join(', ');
const EXPOSED_HEADERS = [...connectCors.exposedHeaders, ...APP_EXPOSED_RESPONSE_HEADERS].join(', ');

/**
 * CORS for the Connect edge only (ADR 0016 §6) — scoped to `/patches.v1.*` inside the
 * handler itself rather than via Express's `app.use(path, ...)` mount-path matching, since
 * these paths contain dots (`patches.v1.SystemService/GetServerInfo`) rather than `/`
 * segments, and mount-path prefix matching is documented as segment-boundary-aware, not a
 * plain string prefix — deliberately not relying on that here. `/healthz` and the
 * federation HTTP surface never see these headers.
 *
 * Never emits `Access-Control-Allow-Credentials` (ADR 0016 §5: bearer tokens only, no
 * cookies — credentials mode is off, full stop) and never echoes back `*`: only an origin
 * literally present in `webOrigins` gets a response naming it, so a disallowed origin's
 * preflight gets no CORS headers at all and the browser blocks the real request itself.
 */
export function connectCorsMiddleware(webOrigins: readonly string[]) {
  const allowed = new Set(webOrigins);
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.path.startsWith('/patches.v1.')) {
      next();
      return;
    }

    const origin = req.headers.origin;
    if (typeof origin === 'string' && allowed.has(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
      res.setHeader('Access-Control-Allow-Methods', ALLOWED_METHODS);
      res.setHeader('Access-Control-Allow-Headers', ALLOWED_HEADERS);
      res.setHeader('Access-Control-Expose-Headers', EXPOSED_HEADERS);
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
