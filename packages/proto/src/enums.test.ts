import { describe, expect, it } from 'vitest';

import { CredentialType, GitHubLoginStatus } from './generated/patches/v1/auth.js';
import { RegistrationMode } from './generated/patches/v1/node.js';
import { PostType, PostVisibility } from './generated/patches/v1/posts.js';
import { FollowState } from './generated/patches/v1/social_graph.js';
import {
  CREDENTIAL_TYPE,
  FOLLOW_STATE,
  GITHUB_LOGIN_STATUS,
  POST_TYPE,
  POST_VISIBILITY,
  REGISTRATION_MODE,
} from './enums.js';

/**
 * `enums.ts` hand-mirrors these enum values so `index.ts` can export them as plain runtime
 * values without importing `@nestjs/microservices` (see the comment in `enums.ts`). This
 * test is what makes that safe: any `.proto` enum change that isn't reflected in the mirror
 * fails here instead of silently drifting.
 */
function generatedValues(enumObject: Record<string, string>): string[] {
  return Object.values(enumObject)
    .filter((value) => value !== 'UNRECOGNIZED')
    .sort();
}

describe('hand-mirrored enums stay in sync with the generated proto enums', () => {
  it('POST_TYPE matches PostType', () => {
    expect(Object.values(POST_TYPE).sort()).toEqual(generatedValues(PostType));
  });

  it('POST_VISIBILITY matches PostVisibility', () => {
    expect(Object.values(POST_VISIBILITY).sort()).toEqual(generatedValues(PostVisibility));
  });

  it('CREDENTIAL_TYPE matches CredentialType', () => {
    expect(Object.values(CREDENTIAL_TYPE).sort()).toEqual(generatedValues(CredentialType));
  });

  it('GITHUB_LOGIN_STATUS matches GitHubLoginStatus', () => {
    expect(Object.values(GITHUB_LOGIN_STATUS).sort()).toEqual(generatedValues(GitHubLoginStatus));
  });

  it('FOLLOW_STATE matches FollowState', () => {
    expect(Object.values(FOLLOW_STATE).sort()).toEqual(generatedValues(FollowState));
  });

  it('REGISTRATION_MODE matches RegistrationMode', () => {
    expect(Object.values(REGISTRATION_MODE).sort()).toEqual(generatedValues(RegistrationMode));
  });
});
