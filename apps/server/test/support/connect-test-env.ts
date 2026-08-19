/**
 * Sets `WEB_ORIGINS` before `config.module.ts` is first imported in whichever test file
 * imports this — must be that file's *first* import (ES modules evaluate static imports in
 * source order, depth-first, before the importing module's own top-level code runs; see
 * `env.ts`'s doc comment on the same ordering constraint for `prepareServerEnv`). Only
 * `connect.integration.test.ts` needs a non-default `WEB_ORIGINS` (its CORS assertions);
 * every other integration test file leaves it at the schema default (empty) and never
 * imports this.
 */
export const CONNECT_TEST_ALLOWED_ORIGIN = 'http://allowed.test';

process.env.WEB_ORIGINS ??= CONNECT_TEST_ALLOWED_ORIGIN;
