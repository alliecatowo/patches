import { Injectable, Logger } from '@nestjs/common';

import { AppConfigService } from '../../config/app-config.service.js';
import { parseBoundedJson } from './security/bounded-json.js';
import { defaultSafeFetchPolicy, safeFetch, SafeFetchError } from './security/safe-fetch.js';
import {
  ACTIVITY_JSON_CONTENT_TYPE,
  LD_JSON_AS2_CONTENT_TYPE,
  MAX_INBOUND_BODY_BYTES,
  SAFE_FETCH_MAX_REDIRECTS,
  SAFE_FETCH_TIMEOUT_MS,
} from './federation.constants.js';
import { PeerRateLimiterService } from './security/peer-rate-limiter.service.js';

export type ActivityPubObject = Record<string, unknown>;

export class RemoteObjectFetchError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
  ) {
    super(message);
  }
}

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

interface NegativeCacheEntry {
  expiresAt: number;
}

interface TokenBucket {
  tokens: number;
  lastRefill: number;
}

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const NEGATIVE_CACHE_TTL_MS = 60 * 1000; // 1 minute
const ORIGIN_BUDGET_WINDOW_MS = 60 * 1000; // 1 minute
const ORIGIN_BUDGET_LIMIT = 30; // requests per window
const MAX_OBJECT_BYTES = MAX_INBOUND_BODY_BYTES; // 1 MB

@Injectable()
export class RemoteObjectService {
  private readonly logger = new Logger(RemoteObjectService.name);

  private readonly objectCache = new Map<string, CacheEntry<ActivityPubObject>>();
  private readonly negativeCache = new Map<string, NegativeCacheEntry>();
  private readonly originBuckets = new Map<string, TokenBucket>();

  constructor(
    private readonly config: AppConfigService,
    private readonly peerRateLimiter: PeerRateLimiterService,
  ) {}

  /**
   * Fetches an ActivityPub object by URI.
   * Returns null for 404/410 (and caches the negative result).
   * Throws RemoteObjectFetchError for other failures.
   * Never used for DM paths.
   */
  async fetchObject(uri: string): Promise<ActivityPubObject | null> {
    this.assertNotDmUri(uri);

    const cached = this.getFromCache(uri);
    if (cached !== undefined) return cached;

    const negative = this.getFromNegativeCache(uri);
    if (negative !== undefined) return null;

    const origin = this.getOrigin(uri);
    if (!this.consumeOriginBudget(origin)) {
      throw new RemoteObjectFetchError(`Origin budget exceeded for ${origin}`, 429);
    }

    try {
      const object = await this.fetchWithValidation(uri);
      if (object !== null) {
        this.setCache(uri, object);
      }
      return object;
    } catch (error) {
      if (
        error instanceof RemoteObjectFetchError &&
        (error.status === 404 || error.status === 410)
      ) {
        this.setNegativeCache(uri);
        return null;
      }
      throw error;
    }
  }

  private async fetchWithValidation(uri: string): Promise<ActivityPubObject | null> {
    let response: Awaited<ReturnType<typeof safeFetch>>;
    try {
      response = await safeFetch(uri, {
        method: 'GET',
        headers: {
          accept: `${ACTIVITY_JSON_CONTENT_TYPE}, ${LD_JSON_AS2_CONTENT_TYPE}`,
        },
        maxBytes: MAX_OBJECT_BYTES,
        maxRedirects: SAFE_FETCH_MAX_REDIRECTS,
        timeoutMs: SAFE_FETCH_TIMEOUT_MS,
        policy: defaultSafeFetchPolicy(this.config.isProduction),
      });
    } catch (error) {
      // safeFetch's own rejections (URL/policy/IP-guard/redirect/size/timeout failures) are
      // surfaced through this service's single error type — callers catch one thing.
      if (error instanceof SafeFetchError) {
        throw new RemoteObjectFetchError(`Fetch failed: ${error.message}`);
      }
      throw error;
    }

    if (response.status === 404 || response.status === 410) {
      throw new RemoteObjectFetchError(`Object not found (${response.status})`, response.status);
    }

    if (response.status !== 200) {
      throw new RemoteObjectFetchError(
        `Fetch failed with status ${response.status}`,
        response.status,
      );
    }

    const contentType = this.getContentType(response.headers);
    if (!this.isValidContentType(contentType)) {
      throw new RemoteObjectFetchError(`Invalid Content-Type: ${contentType || 'missing'}`, 415);
    }

    const text = response.body.toString('utf8');
    let parsed: unknown;
    try {
      parsed = parseBoundedJson(text);
    } catch (error) {
      if (error instanceof Error) {
        throw new RemoteObjectFetchError(`JSON parse error: ${error.message}`, 400);
      }
      throw new RemoteObjectFetchError('JSON parse error', 400);
    }

    if (!this.isValidActivityPubObject(parsed)) {
      throw new RemoteObjectFetchError('Response is not a valid ActivityPub object', 400);
    }

    return parsed as ActivityPubObject;
  }

  private getContentType(headers: Record<string, string | string[] | undefined>): string | null {
    const ct = headers['content-type'];
    if (ct === undefined) return null;
    const value = Array.isArray(ct) ? ct[0] : ct;
    return value ?? null;
  }

  private isValidContentType(contentType: string | null): boolean {
    if (contentType === null) return false;
    const mimeType = contentType.split(';')[0]?.trim().toLowerCase() ?? '';
    return mimeType === ACTIVITY_JSON_CONTENT_TYPE || mimeType === 'application/ld+json';
  }

  private isValidActivityPubObject(value: unknown): boolean {
    if (value === null || typeof value !== 'object') return false;
    const obj = value as Record<string, unknown>;
    return typeof obj.id === 'string' && typeof obj.type === 'string';
  }

  private getOrigin(uri: string): string {
    try {
      return new URL(uri).origin;
    } catch {
      return 'unknown';
    }
  }

  private consumeOriginBudget(origin: string): boolean {
    const now = Date.now();
    const bucket = this.originBuckets.get(origin);

    if (bucket === undefined || bucket.lastRefill + ORIGIN_BUDGET_WINDOW_MS <= now) {
      if (bucket === undefined && this.originBuckets.size >= 5000) {
        for (const [key, b] of this.originBuckets) {
          if (b.lastRefill + ORIGIN_BUDGET_WINDOW_MS <= now) this.originBuckets.delete(key);
        }
        if (this.originBuckets.size >= 5000) return false;
      }
      this.originBuckets.set(origin, { tokens: ORIGIN_BUDGET_LIMIT - 1, lastRefill: now });
      return true;
    }

    if (bucket.tokens <= 0) return false;
    bucket.tokens -= 1;
    return true;
  }

  private getFromCache(uri: string): ActivityPubObject | undefined {
    const entry = this.objectCache.get(uri);
    if (entry === undefined) return undefined;
    if (entry.expiresAt <= Date.now()) {
      this.objectCache.delete(uri);
      return undefined;
    }
    return entry.value;
  }

  private setCache(uri: string, object: ActivityPubObject): void {
    if (this.objectCache.size >= 10000) {
      const now = Date.now();
      for (const [key, entry] of this.objectCache) {
        if (entry.expiresAt <= now) this.objectCache.delete(key);
      }
      if (this.objectCache.size >= 10000) {
        const firstKey = this.objectCache.keys().next().value;
        if (firstKey !== undefined) this.objectCache.delete(firstKey);
      }
    }
    this.objectCache.set(uri, { value: object, expiresAt: Date.now() + CACHE_TTL_MS });
  }

  private getFromNegativeCache(uri: string): NegativeCacheEntry | undefined {
    const entry = this.negativeCache.get(uri);
    if (entry === undefined) return undefined;
    if (entry.expiresAt <= Date.now()) {
      this.negativeCache.delete(uri);
      return undefined;
    }
    return entry;
  }

  private setNegativeCache(uri: string): void {
    if (this.negativeCache.size >= 5000) {
      const now = Date.now();
      for (const [key, entry] of this.negativeCache) {
        if (entry.expiresAt <= now) this.negativeCache.delete(key);
      }
      if (this.negativeCache.size >= 5000) {
        const firstKey = this.negativeCache.keys().next().value;
        if (firstKey !== undefined) this.negativeCache.delete(firstKey);
      }
    }
    this.negativeCache.set(uri, { expiresAt: Date.now() + NEGATIVE_CACHE_TTL_MS });
  }

  private assertNotDmUri(uri: string): void {
    let url: URL;
    try {
      url = new URL(uri);
    } catch {
      return;
    }
    if (url.pathname.includes('/direct-messages') || url.pathname.includes('/dm/')) {
      throw new RemoteObjectFetchError('Remote object fetch must not be used for DM paths', 400);
    }
  }

  /** Clears all caches (for testing). */
  clearCaches(): void {
    this.objectCache.clear();
    this.negativeCache.clear();
    this.originBuckets.clear();
  }
}
