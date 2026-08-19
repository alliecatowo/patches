import {
  ACCOUNT_DELETION_GRACE_PERIOD_DAYS_DEFAULT,
  APPEAL_WINDOW_DAYS_DEFAULT,
  MAX_POST_CHARS,
  MAX_POST_CHARS_NODE_CEILING,
} from '@patches/domain';
import { z } from 'zod';

import {
  authEnvShape,
  baseEnvSchema,
  booleanish,
  databaseEnvSchema,
  loadEnv,
  serverEnvShape,
  storageEnvSchema,
} from '@patches/config';

export { ConfigError } from '@patches/config';
export type { ConfigIssue } from '@patches/config';

/**
 * Server environment contract (spec §97), composed from `@patches/config`'s shared
 * schema pieces plus the handful of things unique to this app:
 *
 *  - `LOG_LEVEL` uses Nest's `ConsoleLogger` vocabulary (`log`/`verbose`), not
 *    `@patches/config`'s generic one (`debug`/`info`/`warn`/`error`) — see
 *    `common/logging/logger.factory.ts`, which indexes into Nest's `LogLevel` list.
 *  - `DATABASE_URL` is optional here (persistence lands in Phase 1) but must be a
 *    valid Postgres URL once set, and production must always set it.
 *  - auth variables (signing keys, token TTLs, Argon2id cost, `NODE_DOMAIN`) come from
 *    `authEnvShape`; the signing keys are optional in dev but required in production.
 *  - `PUBLIC_ORIGIN` keeps a dev-friendly default; `@patches/config`'s shared shape
 *    leaves it required since not every consumer wants the same default.
 *
 * The app must refuse to boot on malformed configuration — never "fall back to a
 * default and hope".
 */
// Accepts both Nest's vocabulary (`log`/`verbose`) and the shared `@patches/config` one used
// by the worker (`info`), so one `LOG_LEVEL` value can be set app-wide (fly.toml `[env]`).
// `info` is normalised to Nest's `log` (found the hard way: `LOG_LEVEL=info` booted the
// worker and crashed the server, `LOG_LEVEL=log` did the reverse — A-038).
const nestLogLevelSchema = z
  .enum(['error', 'warn', 'info', 'log', 'debug', 'verbose'])
  .default('log')
  .transform((level): 'error' | 'warn' | 'log' | 'debug' | 'verbose' =>
    level === 'info' ? 'log' : level,
  );

const envObjectSchema = z.object({
  ...baseEnvSchema.shape,
  ...databaseEnvSchema.shape,
  ...serverEnvShape,
  // Spread after `serverEnvShape` on purpose: both declare JWT_PRIVATE_KEY/JWT_PUBLIC_KEY and
  // the auth shape's versions are the strict ones (base64-encoded PEM, label-checked).
  ...authEnvShape,
  ...storageEnvSchema.shape,
  LOG_LEVEL: nestLogLevelSchema,
  DATABASE_URL: databaseEnvSchema.shape.DATABASE_URL.optional(),
  PUBLIC_ORIGIN: serverEnvShape.PUBLIC_ORIGIN.default('http://localhost:3000'),

  /** Human-readable instance name reported by SystemService.GetServerInfo. */
  INSTANCE_NAME: z.string().min(1).max(80).default('patches-dev'),

  /**
   * Enables the standard `grpc.reflection.v1alpha.ServerReflection` service (B-006) so
   * `grpcurl -plaintext <host> list`/`describe` work without shipping `.proto` files to
   * whoever's debugging. Dev-only by default — a production server has no business
   * exposing its full schema to anything that can reach the port.
   */
  GRPC_REFLECTION: booleanish().default(false),
  /**
   * Trust the proxy-supplied client address (`fly-client-ip`, then the first
   * `x-forwarded-for` hop) as the caller's peer for rate limiting. Only enable behind a
   * proxy that always sets/overwrites those headers (Fly's edge does); off by default so a
   * direct caller can never spoof its own bucket (A-039).
   */
  TRUST_PROXY_HEADERS: booleanish().default(false),

  /**
   * GitHub OAuth device flow (P6-005, spec §167). Unset in dev/test by default — `AuthService`
   * answers `BeginGitHubLogin`/`PollGitHubLogin` with `NOT_IMPLEMENTED` rather than pretending
   * the flow works with no client id to authenticate as (§176's honest-UNIMPLEMENTED rule,
   * extended past Phase 1's schema-only stub to the real implementation).
   */
  GITHUB_CLIENT_ID: z.string().trim().min(1).optional(),
  /** Overridable so integration tests can point the device flow at a local fake GitHub
   * instead of the real github.com/api.github.com. */
  GITHUB_DEVICE_CODE_URL: z.url().default('https://github.com/login/device/code'),
  GITHUB_TOKEN_URL: z.url().default('https://github.com/login/oauth/access_token'),
  GITHUB_USER_API_URL: z.url().default('https://api.github.com/user'),
  /** Bounds every outbound call the device flow makes — an unbounded fetch to a third party
   * is exactly the kind of request spec §176's "timeout baseline" exists to require. */
  GITHUB_HTTP_TIMEOUT_MS: z.coerce.number().int().positive().default(5000),

  /**
   * Phase 8 two-node federation lab (P8-001..P8-008, `docs/architecture/federation.md`).
   * **Default off** (spec §108 Stage F1, §176's "self-hosted node ships with federation
   * disabled by default"): when false, `FederationHttpModule` (the webfinger/actor/inbox/
   * outbox controllers) is never registered at all — absent from the DI graph, not merely
   * unrouted (ADR 0016 §4, `app.module.ts`). This is a stricter reading than "WebFinger may
   * always be on for discovery" — the whole point of Stage F1 being "local and non-public"
   * (federation.md §3.5) is that a node with federation off has zero new network surface
   * beyond `/healthz` and the Connect edge (ADR 0016), not a smaller one. Nest's own HTTP
   * adapter itself is always-on now (ADR 0016 §4 changed this deliberately — see `main.ts`).
   */
  FEDERATION_ENABLED: booleanish().default(false),
  /** Port for the always-on HTTP listener (ADR 0016): `/healthz`, the Connect edge
   * (`/patches.v1.*`), and — when `FEDERATION_ENABLED` — the federation HTTP surface
   * (WebFinger/actor/inbox/outbox). */
  HTTP_PORT: z.coerce.number().int().min(1).max(65535).default(8080),
  // WEB_ORIGINS (ADR 0016 §6) comes from `serverEnvShape` above — no override needed here.

  /**
   * B-026: AES-256-GCM key `KeyService` encrypts `federation_keys.private_key_*` under —
   * base64-encoded, must decode to exactly 32 bytes (`openssl rand -base64 32`). Optional
   * when federation is off (nothing ever calls `KeyService`); required below when
   * `FEDERATION_ENABLED=true`, since a federating node with no way to decrypt its own signing
   * keys can't federate at all.
   */
  FEDERATION_KEY_ENCRYPTION_KEY: z.string().trim().min(1).optional(),

  /**
   * Amendment B node capability (P11-004, spec §183, §190's `NodeService.GetNodeInfo`
   * `social_capabilities.dm_enabled`). Default on: DMs are in scope per §183's "the gate has
   * passed" — unlike `FEDERATION_ENABLED`, there is no new network surface to gate here, just
   * the `DirectMessageService` write paths, so an operator opts *out* rather than in.
   */
  DM_ENABLED: booleanish().default(true),
  /** 0 means "no retention limit is enforced" (`NodeService.GetNodeInfo`'s
   * `social_capabilities.dm_retention_days` doc, spec §190). No DM retention sweep exists yet
   * — this only ever feeds that advertised capability value in v0. */
  DM_RETENTION_DAYS: z.coerce.number().int().min(0).default(0),

  /**
   * Amendment B (P11-006/P11-008, spec §186.2, §188): the post body ceiling this node
   * currently enforces, published via `NodeService.GetNodeInfo`'s `social_capabilities.
   * max_post_chars`/`limits.post_body_max_chars` and enforced dynamically by
   * `PostService.createPost`/`editPost` (a static zod schema can't read config — see
   * `modules/posts/validation.ts`'s `POST_BODY_MAX_LENGTH` doc). Default 5,000 (`@patches/
   * domain`'s `MAX_POST_CHARS`); a node may raise this up to `MAX_POST_CHARS_NODE_CEILING`
   * (10,000) but never higher — clients must read the limit from the node, never hardcode it.
   */
  MAX_POST_CHARS: z.coerce
    .number()
    .int()
    .min(1)
    .max(MAX_POST_CHARS_NODE_CEILING)
    .default(MAX_POST_CHARS),

  /**
   * Amendment B node capability (P11-008, spec §184.3, §190's `social_capabilities.
   * can_create_community`). Default off: community creation is capability-gated per §184.3
   * ("a node MAY grant this per-node"), so an operator opts in rather than every self-hosted
   * node suddenly allowing it.
   */
  CAN_CREATE_COMMUNITY: booleanish().default(false),

  /**
   * Amendment B (P11-008, spec §184.2, §192): the allow-list of single width-1 codepoints a
   * `like_glyph` may use, comma-separated, published via `NodeService.GetNodeInfo`'s
   * `social_capabilities.like_glyph_allow_list`. Default empty — same "honest empty capability
   * list" reasoning `NodeService`'s existing `CAPABILITIES` constant documents; a self-hoster
   * opts in per §184.3 ("every cosmetic MUST be available by default or granted per-node").
   * Validated for shape (single width-1 codepoint, no combining/zero-width/control) by
   * `modules/actors/glyph-validation.ts` at boot via `ActorFlairModule`'s `AppConfigService`
   * read, not here — this schema only splits the comma list (same `WEB_ORIGINS` pattern
   * `@patches/config`'s `serverEnvShape` documents).
   */
  LIKE_GLYPH_ALLOW_LIST: z
    .string()
    .default('')
    .transform((value) =>
      value
        .split(',')
        .map((entry) => entry.trim())
        .filter((entry) => entry.length > 0),
    ),

  /**
   * Amendment C (P14-009, spec §200.2, §200.3): the closed vocabulary this node's own labeler
   * publishes, comma-separated. Read by `modules/labels`' boot-time seed (which keeps the
   * node's own `labelers` row's `vocabulary` column in sync with this list) and by
   * `NodeService.GetNodePolicy`'s `label_vocabulary` (same list, published so clients can
   * render every labeler's values honestly — a node "MUST publish whichever [vocabulary] it
   * uses", §200.2). Same comma-list convention as `LIKE_GLYPH_ALLOW_LIST` above. Default is
   * this node's own starting vocabulary, not the spec's §200.2 example list verbatim — a node
   * MAY publish a different one.
   */
  LABEL_VOCABULARY: z
    .string()
    .default('spam,nsfw,needs-cw,harassment,misinformation,other')
    .transform((value) =>
      value
        .split(',')
        .map((entry) => entry.trim())
        .filter((entry) => entry.length > 0),
    ),

  /**
   * Amendment C operator transparency (P14-012, spec §197.6): `NodeService.GetNodePolicy`'s
   * `privacy_notice_url`. Empty means this node has not published one — the proto's own
   * contract says an all-empty `NodePolicy` renders as "this node publishes no policy" rather
   * than a stub error, so an unset value here is a real, honest answer, not a placeholder.
   */
  NODE_POLICY_URL: z.union([z.url(), z.literal('')]).default(''),
  /** Moderator handles, comma-separated (spec §197.6's "who runs this node"/moderator
   * contact) — joined into `NodePolicy.moderator_contact`. Same comma-list convention as
   * `LIKE_GLYPH_ALLOW_LIST`/`LABEL_VOCABULARY` above. */
  NODE_MODERATORS: z
    .string()
    .default('')
    .transform((value) =>
      value
        .split(',')
        .map((entry) => entry.trim())
        .filter((entry) => entry.length > 0),
    ),
  /**
   * Amendment C (P14-012, spec §197.6, §201.5): this node's federation posture, published via
   * `NodePolicy.federation_stance`. Left unset by default so `NodeService` can derive an
   * honest value from `FEDERATION_ENABLED` (disabled when federation itself is off) rather
   * than an operator having to keep two flags in sync.
   */
  FEDERATION_STANCE: z.enum(['disabled', 'allowlist', 'open-with-blocklist']).optional(),
  /** Operator-declared jurisdiction/provider, free text (spec §197.6). Empty means unpublished. */
  DATA_LOCATION: z.string().max(500).default(''),
  /** `NodePolicy.privacy_notice_version` (spec §197.5, §197.6) — bumped by the operator when
   * the privacy notice text changes; 0 means no notice has been published/versioned yet. */
  PRIVACY_NOTICE_VERSION: z.coerce.number().int().min(0).default(0),
  /** Node-configurable appeal window, in days, from the moderation notice (spec §201.3,
   * §204) — read by `AppealService.CreateAppeal`'s window check and published via
   * `NodePolicy.appeal_window_days`. */
  APPEAL_WINDOW_DAYS: z.coerce.number().int().positive().default(APPEAL_WINDOW_DAYS_DEFAULT),
  /** Node-configurable account-deletion grace period, in days (spec §197.4, §204) — published
   * via `NodePolicy.account_deletion_grace_period_days`. No deletion sweep reads this yet
   * (`account_deletion_requests` lands with `PrivacyService`, out of this task's scope); this
   * only feeds the advertised policy value in v0, same as `DM_RETENTION_DAYS` above. */
  ACCOUNT_DELETION_GRACE_PERIOD_DAYS: z.coerce
    .number()
    .int()
    .positive()
    .default(ACCOUNT_DELETION_GRACE_PERIOD_DAYS_DEFAULT),

  /**
   * Amendment C operator opt-in (P14 follow-up, spec §197.5, §197.6): when true,
   * `RequirePrivacyAckGuard` (`common/guards/require-privacy-ack.guard.ts`) rejects a mutating
   * RPC it is attached to (create post, send DM, follow) with `FAILED_PRECONDITION`/
   * `PRIVACY_NOTICE_NOT_ACKNOWLEDGED` until the caller has called `PrivacyService.
   * AcknowledgePrivacyNotice` for this node's current `PRIVACY_NOTICE_VERSION`. **Default
   * false**: most self-hosted nodes publish no privacy notice at all (`NODE_POLICY_URL`
   * defaults to `''`), and gating writes on acknowledging a notice that doesn't exist would
   * make the node unusable out of the box. Reads are never gated regardless of this flag.
   */
  REQUIRE_PRIVACY_ACK: booleanish().default(false),

  /**
   * Owner decision (2026-08-19): an invite-only node gates *posting*, not *reading* — its
   * public content stays readable logged-out by default, exactly as `INVITE_ONLY` already
   * says nothing about read access. **Default true.** Setting this `false` opts a node into
   * a fully closed mode: `PublicReadGuard` (`common/guards/public-read.guard.ts`, global)
   * then rejects every RPC except `SystemService.*`, `NodeService.GetNodeInfo`/
   * `GetNodePolicy`, and `AuthService.*` (you cannot sign in while already required to be
   * signed in) with `UNAUTHENTICATED`/`SIGN_IN_REQUIRED` unless the caller sends a valid
   * session — `/healthz` and the federation HTTP surface are unaffected, since they are Nest
   * HTTP routes, not gRPC `rpc` execution contexts, so the guard's transport check already
   * excludes them without a separate allow-list entry.
   */
  PUBLIC_READ: booleanish().default(true),

  /**
   * P15-002: whether this node accepts the PASSWORD credential at all, published to clients via
   * `AuthService.GetAuthPolicy`. `off` makes `Login`, a password-carrying `Register`, and
   * `AddCredential(PASSWORD)` all reject with `PASSWORD_AUTH_DISABLED` — see `AuthService`'s
   * checks. `required` is accepted and published but not yet enforced beyond that (v0 does not
   * forbid SSH/GitHub-only registration even in `required` mode). **Default `optional`**:
   * matches v0's behavior before this flag existed — password auth stays on unless an operator
   * opts out.
   */
  PASSWORD_AUTH: z.enum(['off', 'optional', 'required']).default('optional'),
});

export const envSchema = envObjectSchema.superRefine((value, ctx) => {
  if (value.FEDERATION_ENABLED) {
    if (value.FEDERATION_KEY_ENCRYPTION_KEY === undefined) {
      ctx.addIssue({
        code: 'custom',
        path: ['FEDERATION_KEY_ENCRYPTION_KEY'],
        message: 'FEDERATION_KEY_ENCRYPTION_KEY is required when FEDERATION_ENABLED=true',
      });
    } else if (Buffer.from(value.FEDERATION_KEY_ENCRYPTION_KEY, 'base64').length !== 32) {
      ctx.addIssue({
        code: 'custom',
        path: ['FEDERATION_KEY_ENCRYPTION_KEY'],
        message: 'FEDERATION_KEY_ENCRYPTION_KEY must decode (base64) to exactly 32 bytes',
      });
    }
  }

  if (value.NODE_ENV !== 'production') return;

  // Production-only requirements live here rather than in the base types so that a
  // misconfigured deploy fails with a listed configuration error naming the variable,
  // not a type error somewhere downstream.
  const requiredInProduction = ['DATABASE_URL', 'JWT_PRIVATE_KEY', 'JWT_PUBLIC_KEY'] as const;
  for (const key of requiredInProduction) {
    if (!value[key]) {
      ctx.addIssue({
        code: 'custom',
        path: [key],
        message: `${key} is required when NODE_ENV=production`,
      });
    }
  }
});

export type Env = z.infer<typeof envSchema>;

/**
 * Validate raw environment variables. Used both by `main.ts` (which needs the
 * bind address before Nest exists) and by `ConfigModule.forRoot({ validate })`.
 *
 * Throws {@link ConfigError} (from `@patches/config`) listing every invalid
 * variable — not just the first — so a misconfigured deploy can be fixed in one pass.
 */
export function validateEnv(raw: Record<string, string | undefined>): Env {
  return loadEnv(envSchema, raw);
}
