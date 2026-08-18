import { type FactoryProvider } from '@nestjs/common';

import { readServerVersion } from './server-build.js';

/** DI token for the server's own build version (a plain string, injected — see below). */
export const SERVER_VERSION = Symbol('SERVER_VERSION');

/**
 * Resolves the server's build version exactly once, at module bootstrap, via
 * `readServerVersion()`'s cwd/`__dirname` probe (spec §153/A-009: application code
 * should never reach for the filesystem itself). `SystemService` and anything else
 * that needs the version injects the {@link SERVER_VERSION} token instead of calling
 * `readServerVersion()` directly — this is the single place that probe runs, and the
 * only place a test needs to override to supply a fixed version.
 */
export const serverVersionProvider: FactoryProvider<string> = {
  provide: SERVER_VERSION,
  useFactory: () => readServerVersion(),
};
