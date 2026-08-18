import { CreateAppMeta1755400000000 } from './1755400000000-CreateAppMeta.js';
import { Phase1Schema1787036506325 } from './1787036506325-Phase1Schema.js';
import { Phase3SocialGraph1787055340075 } from './1787055340075-Phase3SocialGraph.js';
import { Phase4Interactions1787058326261 } from './1787058326261-Phase4Interactions.js';
import { ActorRegistrationIdempotency1787059787165 } from './1787059787165-ActorRegistrationIdempotency.js';
import { Phase6Admin1787062075716 } from './1787062075716-Phase6Admin.js';
import { Phase45Pages1787062912872 } from './1787062912872-Phase45Pages.js';

/**
 * Every migration, imported explicitly and listed in chronological order — not globbed.
 *
 * TypeORM's usual `migrations: [__dirname + "/migrations/*{.ts,.js}"]` glob works
 * differently from `src` (running `.ts` under the CLI's TS loader) vs `dist` (running
 * built `.js`), which is exactly the kind of environment-dependent behavior that's easy to
 * get subtly wrong (e.g. picking up stale/duplicate migrations, or missing a `.cjs`
 * extension). An explicit array sidesteps that entirely: this file itself is compiled
 * import-for-import by tsup into both `dist/migrations/index.js` (ESM) and
 * `dist/migrations/index.cjs` (CJS), so the array is correct in every context without any
 * runtime path/glob detection.
 */
export const ALL_MIGRATIONS = [
  CreateAppMeta1755400000000,
  Phase1Schema1787036506325,
  Phase3SocialGraph1787055340075,
  Phase4Interactions1787058326261,
  ActorRegistrationIdempotency1787059787165,
  Phase6Admin1787062075716,
  Phase45Pages1787062912872,
];
