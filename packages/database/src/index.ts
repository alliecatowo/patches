export { createDataSource, createDataSourceOptions } from './data-source.js';
export type { CreateDataSourceOptionsInput } from './data-source.js';

export { SnakeNamingStrategy } from './naming/snake-naming.strategy.js';

export { ALL_ENTITIES } from './entities/index.js';
export { AppMeta } from './entities/app-meta.entity.js';

export { ALL_MIGRATIONS } from './migrations/index.js';
export { CreateAppMeta1755400000000 } from './migrations/1755400000000-CreateAppMeta.js';

export { runMigrationsForTests } from './testing/run-migrations-for-tests.js';
