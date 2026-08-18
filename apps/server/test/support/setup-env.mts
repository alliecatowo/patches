import { prepareServerEnv } from './env.js';
import { prepareMediaTestEnv } from './minio-env.js';

// Top-level await: Vitest evaluates setup files to completion before importing any test file,
// so every module in the suite sees a fully prepared environment. See `env.ts` for why the
// ordering matters. `prepareMediaTestEnv()` only fills in `R2_*` defaults when unset — inert
// for every suite except `media.integration.test.ts`, which needs `ConfigModule.forRoot()`
// (evaluated the moment `config.module.js` is imported, not deferred to boot) to already see
// usable object-storage config.
await prepareServerEnv();
prepareMediaTestEnv();
