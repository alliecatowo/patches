import { AppMeta } from './app-meta.entity.js';

/**
 * Every entity in the schema, imported explicitly (not globbed) so the same array works
 * identically from TS source (CLI, tests) and from the built dist (ESM + CJS). Phase 1
 * appends `users`, `actors`, `posts`, ... here.
 */
export const ALL_ENTITIES = [AppMeta] as const;
