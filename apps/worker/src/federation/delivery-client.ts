import { createHash, createSign } from 'node:crypto';
import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { lookup as dnsLookup } from 'node:dns/promises';
import { isIP } from 'node:net';

/**
 * The worker's half of P8-005/P8-006's outbound HTTP hardening — `computeDigestHeader`/
 * `signRequest` (`draft-cavage-http-signatures-12`) and a DNS-rebinding-safe `safeFetch`,
 * used by `FederationDeliverHandler` to actually sign and POST a `FEDERATION_DELIVER` job's
 * activity.
 *
 * **Deliberately duplicated** from `apps/server/src/modules/federation/{signatures,
 * security}/*` rather than imported: `apps/worker` and `apps/server` are separate app
 * packages (not `packages/*`), and this repo has no cross-app-`src` import convention (spec
 * §128-129's layering is about `packages/*` boundaries, but two Nest *apps* importing each
 * other's `src` is exactly the kind of coupling that convention exists to prevent). Extracting
 * a shared `packages/federation-core` (sign/digest/safeFetch only — no server-only pieces
 * like inbox processing or DB access) is a clean follow-up filed in this task's report; until
 * then, this file and the server's equivalents must be changed together.
 */

export function computeDigestHeader(body: Buffer | string): string {
  const hash = createHash('sha256').update(body).digest('base64');
  return `SHA-256=${hash}`;
}

export interface SignRequestInput {
  method: string;
  target: string;
  host: string;
  date: string;
  digest: string;
  keyId: string;
  privateKeyPem: string;
}

export function signRequest(input: SignRequestInput): string {
  const signingString = [
    `(request-target): ${input.method.toLowerCase()} ${input.target}`,
    `host: ${input.host}`,
    `date: ${input.date}`,
    `digest: ${input.digest}`,
  ].join('\n');
  const signature = createSign('RSA-SHA256')
    .update(signingString)
    .end()
    .sign(input.privateKeyPem, 'base64');
  return `keyId="${input.keyId}",algorithm="rsa-sha256",headers="(request-target) host date digest",signature="${signature}"`;
}

// ---------------------------------------------------------------- safe fetch (P8-006)

function parseIPv4(value: string): [number, number, number, number] | undefined {
  const parts = value.split('.');
  if (parts.length !== 4) return undefined;
  const octets: number[] = [];
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return undefined;
    const n = Number(part);
    if (n > 255) return undefined;
    octets.push(n);
  }
  return octets as [number, number, number, number];
}

function isDisallowedIPv4(octets: readonly [number, number, number, number]): boolean {
  const [a, b] = octets;
  if (a === 0) return true;
  if (a === 10) return true;
  if (a === 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  if (a >= 224) return true;
  return false;
}

function isDisallowedIPv6(value: string): boolean {
  const normalized = value.toLowerCase();
  if (normalized === '::1' || normalized === '::') return true;
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(normalized);
  if (mapped?.[1] !== undefined) {
    const v4 = parseIPv4(mapped[1]);
    return v4 !== undefined && isDisallowedIPv4(v4);
  }
  const firstGroup = normalized.split(':')[0] ?? '';
  if (firstGroup.length === 0) return false;
  const value16 = Number.parseInt(firstGroup.padEnd(4, '0').slice(0, 4), 16);
  if (Number.isNaN(value16)) return false;
  const topByte = (value16 >> 8) & 0xff;
  if (topByte === 0xfc || topByte === 0xfd) return true;
  if (value16 >= 0xfe80 && value16 <= 0xfebf) return true;
  return false;
}

function isDisallowedIp(ip: string, allowPrivateNetworks: boolean): boolean {
  if (allowPrivateNetworks) return false;
  const v4 = parseIPv4(ip);
  if (v4 !== undefined) return isDisallowedIPv4(v4);
  return isDisallowedIPv6(ip);
}

export interface SafeFetchPolicy {
  allowHttp: boolean;
  allowPrivateNetworks: boolean;
}

export function defaultSafeFetchPolicy(isProduction: boolean): SafeFetchPolicy {
  return { allowHttp: !isProduction, allowPrivateNetworks: !isProduction };
}

export class SafeFetchError extends Error {}

export interface SafeFetchOptions {
  method?: string;
  headers?: Record<string, string>;
  body?: Buffer | string;
  timeoutMs?: number;
  maxBytes?: number;
  policy: SafeFetchPolicy;
}

export interface SafeFetchResult {
  status: number;
  headers: Record<string, string | string[] | undefined>;
  body: Buffer;
}

const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_MAX_BYTES = 1024 * 1024;

/** POST-only, no-redirect-following safe client — a `FEDERATION_DELIVER` job always targets
 * one specific inbox URL directly; a redirect there is treated as a delivery failure (logged,
 * retried with backoff like any other), not silently followed. */
export async function safeFetch(url: string, options: SafeFetchOptions): Promise<SafeFetchResult> {
  const parsed = safeParseUrl(url, options.policy);
  const pinnedIp = await resolvePinnedIp(parsed.hostname, options.policy);
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const requestFn = parsed.protocol === 'https:' ? httpsRequest : httpRequest;

  return new Promise((resolve, reject) => {
    const req = requestFn(
      {
        protocol: parsed.protocol,
        hostname: parsed.hostname,
        port: parsed.port === '' ? undefined : parsed.port,
        path: `${parsed.pathname}${parsed.search}`,
        method: options.method ?? 'POST',
        headers: options.headers,
        lookup: (_hostname, _opts, callback) => {
          callback(null, pinnedIp.address, pinnedIp.family);
        },
        timeout: timeoutMs,
      },
      (res) => {
        const status = res.statusCode ?? 0;
        const chunks: Buffer[] = [];
        let received = 0;
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
  if (candidates.length === 0) throw new SafeFetchError(`Could not resolve "${hostname}".`);
  const disallowed = candidates.find((candidate) =>
    isDisallowedIp(candidate.address, policy.allowPrivateNetworks),
  );
  if (disallowed !== undefined) {
    throw new SafeFetchError(`"${hostname}" resolves to a disallowed address.`);
  }
  const chosen = candidates[0];
  if (chosen === undefined) throw new SafeFetchError(`Could not resolve "${hostname}".`);
  return chosen;
}
