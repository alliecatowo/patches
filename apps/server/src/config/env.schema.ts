import { readFileSync } from 'node:fs';

import {
  ACCOUNT_DELETION_GRACE_PERIOD_DAYS_DEFAULT,
  APPEAL_WINDOW_DAYS_DEFAULT,
  MAX_POST_CHARS,
  MAX_POST_CHARS_NODE_CEILING,
} from '@patches/domain';
import { authCodeDeliveryKeyIdSchema, authCodeDeliveryKeyringJsonSchema } from '@patches/database';
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

  /** Rotatable AES-256-GCM keyring shared with the worker for auth-code delivery envelopes. */
  AUTH_CODE_DELIVERY_KEYS: authCodeDeliveryKeyringJsonSchema,
  /** Key id selected for newly issued verification and password-reset envelopes. */
  AUTH_CODE_DELIVERY_ACTIVE_KEY_ID: authCodeDeliveryKeyIdSchema,

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
   * P15-006: this node's configured generic-OIDC-device-flow providers (GitLab, Codeberg, any
   * other provider that implements RFC 8628 device authorization) — a JSON array, e.g.
   * `[{"id":"gitlab","displayName":"GitLab","deviceAuthorizationUrl":"https://gitlab.com/oauth
   * /authorize_device","tokenUrl":"https://gitlab.com/oauth/token","userinfoUrl":
   * "https://gitlab.com/oauth/userinfo","clientId":"...","clientSecret":"..."}]`. Empty array
   * (the default) means no OIDC provider is configured — same "honest empty" convention as
   * `GITHUB_CLIENT_ID` being unset, except GitHub gets its own dedicated flag/RPC pair and
   * this covers every *other* provider. `id` is what a client passes as `BeginOidcLoginRequest
   * .provider` and is namespaced into `credentials.identifier` (`"<id>:<subject>"`), so it
   * must be unique within the array. Secrets live here, in env, never in a config literal
   * committed to the repo.
   */
  OIDC_PROVIDERS: z
    .string()
    .trim()
    .default('[]')
    .transform((value, ctx) => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(value);
      } catch (error) {
        ctx.addIssue({
          code: 'custom',
          message: `OIDC_PROVIDERS is not valid JSON: ${
            error instanceof Error ? error.message : String(error)
          }`,
        });
        return z.NEVER;
      }
      return parsed;
    })
    .pipe(
      z
        .array(
          z.object({
            id: z
              .string()
              .trim()
              .min(1)
              .max(40)
              .regex(
                /^[a-z0-9_-]+$/,
                'OIDC provider id must be lowercase ASCII letters, digits, "_" or "-"',
              ),
            displayName: z.string().trim().min(1).max(80),
            deviceAuthorizationUrl: z.url(),
            tokenUrl: z.url(),
            userinfoUrl: z.url(),
            clientId: z.string().trim().min(1),
            clientSecret: z.string().trim().min(1),
          }),
        )
        .superRefine((providers, ctx) => {
          const seen = new Set<string>();
          for (const [index, provider] of providers.entries()) {
            if (seen.has(provider.id)) {
              ctx.addIssue({
                code: 'custom',
                path: [index, 'id'],
                message: `duplicate OIDC provider id "${provider.id}"`,
              });
            }
            seen.add(provider.id);
          }
        }),
    ),
  /** Same reasoning as `GITHUB_HTTP_TIMEOUT_MS` — bounds every outbound call the OIDC device
   * flow makes, to any configured provider. */
  OIDC_HTTP_TIMEOUT_MS: z.coerce.number().int().positive().default(5000),

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
  /** 0 means "retained indefinitely" (`NodeService.GetNodeInfo`'s
   * `social_capabilities.dm_retention_days` doc, spec §190). A node must not advertise a
   * deletion promise until the corresponding tested sweep exists. */
  DM_RETENTION_DAYS: z.coerce.number().int().min(0).max(0).default(0),

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
  /**
   * A-052 (spec §197.1, §197.6): the privacy notice's short structured summary — what is
   * stored, what is public, that this node's operators can read DMs, retention, how to
   * export, how to delete, who to contact. Text-only (§197.6's "MUST NOT be able to publish
   * ... markup, scripts, or remote media") — plain string, rendered as plain text by every
   * client, never parsed as markdown/HTML. `PRIVACY_NOTICE_FILE` below wins when both are
   * set, so an operator can keep the real text in a mounted file instead of a single env
   * line; this default stays the literal fallback for an operator who prefers env vars.
   */
  PRIVACY_NOTICE_SUMMARY: z.string().max(4000).default(''),
  /**
   * A-052: path to a file containing the privacy notice summary, read once at boot (this
   * schema's `.transform` below) and used verbatim (trimmed) as `PRIVACY_NOTICE_SUMMARY` —
   * lets an operator mount a richer, easier-to-edit text file (e.g. a Fly volume or Docker
   * secret) instead of cramming the summary into one `[env]` line. Wins over
   * `PRIVACY_NOTICE_SUMMARY` when both are set. A boot-time read, not a live one: like every
   * other env var here, changing the file requires a redeploy/restart to take effect, and
   * that's fine — the notice is already versioned for change tracking (`PRIVACY_NOTICE_VERSION`).
   */
  PRIVACY_NOTICE_FILE: z.string().trim().min(1).optional(),
  /** A-052 (spec §197.6): `NodePolicy.terms_url` — link to this node's terms/community
   * guidelines. Empty means unpublished, same convention as `NODE_POLICY_URL`. */
  TERMS_URL: z.union([z.url(), z.literal('')]).default(''),
  /** A-052 (spec §197.6, §201.3): `NodePolicy.appeal_instructions` — human-readable "how
   * appeals are filed" text; the actual mechanism is `AppealService.CreateAppeal`. Text-only,
   * same constraint as `PRIVACY_NOTICE_SUMMARY`. Empty means unpublished. */
  APPEAL_INSTRUCTIONS: z.string().max(2000).default(''),
  /** A-052 (spec §197.6): `NodePolicy.operator_identity` — who runs this node, or an explicit
   * "anonymous operator" statement. Text-only. Empty means unpublished. */
  OPERATOR_CONTACT: z.string().max(500).default(''),
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

  /**
   * S-001 (capacity/concurrency plan, `docs/operations/capacity.md`): per-connection gRPC
   * channel limits, passed straight through to grpc-js's `Server`/`Client` `ChannelOptions`
   * (`grpc-options.ts`, `transport/connect/grpc-proxy.ts`) — real gRPC-core channel args, not
   * Patches inventions. Defaults are sized for a single small Fly machine (shared-cpu-1x,
   * `DATABASE_POOL_MAX=10`), not a fleet — see the doc for the full rationale per number.
   */
  GRPC_MAX_CONCURRENT_STREAMS: z.coerce.number().int().positive().default(100),
  GRPC_MAX_CONNECTION_AGE_MS: z.coerce
    .number()
    .int()
    .positive()
    .default(30 * 60_000),
  GRPC_MAX_CONNECTION_IDLE_MS: z.coerce
    .number()
    .int()
    .positive()
    .default(5 * 60_000),
  GRPC_KEEPALIVE_TIME_MS: z.coerce.number().int().positive().default(60_000),
  GRPC_KEEPALIVE_TIMEOUT_MS: z.coerce.number().int().positive().default(20_000),
  /** Applied to both the public gRPC server and the internal Connect-edge loopback proxy
   * client (`grpc-proxy.ts`), so a message can't bypass the cap by going through Connect. */
  GRPC_MAX_MESSAGE_BYTES: z.coerce
    .number()
    .int()
    .positive()
    .default(4 * 1024 * 1024),

  /**
   * S-001: Node `http.Server` tuning for the always-on HTTP listener (`/healthz`, the Connect
   * edge) — the only edge with a raw internet-facing socket (gRPC sits behind Fly's TCP
   * proxy). `HTTP_HEADERS_TIMEOUT_MS` must stay below `HTTP_REQUEST_TIMEOUT_MS` (Node throws
   * at listen time otherwise); the default gap follows Node's own stock ordering.
   */
  HTTP_MAX_CONNECTIONS: z.coerce.number().int().positive().default(512),
  HTTP_REQUEST_TIMEOUT_MS: z.coerce.number().int().positive().default(30_000),
  HTTP_HEADERS_TIMEOUT_MS: z.coerce.number().int().positive().default(20_000),
  HTTP_KEEPALIVE_TIMEOUT_MS: z.coerce.number().int().positive().default(5_000),

  /** OpenTelemetry instrumentation (Wave 1 observability). */
  OTEL_ENABLED: z.enum(['true', 'false']).default('false'),
  OTEL_EXPORTER_OTLP_ENDPOINT: z.string().trim().optional(),
  OTEL_SERVICE_NAME: z.string().trim().default('patches-server'),
  OTEL_RESOURCE_ATTRIBUTES: z.string().trim().optional(),

  /** Prometheus metrics server (Wave 1 observability). */
  METRICS_ENABLED: z.enum(['true', 'false']).default('false'),
  METRICS_PORT: z.coerce.number().int().min(1).max(65535).default(9090),

  /** S-001: per-unary-RPC server-side deadline, enforced by `RpcBudgetInterceptor` — no
   * handler may hold a worker/DB connection open indefinitely regardless of client behaviour. */
  RPC_TIMEOUT_MS: z.coerce.number().int().positive().default(10_000),
  /** S-001/S-002: fixed-window budget shared by every RPC classified `read` (`Get*`/`List*`/
   * `Stream*`, `RpcBudgetInterceptor`'s `classifyRpc`), keyed per authenticated actor and,
   * independently, per network peer — process-local (no Redis in v0, spec §153). */
  RPC_READ_BUDGET_PER_ACTOR_PER_MIN: z.coerce.number().int().positive().default(300),
  RPC_READ_BUDGET_PER_PEER_PER_MIN: z.coerce.number().int().positive().default(600),
  /** Every mutating RPC (anything not `Get*`/`List*`/`Stream*`/`SearchPosts`). */
  RPC_WRITE_BUDGET_PER_ACTOR_PER_MIN: z.coerce.number().int().positive().default(60),
  RPC_WRITE_BUDGET_PER_PEER_PER_MIN: z.coerce.number().int().positive().default(120),
  /** `PostService.SearchPosts` alone: an `ILIKE` scan is the single most expensive read this
   * node serves, so it gets its own, tighter budget rather than sharing `read`'s. */
  RPC_SEARCH_BUDGET_PER_ACTOR_PER_MIN: z.coerce.number().int().positive().default(20),
  RPC_SEARCH_BUDGET_PER_PEER_PER_MIN: z.coerce.number().int().positive().default(40),
  /**
   * S-002: the load-shedding gate — the maximum number of `write`-class RPCs this process
   * will run concurrently; the next one over the limit is rejected immediately with
   * `NODE_OVERLOADED` rather than queuing behind an already-saturated DB pool. `read`/`search`
   * RPCs are never gated by this, which is the actual "reads keep working" property. Default
   * leaves headroom under `DATABASE_POOL_MAX` (10) for reads to keep a connection available.
   */
  RPC_WRITE_CONCURRENCY_LIMIT: z.coerce.number().int().positive().default(8),

  /** S-002: `PostService.createPost`'s mention-notification fan-out cap (spec: a pathological
   * wall of `@x`s must not fan out into hundreds of notification writes from one post). Same
   * default as the value this replaces (`post.service.ts`'s former hardcoded constant). */
  MENTION_FANOUT_MAX: z.coerce.number().int().positive().default(50),
  /** B-103: when true, rate limits use the DB-backed `rate_limit_buckets` table instead of
   * the in-process fixed-window store. This enables global rate limiting across multiple
   * server/worker replicas — essential when Fly's TLS-terminating proxy collapses all
   * external clients to one peer address (A-039). Default false for backward compatibility
   * and because the in-memory store is simpler for single-replica nodes. */
  RATE_LIMIT_GLOBAL: booleanish().default(false),
});

export const envSchema = envObjectSchema
  .superRefine((value, ctx) => {
    if (value.AUTH_CODE_DELIVERY_KEYS[value.AUTH_CODE_DELIVERY_ACTIVE_KEY_ID] === undefined) {
      ctx.addIssue({
        code: 'custom',
        path: ['AUTH_CODE_DELIVERY_ACTIVE_KEY_ID'],
        message: 'must identify a key present in AUTH_CODE_DELIVERY_KEYS',
      });
    }

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
  })
  .transform((value, ctx) => {
    // A-052: `PRIVACY_NOTICE_FILE` wins over `PRIVACY_NOTICE_SUMMARY` when both are set — a
    // boot-time read (not per-request) of the operator-mounted file, trimmed and substituted
    // in place of the env var value. Runs after the production `superRefine` above so a
    // missing/unreadable file surfaces as its own listed configuration error rather than being
    // masked by an unrelated production-only failure.
    if (value.PRIVACY_NOTICE_FILE === undefined) return value;

    try {
      // nestjs-doctor-ignore-next-line performance/no-sync-io -- boot-path only: zod transforms are synchronous, this runs once during env validation before the event loop serves traffic
      const fileSummary = readFileSync(value.PRIVACY_NOTICE_FILE, 'utf8').trim();
      return { ...value, PRIVACY_NOTICE_SUMMARY: fileSummary };
    } catch (error) {
      ctx.addIssue({
        code: 'custom',
        path: ['PRIVACY_NOTICE_FILE'],
        message: `could not read PRIVACY_NOTICE_FILE (${value.PRIVACY_NOTICE_FILE}): ${
          error instanceof Error ? error.message : String(error)
        }`,
      });
      return value;
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
