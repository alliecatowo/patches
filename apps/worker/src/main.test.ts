import { afterEach, describe, expect, it, vi } from 'vitest';

const savedKeys = process.env.AUTH_CODE_DELIVERY_KEYS;
const savedActiveKey = process.env.AUTH_CODE_DELIVERY_ACTIVE_KEY_ID;

afterEach(() => {
  if (savedKeys === undefined) delete process.env.AUTH_CODE_DELIVERY_KEYS;
  else process.env.AUTH_CODE_DELIVERY_KEYS = savedKeys;
  if (savedActiveKey === undefined) delete process.env.AUTH_CODE_DELIVERY_ACTIVE_KEY_ID;
  else process.env.AUTH_CODE_DELIVERY_ACTIVE_KEY_ID = savedActiveKey;
  vi.resetModules();
});

describe('worker ESM bootstrap ordering', () => {
  it('does not evaluate AppModule before bootstrap can load dotenv', async () => {
    delete process.env.AUTH_CODE_DELIVERY_KEYS;
    delete process.env.AUTH_CODE_DELIVERY_ACTIVE_KEY_ID;
    vi.resetModules();

    await expect(import('./main.js')).resolves.toHaveProperty('loadDotEnv');
  });
});
