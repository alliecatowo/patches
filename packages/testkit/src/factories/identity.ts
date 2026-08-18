import { randomUUID } from 'node:crypto';
import { Actor, Credential, Invite, User } from '@patches/database';
import type { CredentialType } from '@patches/database';
import type { EntityManager } from 'typeorm';
import { randomEmail, randomHandle } from '../random.js';

/**
 * Fixture factories (`INITIAL_VISION.md` §118). Every factory takes the `EntityManager` the
 * caller is already using — inside `withTransactionRollback`, that is the transaction-scoped
 * manager, so fixtures roll back with the test instead of leaking into the next one.
 */

export interface CreateTestActorOptions {
  handle?: string;
  displayName?: string | null;
  isLocal?: boolean;
  userId?: string | null;
}

/**
 * An actor with no account attached (`user_id` null) — the shape a remote/federated actor
 * has, and enough to author posts. Use {@link createTestUser} when the test needs to log in.
 */
export async function createTestActor(
  manager: EntityManager,
  options: CreateTestActorOptions = {},
): Promise<Actor> {
  const handle = options.handle ?? randomHandle();
  return manager.getRepository(Actor).save(
    manager.getRepository(Actor).create({
      handle,
      handleNormalized: handle.toLowerCase(),
      displayName: options.displayName ?? handle,
      isLocal: options.isLocal ?? true,
      userId: options.userId ?? null,
    }),
  );
}

export interface CreateTestUserOptions extends CreateTestActorOptions {
  recoveryEmail?: string | null;
  emailVerified?: boolean;
}

/**
 * A full local account: the `actors` row and the `users` row that points at it.
 *
 * The three-step insert exists because `users.actor_id` and `actors.user_id` reference each
 * other (§20–21). Neither FK is deferrable, so the actor is created first with a null
 * `user_id`, then the user, then the actor is back-filled — the same order application code
 * has to use.
 */
export async function createTestUser(
  manager: EntityManager,
  options: CreateTestUserOptions = {},
): Promise<{ user: User; actor: Actor }> {
  const actor = await createTestActor(manager, options);

  const recoveryEmail = options.recoveryEmail === undefined ? randomEmail() : options.recoveryEmail;
  const users = manager.getRepository(User);
  const user = await users.save(
    users.create({
      recoveryEmail,
      recoveryEmailNormalized: recoveryEmail === null ? null : recoveryEmail.toLowerCase(),
      emailVerifiedAt: options.emailVerified === false ? null : new Date(),
      status: 'ACTIVE',
      actorId: actor.id,
    }),
  );

  await manager.getRepository(Actor).update({ id: actor.id }, { userId: user.id });
  actor.userId = user.id;

  return { user, actor };
}

export interface CreateTestCredentialOptions {
  userId: string;
  type?: CredentialType;
  identifier?: string;
  /** Argon2id hash (PASSWORD only) — fixtures use an obviously-fake placeholder. */
  secretHash?: string | null;
  /** OpenSSH public key blob (SSH_PUBLIC_KEY only). */
  publicMaterial?: string | null;
  label?: string | null;
}

/**
 * One login method for a user (§165). Defaults to a `PASSWORD` credential whose `secret_hash`
 * is a clearly-fake placeholder — factories never run a real KDF (Argon2id is deliberately
 * slow, and a fixture that costs 100ms is a test suite nobody runs).
 */
export async function createTestCredential(
  manager: EntityManager,
  options: CreateTestCredentialOptions,
): Promise<Credential> {
  const type = options.type ?? 'PASSWORD';
  const credentials = manager.getRepository(Credential);
  return credentials.save(
    credentials.create({
      userId: options.userId,
      type,
      // PASSWORD credentials have no identifier: login resolves the user by handle or
      // verified recovery email first (§165).
      identifier: options.identifier ?? (type === 'PASSWORD' ? null : `SHA256:${randomUUID()}`),
      secretHash:
        options.secretHash === undefined
          ? type === 'PASSWORD'
            ? `$argon2id$fake$${randomUUID()}`
            : null
          : options.secretHash,
      publicMaterial:
        options.publicMaterial === undefined
          ? type === 'SSH_PUBLIC_KEY'
            ? `ssh-ed25519 AAAAfake${randomUUID()}`
            : null
          : options.publicMaterial,
      label: options.label ?? null,
    }),
  );
}

export interface CreateTestInviteOptions {
  createdByUserId: string;
  codeHash?: string;
  maxUses?: number;
  uses?: number;
  expiresAt?: Date | null;
  note?: string | null;
}

export async function createTestInvite(
  manager: EntityManager,
  options: CreateTestInviteOptions,
): Promise<Invite> {
  const invites = manager.getRepository(Invite);
  return invites.save(
    invites.create({
      createdByUserId: options.createdByUserId,
      codeHash: options.codeHash ?? `fake-invite-hash-${randomUUID()}`,
      maxUses: options.maxUses ?? 1,
      uses: options.uses ?? 0,
      expiresAt: options.expiresAt ?? null,
      note: options.note ?? null,
    }),
  );
}
