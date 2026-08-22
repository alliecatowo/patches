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

describe('server ESM bootstrap ordering', () => {
  it('does not evaluate AppModule before bootstrap has a chance to load dotenv', async () => {
    delete process.env.AUTH_CODE_DELIVERY_KEYS;
    delete process.env.AUTH_CODE_DELIVERY_ACTIVE_KEY_ID;
    vi.resetModules();

    // AppModule validates these required values at module-evaluation time. Importing main
    // successfully with them absent proves AppModule is no longer a static ESM dependency;
    // bootstrap loads the repo-root .env before dynamically importing it.
    await expect(import('./main.js')).resolves.toHaveProperty('loadDotEnv');
  });
});
