import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { type Env } from './env.schema.js';

/** One entry of `Env['OIDC_PROVIDERS']` (P15-006) — id, display name, the three device-flow
 * URLs, and the confidential client credentials, all validated at boot by `env.schema.ts`. */
export type OidcProviderConfig = Env['OIDC_PROVIDERS'][number];

/**
 * Typed accessor over the validated environment.
 *
 * Application code injects this rather than `ConfigService` so that a rename in
 * the environment contract is a single-file change and nothing reads
 * `process.env` directly (spec §97).
 */
@Injectable()
export class AppConfigService {
  constructor(private readonly config: ConfigService<Env, true>) {}

  private get<K extends keyof Env>(key: K): Env[K] {
    return this.config.get(key, { infer: true });
  }

  get nodeEnv(): Env['NODE_ENV'] {
    return this.get('NODE_ENV');
  }

  get isProduction(): boolean {
    return this.nodeEnv === 'production';
  }

  get logLevel(): Env['LOG_LEVEL'] {
    return this.get('LOG_LEVEL');
  }

  get grpcUrl(): string {
    return `${this.get('GRPC_HOST')}:${String(this.get('GRPC_PORT'))}`;
  }

  get publicOrigin(): string {
    return this.get('PUBLIC_ORIGIN');
  }

  get passkeyRpId(): string {
    return this.get('PASSKEY_RP_ID') ?? new URL(this.publicOrigin).hostname;
  }

  get passkeyOrigins(): string[] {
    const origins = this.get('PASSKEY_ORIGINS');
    return origins.length > 0 ? origins : [this.publicOrigin];
  }

  get instanceName(): string {
    return this.get('INSTANCE_NAME');
  }

  /** Whether to attach `grpc.reflection.v1alpha.ServerReflection` (B-006). */
  get grpcReflection(): boolean {
    return this.get('GRPC_REFLECTION');
  }

  /** Use proxy headers (`fly-client-ip` / `x-forwarded-for`) as the peer address (A-039). */
  get trustProxyHeaders(): boolean {
    return this.get('TRUST_PROXY_HEADERS');
  }

  get databaseUrl(): string | undefined {
    return this.get('DATABASE_URL');
  }

  get databaseSsl(): boolean {
    return this.get('DATABASE_SSL');
  }

  get databasePoolMax(): number {
    return this.get('DATABASE_POOL_MAX');
  }

  get databaseStatementTimeout(): string {
    return this.get('DATABASE_STATEMENT_TIMEOUT');
  }

  get authCodeDeliveryKeys(): Env['AUTH_CODE_DELIVERY_KEYS'] {
    return this.get('AUTH_CODE_DELIVERY_KEYS');
  }

  get authCodeDeliveryActiveKeyId(): string {
    return this.get('AUTH_CODE_DELIVERY_ACTIVE_KEY_ID');
  }

  get inviteOnly(): boolean {
    return this.get('INVITE_ONLY');
  }

  /** Canonical domain of this node (spec §163, §169). */
  get nodeDomain(): string {
    return this.get('NODE_DOMAIN');
  }

  get accessTokenTtlSeconds(): number {
    return this.get('ACCESS_TOKEN_TTL');
  }

  get refreshTokenTtlSeconds(): number {
    return this.get('REFRESH_TOKEN_TTL');
  }

  /**
   * PEM PKCS#8 Ed25519 signing key, decoded from its base64 env form. Undefined only in
   * non-production environments that have not run `pnpm keys:generate` yet — `TokenService`
   * turns that into a boot failure the first time a token is needed, not a silent unsigned
   * token.
   */
  get jwtPrivateKeyPem(): string | undefined {
    return decodePem(this.get('JWT_PRIVATE_KEY'));
  }

  /** PEM SPKI Ed25519 verification key, decoded from its base64 env form. */
  get jwtPublicKeyPem(): string | undefined {
    return decodePem(this.get('JWT_PUBLIC_KEY'));
  }

  get argon2Options(): { memoryCost: number; timeCost: number; parallelism: number } {
    return {
      memoryCost: this.get('ARGON2_MEMORY_KIB'),
      timeCost: this.get('ARGON2_TIME_COST'),
      parallelism: this.get('ARGON2_PARALLELISM'),
    };
  }

  get storageAccountId(): string | undefined {
    return this.get('R2_ACCOUNT_ID');
  }

  get storageAccessKeyId(): string | undefined {
    return this.get('R2_ACCESS_KEY_ID');
  }

  get storageSecretAccessKey(): string | undefined {
    return this.get('R2_SECRET_ACCESS_KEY');
  }

  get storageBucket(): string | undefined {
    return this.get('R2_BUCKET');
  }

  get storageEndpoint(): string | undefined {
    return this.get('R2_ENDPOINT');
  }

  get storageRegion(): string {
    return this.get('R2_REGION');
  }

  get storageForcePathStyle(): boolean {
    return this.get('R2_FORCE_PATH_STYLE');
  }

  get mediaMaxBytes(): number {
    return this.get('MEDIA_MAX_BYTES');
  }

  get mediaMaxPixels(): number {
    return this.get('MEDIA_MAX_PIXELS');
  }

  get mediaPresignPutTtlSeconds(): number {
    return this.get('MEDIA_PRESIGN_PUT_TTL_SECONDS');
  }

  get mediaPresignGetTtlSeconds(): number {
    return this.get('MEDIA_PRESIGN_GET_TTL_SECONDS');
  }

  /** Undefined means GitHub login is not configured on this node (§176) — `AuthService`
   * answers `NOT_IMPLEMENTED` rather than calling GitHub with no client id. */
  get githubClientId(): string | undefined {
    return this.get('GITHUB_CLIENT_ID');
  }

  get githubDeviceCodeUrl(): string {
    return this.get('GITHUB_DEVICE_CODE_URL');
  }

  get githubTokenUrl(): string {
    return this.get('GITHUB_TOKEN_URL');
  }

  get githubUserApiUrl(): string {
    return this.get('GITHUB_USER_API_URL');
  }

  get githubHttpTimeoutMs(): number {
    return this.get('GITHUB_HTTP_TIMEOUT_MS');
  }

  /** P15-006: this node's configured generic-OIDC-device-flow providers. Empty means none are
   * configured — `AuthService` answers `BeginOidcLogin`/`PollOidcLogin` with `NOT_IMPLEMENTED`
   * for any `provider` id, same as `githubClientId` being unset. */
  get oidcProviders(): Env['OIDC_PROVIDERS'] {
    return this.get('OIDC_PROVIDERS');
  }

  /** Bounds every outbound call the OIDC device flow makes. */
  get oidcHttpTimeoutMs(): number {
    return this.get('OIDC_HTTP_TIMEOUT_MS');
  }

  /** Whether the Phase 8 federation HTTP surface is enabled on this node (default off). */
  get federationEnabled(): boolean {
    return this.get('FEDERATION_ENABLED');
  }

  get httpPort(): number {
    return this.get('HTTP_PORT');
  }

  /** Browser origins allowed to call the Connect edge cross-origin (ADR 0016 §6). Empty
   * means same-origin only. */
  get webOrigins(): readonly string[] {
    return this.get('WEB_ORIGINS');
  }

  /** Undefined only when federation is disabled — `envSchema`'s `superRefine` requires this
   * when `FEDERATION_ENABLED=true`, so `KeyService` can assume it's set whenever it runs. */
  get federationKeyEncryptionKey(): string | undefined {
    return this.get('FEDERATION_KEY_ENCRYPTION_KEY');
  }

  /** Whether this node's `DirectMessageService` write paths are enabled (spec §183, §190). */
  get dmEnabled(): boolean {
    return this.get('DM_ENABLED');
  }

  /** 0 means "no retention limit is enforced" (spec §190). */
  get dmRetentionDays(): number {
    return this.get('DM_RETENTION_DAYS');
  }

  /** The post body ceiling this node currently enforces (spec §186.2, §188) — read
   * dynamically by `PostService`, never hardcoded. */
  get maxPostChars(): number {
    return this.get('MAX_POST_CHARS');
  }

  /** Whether this node grants the `can_create_community` capability (spec §184.3, §190). */
  get canCreateCommunity(): boolean {
    return this.get('CAN_CREATE_COMMUNITY');
  }

  /** Allow-listed single-codepoint `like_glyph`s this node publishes (spec §184.2, §192).
   * Empty means this node has no custom reaction glyphs enabled. */
  get likeGlyphAllowList(): readonly string[] {
    return this.get('LIKE_GLYPH_ALLOW_LIST');
  }

  /** The closed label vocabulary this node's own labeler publishes (spec §200.2, §204's
   * `NodeService.GetNodePolicy` doc) — read by `modules/labels`' boot-time seed and by
   * `NodeService.GetNodePolicy`'s `label_vocabulary`. */
  get labelVocabulary(): readonly string[] {
    return this.get('LABEL_VOCABULARY');
  }

  /** `NodePolicy.privacy_notice_url` (spec §197.6). Empty means unpublished. */
  get nodePolicyUrl(): string {
    return this.get('NODE_POLICY_URL');
  }

  /** A-052: `NodePolicy.privacy_notice_summary` (spec §197.1, §197.6) — already resolved
   * against `PRIVACY_NOTICE_FILE` (file wins) by `env.schema.ts`'s boot-time transform, so
   * this is always the final text. Empty means unpublished. */
  get privacyNoticeSummary(): string {
    return this.get('PRIVACY_NOTICE_SUMMARY');
  }

  /** A-052: `NodePolicy.terms_url` (spec §197.6). Empty means unpublished. */
  get termsUrl(): string {
    return this.get('TERMS_URL');
  }

  /** A-052: `NodePolicy.appeal_instructions` (spec §197.6, §201.3). Empty means unpublished. */
  get appealInstructions(): string {
    return this.get('APPEAL_INSTRUCTIONS');
  }

  /** A-052: `NodePolicy.operator_identity` (spec §197.6) — who runs this node. Empty means
   * unpublished. */
  get operatorIdentity(): string {
    return this.get('OPERATOR_CONTACT');
  }

  /** Moderator handles this node publishes (spec §197.6). Empty means unpublished. */
  get nodeModerators(): readonly string[] {
    return this.get('NODE_MODERATORS');
  }

  /** Undefined means the operator has not set a stance explicitly — `NodeService` derives one
   * from `federationEnabled` instead (spec §197.6, §201.5). */
  get federationStance(): Env['FEDERATION_STANCE'] {
    return this.get('FEDERATION_STANCE');
  }

  /** Operator-declared jurisdiction/provider (spec §197.6). Empty means unpublished. */
  get dataLocation(): string {
    return this.get('DATA_LOCATION');
  }

  get privacyNoticeVersion(): number {
    return this.get('PRIVACY_NOTICE_VERSION');
  }

  /** Node-configurable appeal window in days (spec §201.3, §204). */
  get appealWindowDays(): number {
    return this.get('APPEAL_WINDOW_DAYS');
  }

  /** Node-configurable account-deletion grace period in days (spec §197.4, §204). */
  get accountDeletionGracePeriodDays(): number {
    return this.get('ACCOUNT_DELETION_GRACE_PERIOD_DAYS');
  }

  /** Whether `RequirePrivacyAckGuard`-attached write RPCs require a current-version privacy
   * notice acknowledgement first (spec §197.5, §197.6). Default false. */
  get requirePrivacyAck(): boolean {
    return this.get('REQUIRE_PRIVACY_ACK');
  }

  /** Whether this node's public content stays readable to an anonymous caller (owner
   * decision, 2026-08-19). Default true — `false` puts `PublicReadGuard`
   * (`common/guards/public-read.guard.ts`) into its closed-node mode. */
  get publicRead(): boolean {
    return this.get('PUBLIC_READ');
  }

  /** Feature flag overrides (spec §184.3, issue #142) keyed by declared flag name — fed into
   * `@patches/domain`'s `evaluateFeatureFlags` by `NodeService.getNodeInfo`. */
  get featureFlagOverrides(): ReadonlyMap<string, boolean> {
    return this.get('FEATURE_FLAGS');
  }

  /** P15-002: whether this node currently accepts the PASSWORD credential type. Default
   * `'optional'`. See `AuthService`'s `PASSWORD_AUTH_DISABLED` checks and
   * `AuthService.GetAuthPolicy`. */
  get passwordAuthMode(): 'off' | 'optional' | 'required' {
    return this.get('PASSWORD_AUTH');
  }

  // ---------------------------------------------------------- S-001/S-002 capacity & abuse

  get grpcMaxConcurrentStreams(): number {
    return this.get('GRPC_MAX_CONCURRENT_STREAMS');
  }

  get grpcMaxConnectionAgeMs(): number {
    return this.get('GRPC_MAX_CONNECTION_AGE_MS');
  }

  get grpcMaxConnectionIdleMs(): number {
    return this.get('GRPC_MAX_CONNECTION_IDLE_MS');
  }

  get grpcKeepaliveTimeMs(): number {
    return this.get('GRPC_KEEPALIVE_TIME_MS');
  }

  get grpcKeepaliveTimeoutMs(): number {
    return this.get('GRPC_KEEPALIVE_TIMEOUT_MS');
  }

  get grpcMaxMessageBytes(): number {
    return this.get('GRPC_MAX_MESSAGE_BYTES');
  }

  get httpMaxConnections(): number {
    return this.get('HTTP_MAX_CONNECTIONS');
  }

  get httpRequestTimeoutMs(): number {
    return this.get('HTTP_REQUEST_TIMEOUT_MS');
  }

  get httpHeadersTimeoutMs(): number {
    return this.get('HTTP_HEADERS_TIMEOUT_MS');
  }

  get httpKeepaliveTimeoutMs(): number {
    return this.get('HTTP_KEEPALIVE_TIMEOUT_MS');
  }

  get rpcTimeoutMs(): number {
    return this.get('RPC_TIMEOUT_MS');
  }

  get rpcReadBudgetPerActorPerMin(): number {
    return this.get('RPC_READ_BUDGET_PER_ACTOR_PER_MIN');
  }

  get rpcReadBudgetPerPeerPerMin(): number {
    return this.get('RPC_READ_BUDGET_PER_PEER_PER_MIN');
  }

  get rpcWriteBudgetPerActorPerMin(): number {
    return this.get('RPC_WRITE_BUDGET_PER_ACTOR_PER_MIN');
  }

  get rpcWriteBudgetPerPeerPerMin(): number {
    return this.get('RPC_WRITE_BUDGET_PER_PEER_PER_MIN');
  }

  get rpcSearchBudgetPerActorPerMin(): number {
    return this.get('RPC_SEARCH_BUDGET_PER_ACTOR_PER_MIN');
  }

  get rpcSearchBudgetPerPeerPerMin(): number {
    return this.get('RPC_SEARCH_BUDGET_PER_PEER_PER_MIN');
  }

  get rpcWriteConcurrencyLimit(): number {
    return this.get('RPC_WRITE_CONCURRENCY_LIMIT');
  }

  /** S-002: `PostService.createPost`'s mention-notification fan-out cap. */
  get mentionFanoutMax(): number {
    return this.get('MENTION_FANOUT_MAX');
  }

  /** B-103: whether rate limits use the DB-backed `rate_limit_buckets` table. */
  get rateLimitGlobal(): boolean {
    return this.get('RATE_LIMIT_GLOBAL');
  }
}

function decodePem(value: string | undefined): string | undefined {
  return value === undefined ? undefined : Buffer.from(value, 'base64').toString('utf8');
}
