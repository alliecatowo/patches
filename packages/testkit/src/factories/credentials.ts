import { hash as argon2Hash, type Algorithm } from '@node-rs/argon2';
import { Credential } from '@patches/database';
import type { EntityManager } from 'typeorm';

/**
 * `Algorithm.Argon2id`, written as its literal value — same reasoning as
 * `apps/server/src/modules/auth/password-hasher.service.ts`: the enum is an ambient
 * `const enum` in `@node-rs/argon2`'s `.d.ts`, and `isolatedModules` forbids reading a member
 * of one.
 */
const ARGON2ID = 2 as Algorithm;

export interface CreateTestPasswordCredentialOptions {
  userId: string;
  /** Defaults to a fixed, obviously-fake string — callers that assert on the exact password
   * should pass their own. */
  password?: string;
  label?: string | null;
}

/**
 * A `PASSWORD` credential with a **real** Argon2id hash, for the rare test that needs a
 * DB-seeded account to actually pass `Login`'s `PasswordHasher.verify()` check.
 *
 * {@link createTestCredential} in `./identity.ts` is what almost every fixture should use —
 * it stores an obviously-fake `$argon2id$fake$...` string, because Argon2id is deliberately
 * slow (§34) and a fixture that pays that cost per row makes the whole suite slow for no
 * benefit. But `$argon2id$fake$...` is not a hash `@node-rs/argon2`'s `verify()` can parse at
 * all — it throws, `PasswordHasher.verify()` catches that and returns `false`, and `Login`
 * rejects as `UNAUTHENTICATED` indistinguishably from a wrong password (§166's uniform
 * response). A test that seeds a user via the DB-only factories and then calls the real
 * `Login` RPC needs this factory instead, and should prefer the real `Register` RPC (via
 * `registerTestActor`-shaped helpers) unless it specifically wants to skip registration's
 * side effects.
 *
 * Cost parameters match `PasswordHasher`'s OWASP-baseline default (m=19456 KiB, t=2, p=1) —
 * not configurable here, since a fixture has no `AppConfigService` to read a deployment's
 * tuned values from, and the default is what every test environment actually runs with.
 */
export async function createTestPasswordCredential(
  manager: EntityManager,
  options: CreateTestPasswordCredentialOptions,
): Promise<{ credential: Credential; password: string }> {
  const password = options.password ?? 'a-perfectly-fine-password';
  const secretHash = await argon2Hash(password, {
    algorithm: ARGON2ID,
    memoryCost: 19456,
    timeCost: 2,
    parallelism: 1,
  });

  const credentials = manager.getRepository(Credential);
  const credential = await credentials.save(
    credentials.create({
      userId: options.userId,
      type: 'PASSWORD',
      identifier: null,
      secretHash,
      publicMaterial: null,
      label: options.label ?? null,
    }),
  );
  return { credential, password };
}
