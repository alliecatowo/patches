import { randomUUID } from 'node:crypto';

import { type AuthGrpcClient, type RegisterRequest, type RegisterResponse } from '@patches/proto';
import { mintInvite } from '@patches/testkit';
import type { DataSource } from 'typeorm';

import { callUnary } from './test-server.js';

/**
 * Shared fixtures for the posts/actors/feeds integration suites — every one of them needs at
 * least one authenticated local actor.
 */

export { mintInvite };

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
    inviteCode: overrides.inviteCode ?? (await mintInvite(dataSource.manager, inviterUserId)),
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
