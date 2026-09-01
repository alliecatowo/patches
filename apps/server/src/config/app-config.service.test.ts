import type { ConfigService } from '@nestjs/config';
import { describe, expect, it } from 'vitest';

import { type Env } from './env.schema.js';
import { AppConfigService } from './app-config.service.js';

function config(values: Partial<Env>): AppConfigService {
  const stub = {
    get: (key: keyof Env) => values[key],
  } as unknown as ConfigService<Env, true>;
  return new AppConfigService(stub);
}

describe('AppConfigService passkey settings', () => {
  it('falls back to the public origin for existing deployments', () => {
    const service = config({
      PUBLIC_ORIGIN: 'https://patches.example',
      PASSKEY_ORIGINS: [],
      PASSKEY_RP_ID: undefined,
    });

    expect(service.passkeyRpId).toBe('patches.example');
    expect(service.passkeyOrigins).toEqual(['https://patches.example']);
  });

  it('uses split-origin passkey settings when configured', () => {
    const service = config({
      PUBLIC_ORIGIN: 'https://patches-social.fly.dev',
      PASSKEY_RP_ID: 'patches-web.pages.dev',
      PASSKEY_ORIGINS: ['https://patches-web.pages.dev'],
    });

    expect(service.passkeyRpId).toBe('patches-web.pages.dev');
    expect(service.passkeyOrigins).toEqual(['https://patches-web.pages.dev']);
  });
});
