import { hash as argon2Hash, verify as argon2Verify } from '@node-rs/argon2';
import { type Algorithm } from '@node-rs/argon2';
import { Injectable } from '@nestjs/common';

import { AppConfigService } from '../../config/app-config.service.js';

/**
 * `Algorithm.Argon2id`, written as its literal value: the enum is an *ambient* `const enum`
 * in `@node-rs/argon2`'s .d.ts, and `isolatedModules` (which this repo enables, and which SWC
 * requires) forbids reading a member of one.
 */
const ARGON2ID = 2 as Algorithm;

/**
 * Argon2id password hashing (spec §34, ADR 0010).
 *
 * Cost parameters default to the OWASP baseline (m=19456 KiB, t=2, p=1) and are configurable
 * because §34 requires benchmarking on deployment hardware. Raising them later is safe
 * without a migration: the parameters are encoded in each stored hash string, so old hashes
 * keep verifying under the parameters they were created with.
 */
@Injectable()
export class PasswordHasher {
  private readonly options: {
    algorithm: Algorithm;
    memoryCost: number;
    timeCost: number;
    parallelism: number;
  };

  /**
   * A hash of a value nobody knows, used to spend the same CPU time on a login for an account
   * that doesn't exist as on one that does (spec §166's uniform-response requirement applied
   * to timing). Computed once, lazily, and shared.
   */
  private dummyHash: Promise<string> | undefined;

  constructor(config: AppConfigService) {
    this.options = { algorithm: ARGON2ID, ...config.argon2Options };
  }

  async hash(password: string): Promise<string> {
    return argon2Hash(password, this.options);
  }

  /**
   * Verifies `password` against a stored hash. Passing `null`/`undefined` — no such user, or a
   * user with no password credential — still performs a full Argon2id verification against
   * {@link dummyHash} before returning `false`, so response time doesn't reveal which case it
   * was.
   */
  async verify(storedHash: string | null | undefined, password: string): Promise<boolean> {
    if (storedHash === null || storedHash === undefined || storedHash.length === 0) {
      await argon2Verify(await this.dummy(), password).catch(() => false);
      return false;
    }

    // A malformed stored hash is a data problem, not a wrong password, but the caller can do
    // nothing different about it and telling them apart would be an oracle.
    return argon2Verify(storedHash, password, this.options).catch(() => false);
  }

  private async dummy(): Promise<string> {
    this.dummyHash ??= this.hash('argon2id-timing-equalizer-not-a-real-password');
    return this.dummyHash;
  }
}
