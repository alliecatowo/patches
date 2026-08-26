import type * as Argon2 from '@node-rs/argon2';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import type { AppConfigService } from '../../config/app-config.service.js';
import { PasswordHasher } from './password-hasher.service.js';

/**
 * Wraps the real `verify` export in a spy so tests can assert it was actually invoked (and with
 * what argument) without touching its behaviour — `importOriginal` returns the genuine
 * `@node-rs/argon2` binding, so every call still runs a real Argon2id verification. This package
 * is CJS (no top-level `await`), so the mocked module is fetched lazily in `beforeAll`.
 */
vi.mock('@node-rs/argon2', async (importOriginal) => {
  const actual = await importOriginal<typeof Argon2>();
  return { ...actual, verify: vi.fn(actual.verify) };
});

let verifySpy: ReturnType<typeof vi.mocked<typeof Argon2.verify>>;

beforeAll(async () => {
  const argon2 = await import('@node-rs/argon2');
  verifySpy = vi.mocked(argon2.verify);
});

/**
 * Argon2id at the OWASP baseline takes roughly 50–100ms per call by design, so this suite
 * stays deliberately small — the parameters, not the throughput, are what matter.
 */
function hasher(): PasswordHasher {
  // Stands in for the config service; only `argon2Options` is read.
  const config = { argon2Options: { memoryCost: 19_456, timeCost: 2, parallelism: 1 } };
  return new PasswordHasher(config as unknown as AppConfigService);
}

describe('PasswordHasher', () => {
  it('produces an Argon2id hash carrying the OWASP baseline parameters (§34)', async () => {
    const hash = await hasher().hash('correct horse battery staple');
    expect(hash.startsWith('$argon2id$')).toBe(true);
    expect(hash).toContain('m=19456');
    expect(hash).toContain('t=2');
    expect(hash).toContain('p=1');
    expect(hash).not.toContain('correct horse');
  });

  it('salts every hash, so the same password hashes differently each time', async () => {
    const service = hasher();
    const [a, b] = await Promise.all([
      service.hash('same password'),
      service.hash('same password'),
    ]);
    expect(a).not.toBe(b);
    expect(await service.verify(a, 'same password')).toBe(true);
    expect(await service.verify(b, 'same password')).toBe(true);
  });

  it('verifies the right password and rejects the wrong one', async () => {
    const service = hasher();
    const hash = await service.hash('a good long password');
    expect(await service.verify(hash, 'a good long password')).toBe(true);
    expect(await service.verify(hash, 'a good long passworD')).toBe(false);
  });

  it('returns false, without throwing, for a missing or malformed stored hash', async () => {
    const service = hasher();
    expect(await service.verify(null, 'anything')).toBe(false);
    expect(await service.verify(undefined, 'anything')).toBe(false);
    expect(await service.verify('', 'anything')).toBe(false);
    expect(await service.verify('$argon2id$not-a-real-hash', 'anything')).toBe(false);
  });

  it('runs a real Argon2id verification against the dummy hash for a missing stored hash (spec §166)', async () => {
    const service = hasher();
    verifySpy.mockClear();

    expect(await service.verify(null, 'a wrong password')).toBe(false);

    // The point being protected is that the "no such user" path spends a real KDF call rather
    // than short-circuiting — asserted directly via the spy, not inferred from wall-clock time
    // (which the old version of this test compared across two runs and was flaky under
    // concurrent scheduling, see B-194).
    expect(verifySpy).toHaveBeenCalledTimes(1);
    const [suppliedHash] = verifySpy.mock.calls[0] ?? [];
    expect(typeof suppliedHash).toBe('string');
    expect((suppliedHash as string).startsWith('$argon2id$')).toBe(true);
  });
});
