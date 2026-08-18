import { describe, expect, it } from 'vitest';

import type { AppConfigService } from '../../config/app-config.service.js';
import { PasswordHasher } from './password-hasher.service.js';

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

  it('spends comparable time on a missing hash as on a real one', async () => {
    const service = hasher();
    const hash = await service.hash('a good long password');
    await service.verify(null, 'warm up the dummy hash');

    const timeOf = async (stored: string | null): Promise<number> => {
      const started = process.hrtime.bigint();
      await service.verify(stored, 'a wrong password');
      return Number(process.hrtime.bigint() - started) / 1e6;
    };

    const real = await timeOf(hash);
    const absent = await timeOf(null);
    // A generous bound: the point is that the "no such user" path runs a real KDF at all,
    // not that two Argon2id runs finish within microseconds of each other on a busy CI box.
    expect(absent).toBeGreaterThan(real / 4);
  });
});
