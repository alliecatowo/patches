export { booleanish } from './boolean.js';
export { readDotEnvFile } from './dotenv.js';
export { loadEnv } from './load-env.js';
export { ConfigError } from './errors.js';
export type { ConfigIssue } from './errors.js';

export { baseEnvSchema } from './schemas/base.js';
export type { BaseEnv } from './schemas/base.js';

export { databaseEnvSchema } from './schemas/database.js';
export type { DatabaseEnv } from './schemas/database.js';

export { serverEnvSchema, serverEnvShape } from './schemas/server.js';
export type { ServerEnv } from './schemas/server.js';

export { emailEnvSchema, emailEnvShape } from './schemas/email.js';
export type { EmailEnv } from './schemas/email.js';

export { storageEnvSchema } from './schemas/storage.js';
export type { StorageEnv } from './schemas/storage.js';

export { authEnvSchema, authEnvShape } from './schemas/auth.js';
export type { AuthEnv } from './schemas/auth.js';
