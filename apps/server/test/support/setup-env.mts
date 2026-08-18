import { prepareServerEnv } from './env.js';

// Top-level await: Vitest evaluates setup files to completion before importing any test file,
// so every module in the suite sees a fully prepared environment. See `env.ts` for why the
// ordering matters.
await prepareServerEnv();
