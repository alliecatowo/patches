import { Inject, Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DomainBlock, Labeler } from '@patches/database';
import {
  ACCOUNT_EXPORT_EXPIRES_AFTER_DAYS,
  ACCOUNT_EXPORT_MAX_READY_ARCHIVES,
  MAX_APPEAL_STATEMENT_CHARS,
  MAX_FILTER_LIST_ENTRIES,
  MAX_FILTER_LIST_EXCEPTIONS_PER_LIST,
  MAX_FILTER_LIST_SUBSCRIPTIONS,
  MAX_FILTER_LISTS_PUBLISHED_PER_ACTOR,
  MAX_FILTER_TERMS_PER_FILTER,
  MAX_FILTERS_PER_ACTOR,
  MAX_LABELER_SUBSCRIPTIONS_PER_ACTOR,
} from '@patches/domain';
import {
  DomainPolicyAction,
  FederationStance,
  type GetNodeInfoResponse,
  type GetNodePolicyResponse,
  RegistrationMode,
} from '@patches/proto/nest';
import type { DataSource } from 'typeorm';

import { AppConfigService } from '../../config/app-config.service.js';
import {
  BIO_MAX_LENGTH,
  DISPLAY_NAME_MAX_LENGTH,
  LOCATION_TEXT_MAX_LENGTH,
  SEARCH_QUERY_MAX_LENGTH,
  WEBSITE_URL_MAX_LENGTH,
  isWidthOneGlyph,
} from '../actors/validation.js';
import { HANDLE_MAX_LENGTH } from '../auth/validation.js';
import { toProtoVocabularyEntry } from '../labels/label.mapper.js';
import {
  MAX_LABELER_VOCABULARY_ENTRIES,
  parseStoredVocabulary,
} from '../labels/label-validation.js';
import { toProtoReasonCategory } from '../moderation/moderation.mapper.js';
import { SERVER_VERSION } from './server-version.provider.js';

/** Alt text has no owning validation module yet — `MediaService` lands in Phase 5. The limit
 * itself is fixed by spec §58 already (`posts.proto`'s `MediaAttachment.alt_text` doc), so
 * this is the value, not a placeholder. */
const ALT_TEXT_MAX_LENGTH = 1000;

/** No server-visible DM deletion sweep exists yet. Publishing any nonzero value would promise
 * retention behavior the node cannot enforce; keep this defensive constant even though env
 * validation currently rejects nonzero `DM_RETENTION_DAYS` too. */
const SERVER_VISIBLE_DM_RETENTION_DAYS = 0;

/**
 * Capability flags this node grants (spec §174) — deliberately empty: v0 has no capability
 * gating to advertise yet (no Pages, no custom domains, no paid storage tiers exist). An empty
 * list is the honest answer, not a placeholder; there is no `tier`/`plan`/`premium` field
 * anywhere in this message and there never will be.
 */
const CAPABILITIES: readonly string[] = Object.freeze([]);

/** The application "service" behind `patches.v1.NodeService.GetNodeInfo` (spec §163, §168,
 * §174) — thin enough that it composes config + limit constants directly rather than going
 * through a repository; there is nothing here that touches the database. */
@Injectable()
export class NodeService {
  constructor(
    private readonly config: AppConfigService,
    @Inject(SERVER_VERSION) private readonly serverVersion: string,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  getNodeInfo(): GetNodeInfoResponse {
    return {
      domain: this.config.nodeDomain,
      softwareVersion: this.serverVersion,
      registrationMode: this.config.inviteOnly
        ? RegistrationMode.REGISTRATION_MODE_INVITE_ONLY
        : RegistrationMode.REGISTRATION_MODE_OPEN,
      limits: {
        postBodyMaxChars: this.config.maxPostChars,
        bioMaxChars: BIO_MAX_LENGTH,
        displayNameMaxChars: DISPLAY_NAME_MAX_LENGTH,
        handleMaxChars: HANDLE_MAX_LENGTH,
        locationTextMaxChars: LOCATION_TEXT_MAX_LENGTH,
        websiteUrlMaxChars: WEBSITE_URL_MAX_LENGTH,
        altTextMaxChars: ALT_TEXT_MAX_LENGTH,
        searchQueryMaxChars: SEARCH_QUERY_MAX_LENGTH,
        // A-054 (spec §204): every one of these mirrors a `@patches/domain`/module constant
        // that already enforces it server-side — see `node.proto`'s `NodeLimits` doc for the
        // "single source" convention.
        maxFiltersPerActor: MAX_FILTERS_PER_ACTOR,
        maxFilterTermsPerFilter: MAX_FILTER_TERMS_PER_FILTER,
        maxFilterListsPublishedPerActor: MAX_FILTER_LISTS_PUBLISHED_PER_ACTOR,
        maxFilterListEntries: MAX_FILTER_LIST_ENTRIES,
        maxFilterListSubscriptions: MAX_FILTER_LIST_SUBSCRIPTIONS,
        maxFilterListExceptionsPerList: MAX_FILTER_LIST_EXCEPTIONS_PER_LIST,
        maxLabelerSubscriptionsPerActor: MAX_LABELER_SUBSCRIPTIONS_PER_ACTOR,
        maxLabelVocabularyEntries: MAX_LABELER_VOCABULARY_ENTRIES,
        maxAppealStatementChars: MAX_APPEAL_STATEMENT_CHARS,
        accountExportMaxReadyArchives: ACCOUNT_EXPORT_MAX_READY_ARCHIVES,
      },
      capabilities: [...CAPABILITIES],
      socialCapabilities: {
        likeGlyphAllowList: this.config.likeGlyphAllowList.filter(isWidthOneGlyph),
        maxPostChars: this.config.maxPostChars,
        canCreateCommunity: this.config.canCreateCommunity,
        dmEnabled: this.config.dmEnabled,
        dmRetentionDays: SERVER_VISIBLE_DM_RETENTION_DAYS,
      },
      publicRead: this.config.publicRead,
    };
  }

  /**
   * P14-012/A-052 (spec §197.6) — the operator transparency document, populated from
   * `AppConfigService` env vars plus a live read of `domain_blocks` (§201.5's published domain
   * policy). `privacy_notice_summary`, `terms_url`, `appeal_instructions`, and
   * `operator_identity` are all operator-supplied text — empty is the honest "not configured"
   * answer for an operator who hasn't set one, not a placeholder; the proto's own doc says an
   * all-empty `NodePolicy` renders as "this node publishes no policy" (§197.6), and that
   * reasoning applies per-field just as well as to the whole message.
   */
  async getNodePolicy(): Promise<GetNodePolicyResponse> {
    const domainBlocks = await this.dataSource
      .getRepository(DomainBlock)
      .createQueryBuilder('block')
      .orderBy('block.domain', 'ASC')
      .getMany();
    // P14-026 (spec §200.3, §203): published straight from the node's own labeler row —
    // `LabelSeedService` is the only writer, and preserves a value's `mandatory` flag across
    // reboots once `patches-admin labeler vocabulary set-mandatory` has set one (see that
    // service's doc). No row yet (a labeler seed hasn't run, e.g. a server that has never
    // booted with `http: true`) renders as an honest empty vocabulary, same convention every
    // other unconfigured field in this response already uses.
    const nodeLabeler = await this.dataSource
      .getRepository(Labeler)
      .findOne({ where: { isNodeLabeler: true } });

    return {
      policy: {
        privacyNoticeSummary: this.config.privacyNoticeSummary,
        privacyNoticeVersion: this.config.privacyNoticeVersion,
        privacyNoticeUrl: this.config.nodePolicyUrl,
        termsUrl: this.config.termsUrl,
        moderatorContact: this.config.nodeModerators.join(', '),
        appealInstructions: this.config.appealInstructions,
        federationStance: this.resolveFederationStance(),
        domainPolicies: domainBlocks.map((block) => ({
          domain: block.domain,
          action: DomainPolicyAction.DOMAIN_POLICY_ACTION_BLOCK,
          reasonCategory: toProtoReasonCategory(block.reasonCategory),
        })),
        dataLocation: this.config.dataLocation,
        retention: {
          dmRetentionDays: SERVER_VISIBLE_DM_RETENTION_DAYS,
          // No retention sweep exists yet for these three (spec §176's "no such job" is the
          // honest reason, not a placeholder) — 0 means "no retention limit is enforced", the
          // same convention `dm_retention_days`/`SocialCapabilities.dm_retention_days` use.
          evidenceSnapshotRetentionDays: 0,
          uploadedOriginalRetentionDays: 0,
          logRetentionDays: 0,
          exportArchiveRetentionDays: ACCOUNT_EXPORT_EXPIRES_AFTER_DAYS,
        },
        operatorIdentity: this.config.operatorIdentity,
        labelVocabulary:
          nodeLabeler === null
            ? []
            : parseStoredVocabulary(nodeLabeler.vocabulary).map(toProtoVocabularyEntry),
        accountDeletionGracePeriodDays: this.config.accountDeletionGracePeriodDays,
        appealWindowDays: this.config.appealWindowDays,
      },
    };
  }

  /** An operator may set `FEDERATION_STANCE` explicitly; unset derives from
   * `FEDERATION_ENABLED` so the two flags can't silently disagree (§197.6, §201.5). */
  private resolveFederationStance(): FederationStance {
    switch (this.config.federationStance) {
      case 'disabled':
        return FederationStance.FEDERATION_STANCE_DISABLED;
      case 'allowlist':
        return FederationStance.FEDERATION_STANCE_ALLOWLIST;
      case 'open-with-blocklist':
        return FederationStance.FEDERATION_STANCE_OPEN_WITH_BLOCKLIST;
      default:
        return this.config.federationEnabled
          ? FederationStance.FEDERATION_STANCE_OPEN_WITH_BLOCKLIST
          : FederationStance.FEDERATION_STANCE_DISABLED;
    }
  }
}
