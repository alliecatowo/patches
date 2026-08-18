import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { lookup as dnsLookup } from 'node:dns/promises';
import { isIP } from 'node:net';

import {
  SAFE_FETCH_MAX_REDIRECTS,
  SAFE_FETCH_TIMEOUT_MS,
  MAX_INBOUND_BODY_BYTES,
} from '../federation.constants.js';
import { isDisallowedIp } from './ip-guard.js';

/**
 * The single outbound HTTP client every federation code path uses (P8-006,
 * `INITIAL_VISION.md` §109: URL validation, private/reserved-IP rejection, DNS-rebinding
 * defense, redirect/size/timeout limits). Deliberately built on `node:http`/`node:https`
 * rather than the platform `fetch` (undici): a custom `lookup` is the only way to *pin* the
 * IP address that DNS resolution approved to the actual TCP connection — resolving twice (once
 * to validate, once to connect) is exactly the DNS-rebinding gap §109 calls out by name.
 */

export interface SafeFetchPolicy {
  /** `http:` targets, in addition to `https:` — only for the local two-node lab
   * (`NODE_ENV !== 'production'`), never in production (§109, §104). */
  allowHttp: boolean;
  /** Private/loopback/link-local/reserved IP targets — only for the local two-node lab, where
   * both nodes necessarily resolve to loopback/private addresses. Never in production. */
  allowPrivateNetworks: boolean;
}

export function defaultSafeFetchPolicy(isProduction: boolean): SafeFetchPolicy {
  return { allowHttp: !isProduction, allowPrivateNetworks: !isProduction };
}

export interface SafeFetchOptions {
  method?: string;
  headers?: Record<string, string>;
  body?: Buffer | string;
  timeoutMs?: number;
  maxBytes?: number;
  maxRedirects?: number;
  policy: SafeFetchPolicy;
}

export interface SafeFetchResult {
  status: number;
  headers: Record<string, string | string[] | undefined>;
  body: Buffer;
  finalUrl: string;
}

export class SafeFetchError extends Error {}

export async function safeFetch(url: string, options: SafeFetchOptions): Promise<SafeFetchResult> {
  const maxRedirects = options.maxRedirects ?? SAFE_FETCH_MAX_REDIRECTS;
  let currentUrl = url;
  for (let redirects = 0; ; redirects++) {
    const result = await fetchOnce(currentUrl, options);
    if (result.status >= 300 && result.status < 400) {
      const location = result.headers.location;
      const locationValue = Array.isArray(location) ? location[0] : location;
      if (locationValue === undefined) {
        throw new SafeFetchError(`Redirect (${String(result.status)}) with no Location header.`);
      }
      if (redirects >= maxRedirects) {
        throw new SafeFetchError(`Exceeded ${String(maxRedirects)} redirects.`);
      }
      currentUrl = new URL(locationValue, currentUrl).toString();
      continue;
    }
    return { ...result, finalUrl: currentUrl };
  }
}

async function fetchOnce(
  urlString: string,
  options: SafeFetchOptions,
): Promise<Omit<SafeFetchResult, 'finalUrl'>> {
  const parsed = safeParseUrl(urlString, options.policy);
  const pinnedIp = await resolvePinnedIp(parsed.hostname, options.policy);
  const maxBytes = options.maxBytes ?? MAX_INBOUND_BODY_BYTES;
  const timeoutMs = options.timeoutMs ?? SAFE_FETCH_TIMEOUT_MS;

  const requestFn = parsed.protocol === 'https:' ? httpsRequest : httpRequest;

  return new Promise((resolve, reject) => {
    const req = requestFn(
      {
        protocol: parsed.protocol,
        hostname: parsed.hostname,
        port: parsed.port === '' ? undefined : parsed.port,
        path: `${parsed.pathname}${parsed.search}`,
        method: options.method ?? 'GET',
        headers: options.headers,
        // Pins the connection to the address that was already validated — a second lookup
        // right here is exactly the TOCTOU window DNS rebinding exploits.
        lookup: (_hostname, _opts, callback) => {
          callback(null, pinnedIp.address, pinnedIp.family);
        },
        // Distinct from the response-read timeout below: this bounds connection setup.
        timeout: timeoutMs,
      },
      (res) => {
        const status = res.statusCode ?? 0;
        const chunks: Buffer[] = [];
        let received = 0;
        const contentLengthHeader = res.headers['content-length'];
        if (contentLengthHeader !== undefined && Number(contentLengthHeader) > maxBytes) {
          res.destroy();
          reject(new SafeFetchError(`Response Content-Length exceeds ${String(maxBytes)} bytes.`));
          return;
        }
        res.on('data', (chunk: Buffer) => {
          received += chunk.length;
          if (received > maxBytes) {
            res.destroy();
            reject(new SafeFetchError(`Response body exceeds ${String(maxBytes)} bytes.`));
            return;
          }
          chunks.push(chunk);
        });
        res.on('end', () => {
          resolve({ status, headers: res.headers, body: Buffer.concat(chunks) });
        });
        res.on('error', (error: Error) => {
          reject(error);
        });
      },
    );
    req.on('timeout', () => {
      req.destroy(new SafeFetchError(`Request timed out after ${String(timeoutMs)}ms.`));
    });
    req.on('error', (error: Error) => {
      reject(error);
    });
    if (options.body !== undefined) req.end(options.body);
    else req.end();
  });
}

function safeParseUrl(urlString: string, policy: SafeFetchPolicy): URL {
  let parsed: URL;
  try {
    parsed = new URL(urlString);
  } catch {
    throw new SafeFetchError(`"${urlString}" is not a valid URL.`);
  }
  const allowedSchemes = policy.allowHttp ? ['https:', 'http:'] : ['https:'];
  if (!allowedSchemes.includes(parsed.protocol)) {
    throw new SafeFetchError(`Scheme "${parsed.protocol}" is not allowed.`);
  }
  if (parsed.username.length > 0 || parsed.password.length > 0) {
    throw new SafeFetchError('URLs with embedded credentials are not allowed.');
  }
  return parsed;
}

interface PinnedIp {
  address: string;
  family: 4 | 6;
}

async function resolvePinnedIp(hostname: string, policy: SafeFetchPolicy): Promise<PinnedIp> {
  const literalFamily = isIP(hostname);
  const candidates: PinnedIp[] =
    literalFamily !== 0
      ? [{ address: hostname, family: literalFamily as 4 | 6 }]
      : (await dnsLookup(hostname, { all: true })).map((entry) => ({
          address: entry.address,
          family: entry.family as 4 | 6,
        }));

  if (candidates.length === 0) {
    throw new SafeFetchError(`Could not resolve "${hostname}".`);
  }
  // Every candidate must be allowed, not just one: a host that answers with a mix of public
  // and private addresses is exactly the DNS-rebinding shape §109 defends against, and a
  // caller that picks "the first allowed one" out of a mixed set is trivially bypassed by an
  // attacker who controls answer ordering.
  const disallowed = candidates.find((candidate) =>
    isDisallowedIp(candidate.address, policy.allowPrivateNetworks),
  );
  if (disallowed !== undefined) {
    throw new SafeFetchError(`"${hostname}" resolves to a disallowed address.`);
  }
  const chosen = candidates[0];
  if (chosen === undefined) {
    throw new SafeFetchError(`Could not resolve "${hostname}".`);
  }
  return chosen;
}
