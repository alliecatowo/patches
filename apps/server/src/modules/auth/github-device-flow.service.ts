import { Injectable, Logger } from '@nestjs/common';

import { AppConfigService } from '../../config/app-config.service.js';

/**
 * The outbound-HTTP half of GitHub's OAuth device flow (spec §167). This is the first place
 * the server ever calls a third party, so every request here is bounded (`GITHUB_HTTP_TIMEOUT_MS`,
 * spec §176) and every response is read as untrusted input, never assumed well-formed.
 *
 * Nothing here decides what a result *means* for a Patches session — that's
 * `AuthService.beginGitHubLogin`/`pollGitHubLogin`. This service only knows how to talk to
 * GitHub.
 */

export interface DeviceCodeResult {
  deviceCode: string;
  userCode: string;
  verificationUri: string;
  /** GitHub's own minimum seconds between polls. */
  intervalSeconds: number;
  expiresAt: Date;
}

export type TokenPollResult =
  | { kind: 'PENDING' }
  | { kind: 'SLOW_DOWN' }
  | { kind: 'EXPIRED' }
  | { kind: 'DENIED' }
  /** The access token is returned to the caller exactly once, for exactly one use
   * (`fetchNumericAccountId`) — `AuthService` must never persist it. */
  | { kind: 'SUCCESS'; accessToken: string };

@Injectable()
export class GitHubDeviceFlowService {
  private readonly logger = new Logger(GitHubDeviceFlowService.name);

  constructor(private readonly config: AppConfigService) {}

  /** GitHub scope requested for device-flow login: read-only, just enough to read the
   * account's numeric id (spec §167 — "GitHub is a credential, never an identity"). */
  private static readonly SCOPE = 'read:user';

  async beginDeviceFlow(clientId: string): Promise<DeviceCodeResult> {
    const body = await this.postForm(this.config.githubDeviceCodeUrl, {
      client_id: clientId,
      scope: GitHubDeviceFlowService.SCOPE,
    });

    const deviceCode = requireString(body, 'device_code');
    const userCode = requireString(body, 'user_code');
    const verificationUri = requireString(body, 'verification_uri');
    const expiresIn = requireNumber(body, 'expires_in');
    const interval = requireNumber(body, 'interval');

    return {
      deviceCode,
      userCode,
      verificationUri,
      intervalSeconds: interval,
      expiresAt: new Date(Date.now() + expiresIn * 1000),
    };
  }

  async pollAccessToken(clientId: string, deviceCode: string): Promise<TokenPollResult> {
    const body = await this.postForm(this.config.githubTokenUrl, {
      client_id: clientId,
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
          `unexpected GitHub device-flow token response: error=${error ?? '(none)'}`,
        );
        // An unrecognized-but-not-successful response is treated as still pending rather than
        // a hard failure: GitHub's device-flow error set has grown before (e.g.
        // `incorrect_device_code`) and a transient unknown value should not kill the poll
        // loop the client is already running on its own retry schedule.
        return { kind: 'PENDING' };
    }
  }

  /**
   * Reads the numeric GitHub account id and nothing else (spec §167: "identifier = numeric
   * account id ... never trusts login name"). The token is used exactly once, here, and the
   * caller must not retain it afterward.
   */
  async fetchNumericAccountId(accessToken: string): Promise<string> {
    const response = await this.fetchWithTimeout(this.config.githubUserApiUrl, {
      method: 'GET',
      headers: {
        authorization: `Bearer ${accessToken}`,
        accept: 'application/vnd.github+json',
        'user-agent': 'patches-server',
      },
    });
    if (!response.ok) {
      throw new Error(`GitHub user lookup failed with status ${String(response.status)}`);
    }
    const body: unknown = await response.json();
    const id = requireNumber(body, 'id');
    return String(Math.trunc(id));
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
      throw new Error(`GitHub request to ${url} failed with status ${String(response.status)}`);
    }
    return response.json();
  }

  private async fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
    const controller = new AbortController();
    const timeout = setTimeout(() => {
      controller.abort();
    }, this.config.githubHttpTimeoutMs);
    try {
      return await fetch(url, { ...init, signal: controller.signal });
    } finally {
      clearTimeout(timeout);
    }
  }
}

function requireString(body: unknown, key: string): string {
  const value = optionalString(body, key);
  if (value === undefined) throw new Error(`GitHub response is missing "${key}"`);
  return value;
}

function optionalString(body: unknown, key: string): string | undefined {
  if (typeof body !== 'object' || body === null) return undefined;
  const value = (body as Record<string, unknown>)[key];
  return typeof value === 'string' ? value : undefined;
}

function requireNumber(body: unknown, key: string): number {
  if (typeof body !== 'object' || body === null) {
    throw new Error(`GitHub response is missing "${key}"`);
  }
  const value = (body as Record<string, unknown>)[key];
  if (typeof value === 'number') return value;
  if (typeof value === 'string' && value.trim().length > 0 && !Number.isNaN(Number(value))) {
    return Number(value);
  }
  throw new Error(`GitHub response is missing "${key}"`);
}
