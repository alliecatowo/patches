import { createHash, randomUUID } from 'node:crypto';

import { type AuthGrpcClient, type RegisterRequest, type RegisterResponse } from '@patches/proto';
import type { DataSource } from 'typeorm';

import { callUnary } from './test-server.js';

/**
 * Shared fixtures for the posts/actors/feeds integration suites — every one of them needs at
 * least one authenticated local actor.
 *
 * `mintInvite` mirrors `test/auth.integration.test.ts`'s private helper of the same name
 * rather than importing it: that file is outside this task's owned file set, and the helper
 * is three lines of raw SQL, not logic worth coupling two test files over.
 */

function sha256Hex(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

/** Mints a usable invite code and stores only its hash, exactly as `patches-admin` would. */
export async function mintInvite(
  dataSource: DataSource,
  createdByUserId: string,
  maxUses = 1,
): Promise<string> {
  const code = `invite-${randomUUID()}`;
  await dataSource.query(
    'INSERT INTO invites (code_hash, created_by_user_id, max_uses, uses) VALUES ($1, $2, $3, 0)',
    [sha256Hex(code), createdByUserId, maxUses],
  );
  return code;
}

export interface TestActor {
  actorId: string;
  handle: string;
  accessToken: string;
}

/** A short, unique-enough suffix so concurrently-running tests never collide on a handle. */
export function testSuffix(): string {
  return randomUUID().replace(/-/g, '').slice(0, 10);
}

/**
 * Registers a fresh local account over the real `AuthService` and returns enough to act as it.
 * Going through the real RPC — rather than `@patches/testkit`'s DB-only factory — is what
 * produces an access token `AuthGuard` actually accepts.
 */
export async function registerTestActor(
  auth: AuthGrpcClient,
  dataSource: DataSource,
  inviterUserId: string,
  overrides: Partial<RegisterRequest> = {},
): Promise<TestActor> {
  const suffix = testSuffix();
  const handle = overrides.handle ?? `actor${suffix}`;
  const response = await callUnary<RegisterRequest, RegisterResponse>(auth.register.bind(auth), {
    handle,
    displayName: overrides.displayName ?? 'Integration Test Actor',
    email: overrides.email ?? `${handle}@example.test`,
    password: overrides.password ?? 'a-perfectly-fine-password',
    inviteCode: overrides.inviteCode ?? (await mintInvite(dataSource, inviterUserId)),
    clientRequestId: overrides.clientRequestId ?? randomUUID(),
    sshPublicKey: overrides.sshPublicKey ?? '',
    privacyNoticeVersionAcknowledged: overrides.privacyNoticeVersionAcknowledged ?? 0,
  });

  const actor = response.session?.actor;
  const accessToken = response.session?.accessToken;
  if (actor === undefined || accessToken === undefined) {
    throw new Error('Register did not return a session with an actor.');
  }
  return { actorId: actor.id, handle, accessToken };
}
