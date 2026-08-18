import { describe, expect, it } from 'vitest';
import { DataSource } from 'typeorm';
import { createDataSource, createDataSourceOptions } from './data-source.js';
import { SnakeNamingStrategy } from './naming/snake-naming.strategy.js';
import { ALL_ENTITIES } from './entities/index.js';
import { ALL_MIGRATIONS } from './migrations/index.js';

const url = 'postgres://patches:patches@127.0.0.1:5432/patches';

describe('createDataSourceOptions', () => {
  it('hard-codes synchronize and migrationsRun to false, regardless of input', () => {
    const options = createDataSourceOptions({ url });
    expect(options.synchronize).toBe(false);
    expect(options.migrationsRun).toBe(false);
  });

  it('cannot be made to enable synchronize — there is no input field for it', () => {
    // Type-level guarantee: `CreateDataSourceOptionsInput` has no `synchronize` property,
    // so there is nothing a caller could pass to flip it. This test documents that intent
    // and re-asserts the runtime value as a belt-and-suspenders check (spec §153: "No
    // `synchronize: true`").
    const options = createDataSourceOptions({ url, ssl: true, poolMax: 50, logging: true });
    expect(options.synchronize).toBe(false);
  });

  it('defaults ssl to false, poolMax to 10, logging to false', () => {
    const options = createDataSourceOptions({ url });
    expect(options.ssl).toBe(false);
    expect(options.extra).toEqual({ max: 10 });
    expect(options.logging).toBe(false);
  });

  it('maps ssl/poolMax/logging inputs through', () => {
    const options = createDataSourceOptions({ url, ssl: true, poolMax: 25, logging: true });
    expect(options.ssl).toEqual({ rejectUnauthorized: true });
    expect(options.extra).toEqual({ max: 25 });
    expect(options.logging).toBe(true);
  });

  it('never disables certificate verification, and takes a private CA instead', () => {
    // A-002 / §101: `rejectUnauthorized: false` would make TLS encryption-without-
    // authentication — no protection against an active MITM. A private/self-signed CA is
    // supplied as a trust anchor instead, which is the actual fix rather than a bypass.
    const options = createDataSourceOptions({
      url,
      ssl: true,
      sslCa: '-----BEGIN CERTIFICATE-----',
    });
    expect(options.ssl).toEqual({
      rejectUnauthorized: true,
      ca: '-----BEGIN CERTIFICATE-----',
    });
  });

  it('wires the snake_case naming strategy', () => {
    const options = createDataSourceOptions({ url });
    expect(options.namingStrategy).toBeInstanceOf(SnakeNamingStrategy);
  });

  it('includes every entity and migration', () => {
    const options = createDataSourceOptions({ url });
    expect(options.entities).toEqual([...ALL_ENTITIES]);
    expect(options.migrations).toEqual(ALL_MIGRATIONS);
  });

  it('is type "postgres" and carries the given url', () => {
    const options = createDataSourceOptions({ url });
    expect(options.type).toBe('postgres');
    expect(options.url).toBe(url);
  });
});

describe('createDataSource', () => {
  it('returns an uninitialized DataSource built from the same options', () => {
    const dataSource = createDataSource({ url });
    expect(dataSource).toBeInstanceOf(DataSource);
    expect(dataSource.isInitialized).toBe(false);
    expect(dataSource.options.synchronize).toBe(false);
  });
});
