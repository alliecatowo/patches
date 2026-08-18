import { describe, expect, it } from 'vitest';
import { assertTestDatabaseUrl } from './create-test-data-source.js';

// A-003 / INITIAL_VISION.md §119: createTestDataSource() drops the entire schema, so the
// guard in front of it is the only thing standing between a mistyped env var and someone's
// development database.
describe('assertTestDatabaseUrl', () => {
  it('accepts a database whose name ends in _test', () => {
    expect(() =>
      assertTestDatabaseUrl('postgres://patches:patches@127.0.0.1:5432/patches_test'),
    ).not.toThrow();
  });

  it('refuses the development database', () => {
    expect(() =>
      assertTestDatabaseUrl('postgres://patches:patches@127.0.0.1:5432/patches'),
    ).toThrow(/must end in "_test"/);
  });

  it('refuses a name that merely contains _test', () => {
    expect(() =>
      assertTestDatabaseUrl('postgres://patches:patches@127.0.0.1:5432/patches_test_backup'),
    ).toThrow(/must end in "_test"/);
  });

  it('refuses a string that is not a URL at all', () => {
    expect(() => assertTestDatabaseUrl('patches_test')).toThrow(/not a valid database URL/);
  });
});
