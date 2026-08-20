import { Injectable, Logger } from '@nestjs/common';

import { AppConfigService, type OidcProviderConfig } from '../../config/app-config.service.js';

/**
 * The outbound-HTTP half of a generic OIDC device flow (P15-006) — GitLab, Codeberg, or any
 * other provider a node operator configures via `OIDC_PROVIDERS`. Same shape and same
 * boundedness as `GitHubDeviceFlowService` (spec §176's "outbound HTTP call to a third party
 * is bounded"), parameterized by the provider's own URLs/credentials instead of GitHub's fixed
 * ones.
 *
 * Nothing here decides what a result *means* for a Patches session — that's
 * `AuthService.beginOidcLogin`/`pollOidcLogin`. This service only knows how to talk to one
 * OIDC provider at a time, identified by the `OidcProviderConfig` passed into each call.
 */

export interface OidcDeviceCodeResult {
  deviceCode: string;
  userCode: string;
  verificationUri: string;
  /** The provider's own minimum seconds between polls. */
  intervalSeconds: number;
  expiresAt: Date;
}

export type OidcTokenPollResult =
  | { kind: 'PENDING' }
  | { kind: 'SLOW_DOWN' }
  | { kind: 'EXPIRED' }
  | { kind: 'DENIED' }
  /** The access token is returned to the caller exactly once, for exactly one use
   * (`fetchSubject`) — `AuthService` must never persist it. */
  | { kind: 'SUCCESS'; accessToken: string };

@Injectable()
export class OidcDeviceFlowService {
  private readonly logger = new Logger(OidcDeviceFlowService.name);

  constructor(private readonly config: AppConfigService) {}

  /** RFC 8628 §3.1 minimal scope: just enough to read the userinfo `sub` (spec §167's "a
   * credential, never an identity", extended to any OIDC provider by P15-006). A provider that
   * requires a broader scope to reach its userinfo endpoint can still be configured — this is
   * a default request, not an enforced ceiling. */
  private static readonly SCOPE = 'openid';

  async beginDeviceFlow(provider: OidcProviderConfig): Promise<OidcDeviceCodeResult> {
    const body = await this.postForm(provider.deviceAuthorizationUrl, {
      client_id: provider.clientId,
      client_secret: provider.clientSecret,
      scope: OidcDeviceFlowService.SCOPE,
    });

    const deviceCode = requireString(body, 'device_code');
    const userCode = requireString(body, 'user_code');
    const verificationUri = requireVerificationUri(body);
    const expiresIn = requireNumber(body, 'expires_in');
    const interval = optionalNumber(body, 'interval') ?? 5;

    return {
      deviceCode,
      userCode,
      verificationUri,
      intervalSeconds: interval,
      expiresAt: new Date(Date.now() + expiresIn * 1000),
    };
  }

  async pollAccessToken(
    provider: OidcProviderConfig,
    deviceCode: string,
  ): Promise<OidcTokenPollResult> {
    const body = await this.postForm(provider.tokenUrl, {
      client_id: provider.clientId,
      client_secret: provider.clientSecret,
      device_code: deviceCode,
      grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
    });

    const accessToken = optionalString(body, 'access_token');
    if (accessToken !== undefined) return { kind: 'SUCCESS', accessToken };

    const error = optionalString(body, 'error');
    switch (error) {
      case 'authorization_pending':
        return { kind: 'PENDING' };
      case 'slow_down':
        return { kind: 'SLOW_DOWN' };
      case 'expired_token':
        return { kind: 'EXPIRED' };
      case 'access_denied':
        return { kind: 'DENIED' };
      default:
        this.logger.warn(
          `unexpected OIDC device-flow token response for provider "${provider.id}": ` +
            `error=${error ?? '(none)'}`,
        );
        // Same reasoning as `GitHubDeviceFlowService.pollAccessToken`: an unrecognized-but-not-
        // successful response is treated as still pending rather than a hard failure, since the
        // client is already running its own retry schedule.
        return { kind: 'PENDING' };
    }
  }

  /**
   * Reads the OIDC `sub` claim from the provider's userinfo endpoint and nothing else — never
   * `preferred_username`/`email`/`name`, which a provider lets an account holder change (same
   * reasoning as `GitHubDeviceFlowService.fetchNumericAccountId` reading only the numeric
   * account id, never the login name). The token is used exactly once, here, and the caller
   * must not retain it afterward.
   */
  async fetchSubject(provider: OidcProviderConfig, accessToken: string): Promise<string> {
    const response = await this.fetchWithTimeout(provider.userinfoUrl, {
      method: 'GET',
      headers: {
        authorization: `Bearer ${accessToken}`,
        accept: 'application/json',
        'user-agent': 'patches-server',
      },
    });
    if (!response.ok) {
      throw new Error(
        `OIDC userinfo lookup for provider "${provider.id}" failed with status ${String(response.status)}`,
      );
    }
    const body: unknown = await response.json();
    return requireString(body, 'sub');
  }

  private async postForm(url: string, params: Record<string, string>): Promise<unknown> {
    const response = await this.fetchWithTimeout(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        accept: 'application/json',
      },
      body: new URLSearchParams(params).toString(),
    });
    if (!response.ok) {
      throw new Error(`OIDC request to ${url} failed with status ${String(response.status)}`);
    }
    return response.json();
  }

  private async fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
    const controller = new AbortController();
    const timeout = setTimeout(() => {
      controller.abort();
    }, this.config.oidcHttpTimeoutMs);
    try {
      return await fetch(url, { ...init, signal: controller.signal });
    } finally {
      clearTimeout(timeout);
    }
  }
}

function requireString(body: unknown, key: string): string {
  const value = optionalString(body, key);
  if (value === undefined) throw new Error(`OIDC response is missing "${key}"`);
  return value;
}

function optionalString(body: unknown, key: string): string | undefined {
  if (typeof body !== 'object' || body === null) return undefined;
  const value = (body as Record<string, unknown>)[key];
  return typeof value === 'string' ? value : undefined;
}

function requireNumber(body: unknown, key: string): number {
  if (typeof body !== 'object' || body === null) {
    throw new Error(`OIDC response is missing "${key}"`);
  }
  const value = (body as Record<string, unknown>)[key];
  if (typeof value === 'number') return value;
  if (typeof value === 'string' && value.trim().length > 0 && !Number.isNaN(Number(value))) {
    return Number(value);
  }
  throw new Error(`OIDC response is missing "${key}"`);
}

function optionalNumber(body: unknown, key: string): number | undefined {
  if (typeof body !== 'object' || body === null) return undefined;
  const value = (body as Record<string, unknown>)[key];
  if (typeof value === 'number') return value;
  if (typeof value === 'string' && value.trim().length > 0 && !Number.isNaN(Number(value))) {
    return Number(value);
  }
  return undefined;
}

/** RFC 8628 names this field `verification_uri`, but some providers (GitLab included) answer
 * `verification_url` instead — accepted as a fallback rather than treated as a hard schema
 * violation, since this is a real interop wrinkle between providers, not a Patches choice. */
function requireVerificationUri(body: unknown): string {
  const uri = optionalString(body, 'verification_uri') ?? optionalString(body, 'verification_url');
  if (uri === undefined) {
    throw new Error('OIDC response is missing "verification_uri"');
  }
  return uri;
}
