import { describe, expect, it } from 'vitest';
import { getMetadataArgsStorage } from 'typeorm';
import { ALL_ENTITIES } from './index.js';

/**
 * Guard for the build-tooling decision documented in the package README: this package
 * builds with tsup (esbuild), which does not emit `emitDecoratorMetadata`. TypeORM only
 * needs that metadata to infer a `@Column()`'s SQL type by reflecting the TS property
 * type — so as long as every column on every entity specifies `type` explicitly, the
 * column-type inference path (the only thing `emitDecoratorMetadata` would be needed for
 * here) is never exercised, and the esbuild-built dist is correct. This test fails loudly
 * if a future entity forgets to specify `type`, instead of failing silently/differently
 * only in the built dist depending on the runtime.
 */
describe('every entity column specifies an explicit type', () => {
  const targets = new Set<unknown>(ALL_ENTITIES);
  const columns = getMetadataArgsStorage().columns.filter((column) => targets.has(column.target));

  it('found at least one column to check (guards against an empty/broken filter)', () => {
    expect(columns.length).toBeGreaterThan(0);
  });

  it.each(columns.map((column) => [describeColumn(column), column] as const))(
    '%s has an explicit type',
    (_label, column) => {
      expect(column.options.type).toBeDefined();
    },
  );
});

function describeColumn(column: { target: unknown; propertyName: string }): string {
  const targetName =
    typeof column.target === 'function' ? column.target.name : String(column.target);
  return `${targetName}.${column.propertyName}`;
}
