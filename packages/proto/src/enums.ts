/**
 * Hand-maintained mirrors of proto3 enum values, for the ESM `@patches/proto` entry point
 * (`index.ts`) to export as runtime values without pulling `@nestjs/microservices` in.
 *
 * Every ts-proto `nestJs=true` generated file (`generated/patches/v1/*.ts`) unconditionally
 * imports `GrpcMethod`/`GrpcStreamMethod` from `@nestjs/microservices` for its controller
 * decorators (confirmed by inspecting `dist/index.js` after a build): exporting even a
 * single *value* — not just a type — from one of those files pulls that import along with
 * it, defeating the "importing the root never drags Nest in" guarantee documented in
 * `index.ts`/`tsup.config.ts`. Enum *types* are unaffected — `export type` is erased at
 * compile time — only enum *values* need this workaround.
 *
 * Each mirror's exact value set is asserted equal to the corresponding generated enum by
 * `enums.test.ts`, so this can never silently drift from the `.proto` source of truth. The
 * `as PostTypeT` casts are safe: `stringEnums=true` (buf.gen.yaml) makes every generated
 * enum member's runtime value identical to its own name, so these string literals and the
 * generated enum are wire-identical — the cast just restates that fact for the type checker.
 */
import type {
  CredentialType as CredentialTypeT,
  GitHubLoginStatus as GitHubLoginStatusT,
} from './generated/patches/v1/auth.js';
import type {
  PostType as PostTypeT,
  PostVisibility as PostVisibilityT,
} from './generated/patches/v1/posts.js';

export const POST_TYPE = {
  UNSPECIFIED: 'POST_TYPE_UNSPECIFIED' as PostTypeT,
  NOTE: 'POST_TYPE_NOTE' as PostTypeT,
  LINK: 'POST_TYPE_LINK' as PostTypeT,
} as const;

export const POST_VISIBILITY = {
  UNSPECIFIED: 'POST_VISIBILITY_UNSPECIFIED' as PostVisibilityT,
  PUBLIC: 'POST_VISIBILITY_PUBLIC' as PostVisibilityT,
  UNLISTED: 'POST_VISIBILITY_UNLISTED' as PostVisibilityT,
  FOLLOWERS: 'POST_VISIBILITY_FOLLOWERS' as PostVisibilityT,
} as const;

export const CREDENTIAL_TYPE = {
  UNSPECIFIED: 'CREDENTIAL_TYPE_UNSPECIFIED' as CredentialTypeT,
  PASSWORD: 'CREDENTIAL_TYPE_PASSWORD' as CredentialTypeT,
  SSH_PUBLIC_KEY: 'CREDENTIAL_TYPE_SSH_PUBLIC_KEY' as CredentialTypeT,
  GITHUB: 'CREDENTIAL_TYPE_GITHUB' as CredentialTypeT,
} as const;

export const GITHUB_LOGIN_STATUS = {
  UNSPECIFIED: 'GIT_HUB_LOGIN_STATUS_UNSPECIFIED' as GitHubLoginStatusT,
  PENDING: 'GIT_HUB_LOGIN_STATUS_PENDING' as GitHubLoginStatusT,
  SLOW_DOWN: 'GIT_HUB_LOGIN_STATUS_SLOW_DOWN' as GitHubLoginStatusT,
  EXPIRED: 'GIT_HUB_LOGIN_STATUS_EXPIRED' as GitHubLoginStatusT,
  DENIED: 'GIT_HUB_LOGIN_STATUS_DENIED' as GitHubLoginStatusT,
  COMPLETE: 'GIT_HUB_LOGIN_STATUS_COMPLETE' as GitHubLoginStatusT,
} as const;
