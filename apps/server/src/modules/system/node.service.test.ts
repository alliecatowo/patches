import { type ConfigService } from '@nestjs/config';
import { DomainBlock, Labeler } from '@patches/database';
import {
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
  LabelAction,
  ModerationReasonCategory,
} from '@patches/proto/nest';
import type { DataSource } from 'typeorm';
import { describe, expect, it } from 'vitest';

import { AppConfigService } from '../../config/app-config.service.js';
import { type Env } from '../../config/env.schema.js';
import { MAX_LABELER_VOCABULARY_ENTRIES } from '../labels/label-validation.js';
import { NodeService } from './node.service.js';

const FIXED_VERSION = '9.9.9-test';

/** A minimal `AppConfigService` stub — same pattern `system.service.test.ts` uses. Every key
 * `NodeService` reads gets a sensible default so a test only has to override what it cares
 * about. */
function fakeConfig(overrides: Record<string, unknown> = {}): AppConfigService {
  const defaults: Record<string, unknown> = {
    NODE_DOMAIN: 'patches.test',
    INVITE_ONLY: false,
    MAX_POST_CHARS: 5000,
    LIKE_GLYPH_ALLOW_LIST: [],
    CAN_CREATE_COMMUNITY: false,
    DM_ENABLED: true,
    DM_RETENTION_DAYS: 0,
    NODE_POLICY_URL: '',
    PRIVACY_NOTICE_SUMMARY: '',
    TERMS_URL: '',
    APPEAL_INSTRUCTIONS: '',
    OPERATOR_CONTACT: '',
    NODE_MODERATORS: [],
    FEDERATION_STANCE: undefined,
    DATA_LOCATION: '',
    PRIVACY_NOTICE_VERSION: 0,
    APPEAL_WINDOW_DAYS: 14,
    ACCOUNT_DELETION_GRACE_PERIOD_DAYS: 30,
    LABEL_VOCABULARY: [],
    FEDERATION_ENABLED: false,
    PUBLIC_READ: true,
    FEATURE_FLAGS: new Map<string, boolean>(),
  };
  const values = { ...defaults, ...overrides };
  const stub = { get: (key: string) => values[key] } as unknown as ConfigService<Env, true>;
  return new AppConfigService(stub);
}

/** A fake `DataSource` exposing only the two reads `NodeService.getNodePolicy` runs —
 * `DomainBlock` rows ordered by domain, and the node's own `Labeler` row (P14-026,
 * `nodeLabelerVocabulary` — `null` when no node labeler has been seeded yet). */
function fakeDataSource(
  domainBlocks: readonly DomainBlock[],
  nodeLabelerVocabulary: unknown[] | null = null,
): DataSource {
  return {
    getRepository: (entity: unknown) => {
      if (entity === DomainBlock) {
        return {
          createQueryBuilder: () => ({
            orderBy: () => ({
              getMany: () => Promise.resolve(domainBlocks),
            }),
          }),
        };
      }
      if (entity === Labeler) {
        return {
          findOne: () =>
            Promise.resolve(
              nodeLabelerVocabulary === null
                ? null
                : ({ vocabulary: nodeLabelerVocabulary } as Labeler),
            ),
        };
      }
      throw new Error(`unexpected entity in fakeDataSource.getRepository: ${String(entity)}`);
    },
  } as unknown as DataSource;
}

function domainBlock(domain: string, reasonCategory: DomainBlock['reasonCategory']): DomainBlock {
  return {
    domain,
    reason: null,
    reasonCategory,
    source: 'MANUAL',
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
  };
}

describe('NodeService.getNodeInfo (owner decision 2026-08-19, PUBLIC_READ)', () => {
  it('publishes PUBLIC_READ verbatim', () => {
    const service = new NodeService(
      fakeConfig({ PUBLIC_READ: true }),
      FIXED_VERSION,
      fakeDataSource([]),
    );
    expect(service.getNodeInfo().publicRead).toBe(true);

    const closed = new NodeService(
      fakeConfig({ PUBLIC_READ: false }),
      FIXED_VERSION,
      fakeDataSource([]),
    );
    expect(closed.getNodeInfo().publicRead).toBe(false);
  });

  it('publishes an empty feature_flags list until a flag is declared (spec §184.3, issue #142)', () => {
    const service = new NodeService(
      fakeConfig({ FEATURE_FLAGS: new Map([['not_declared', true]]) }),
      FIXED_VERSION,
      fakeDataSource([]),
    );
    // `FEATURE_FLAG_DEFINITIONS` is empty in v0 — an override for an undeclared name is
    // ignored, matching `evaluateFeatureFlags`'s contract (`@patches/domain`).
    expect(service.getNodeInfo().featureFlags).toEqual([]);
  });

  it('publishes indefinite DM retention until a deletion sweep exists', async () => {
    const service = new NodeService(
      fakeConfig({ DM_RETENTION_DAYS: 30 }),
      FIXED_VERSION,
      fakeDataSource([]),
    );

    expect(service.getNodeInfo().socialCapabilities?.dmRetentionDays).toBe(0);
    expect((await service.getNodePolicy()).policy?.retention?.dmRetentionDays).toBe(0);
  });

  it('publishes the A-054 Amendment C size limits, matching the constants that enforce them', () => {
    const service = new NodeService(fakeConfig(), FIXED_VERSION, fakeDataSource([]));
    const limits = service.getNodeInfo().limits;

    expect(limits?.maxFiltersPerActor).toBe(MAX_FILTERS_PER_ACTOR);
    expect(limits?.maxFilterTermsPerFilter).toBe(MAX_FILTER_TERMS_PER_FILTER);
    expect(limits?.maxFilterListsPublishedPerActor).toBe(MAX_FILTER_LISTS_PUBLISHED_PER_ACTOR);
    expect(limits?.maxFilterListEntries).toBe(MAX_FILTER_LIST_ENTRIES);
    expect(limits?.maxFilterListSubscriptions).toBe(MAX_FILTER_LIST_SUBSCRIPTIONS);
    expect(limits?.maxFilterListExceptionsPerList).toBe(MAX_FILTER_LIST_EXCEPTIONS_PER_LIST);
    expect(limits?.maxLabelerSubscriptionsPerActor).toBe(MAX_LABELER_SUBSCRIPTIONS_PER_ACTOR);
    expect(limits?.maxLabelVocabularyEntries).toBe(MAX_LABELER_VOCABULARY_ENTRIES);
    expect(limits?.maxAppealStatementChars).toBe(MAX_APPEAL_STATEMENT_CHARS);
    expect(limits?.accountExportMaxReadyArchives).toBe(ACCOUNT_EXPORT_MAX_READY_ARCHIVES);

    // Every published limit must be nonzero — a zero would silently render as "unlimited" to
    // a client that treats 0 that way elsewhere in this API (spec §204's whole point is a
    // client being able to render "you have N of LIMIT" honestly).
    for (const value of [
      limits?.maxFiltersPerActor,
      limits?.maxFilterTermsPerFilter,
      limits?.maxFilterListsPublishedPerActor,
      limits?.maxFilterListEntries,
      limits?.maxFilterListSubscriptions,
      limits?.maxFilterListExceptionsPerList,
      limits?.maxLabelerSubscriptionsPerActor,
      limits?.maxLabelVocabularyEntries,
      limits?.maxAppealStatementChars,
      limits?.accountExportMaxReadyArchives,
    ]) {
      expect(value).toBeGreaterThan(0);
    }
  });
});

describe('NodeService.getNodePolicy (P14-012, spec §197.6)', () => {
  it('renders an honest all-empty-ish policy when nothing is configured', async () => {
    const service = new NodeService(fakeConfig(), FIXED_VERSION, fakeDataSource([]));
    const { policy } = await service.getNodePolicy();

    expect(policy?.privacyNoticeUrl).toBe('');
    expect(policy?.privacyNoticeSummary).toBe('');
    expect(policy?.termsUrl).toBe('');
    expect(policy?.appealInstructions).toBe('');
    expect(policy?.operatorIdentity).toBe('');
    expect(policy?.privacyNoticeVersion).toBe(0);
    expect(policy?.moderatorContact).toBe('');
    expect(policy?.domainPolicies).toEqual([]);
    expect(policy?.labelVocabulary).toEqual([]);
    // Federation disabled and no explicit stance ⇒ derived DISABLED, never left UNSPECIFIED.
    expect(policy?.federationStance).toBe(FederationStance.FEDERATION_STANCE_DISABLED);
    expect(policy?.accountDeletionGracePeriodDays).toBe(30);
    expect(policy?.appealWindowDays).toBe(14);
    // No retention sweep exists yet for these three — honest zero, not a guess.
    expect(policy?.retention?.evidenceSnapshotRetentionDays).toBe(0);
    expect(policy?.retention?.uploadedOriginalRetentionDays).toBe(0);
    expect(policy?.retention?.logRetentionDays).toBe(0);
    // Fixed platform default (`ACCOUNT_EXPORT_EXPIRES_AFTER_DAYS`), not a guess either.
    expect(policy?.retention?.exportArchiveRetentionDays).toBe(7);
  });

  it('publishes domain_blocks as the public domain policy, action BLOCK', async () => {
    const service = new NodeService(
      fakeConfig(),
      FIXED_VERSION,
      fakeDataSource([domainBlock('evil.example', 'SPAM'), domainBlock('bad.example', 'HATE')]),
    );
    const { policy } = await service.getNodePolicy();

    expect(policy?.domainPolicies).toEqual([
      {
        domain: 'evil.example',
        action: DomainPolicyAction.DOMAIN_POLICY_ACTION_BLOCK,
        reasonCategory: ModerationReasonCategory.MODERATION_REASON_CATEGORY_SPAM,
      },
      {
        domain: 'bad.example',
        action: DomainPolicyAction.DOMAIN_POLICY_ACTION_BLOCK,
        reasonCategory: ModerationReasonCategory.MODERATION_REASON_CATEGORY_HATE,
      },
    ]);
  });

  it('derives OPEN_WITH_BLOCKLIST when federation is enabled and no stance is set', async () => {
    const service = new NodeService(
      fakeConfig({ FEDERATION_ENABLED: true }),
      FIXED_VERSION,
      fakeDataSource([]),
    );
    const { policy } = await service.getNodePolicy();
    expect(policy?.federationStance).toBe(FederationStance.FEDERATION_STANCE_OPEN_WITH_BLOCKLIST);
  });

  it('honors an explicit FEDERATION_STANCE override', async () => {
    const service = new NodeService(
      fakeConfig({ FEDERATION_ENABLED: true, FEDERATION_STANCE: 'allowlist' }),
      FIXED_VERSION,
      fakeDataSource([]),
    );
    const { policy } = await service.getNodePolicy();
    expect(policy?.federationStance).toBe(FederationStance.FEDERATION_STANCE_ALLOWLIST);
  });

  it('joins NODE_MODERATORS into moderator_contact', async () => {
    const service = new NodeService(
      fakeConfig({ NODE_MODERATORS: ['alice', 'bob'] }),
      FIXED_VERSION,
      fakeDataSource([]),
    );
    const { policy } = await service.getNodePolicy();

    expect(policy?.moderatorContact).toBe('alice, bob');
  });

  // P14-026 (spec §200.3, §203): label_vocabulary is published straight from the node's own
  // `labelers` row, mandatory flags included — not from `LABEL_VOCABULARY` directly, since only
  // the DB row (settable via `patches-admin labeler vocabulary set-mandatory`) carries them.
  it('publishes the node labeler’s vocabulary from its labelers row, including mandatory values', async () => {
    const service = new NodeService(
      fakeConfig(),
      FIXED_VERSION,
      fakeDataSource(
        [],
        [
          { value: 'spam', description: '', defaultAction: 'WARN', mandatory: false },
          { value: 'nsfw', description: 'Adult content', defaultAction: 'HIDE', mandatory: true },
        ],
      ),
    );
    const { policy } = await service.getNodePolicy();

    expect(policy?.labelVocabulary).toEqual([
      {
        value: 'spam',
        description: '',
        defaultAction: LabelAction.LABEL_ACTION_WARN,
        mandatory: false,
      },
      {
        value: 'nsfw',
        description: 'Adult content',
        defaultAction: LabelAction.LABEL_ACTION_HIDE,
        mandatory: true,
      },
    ]);
  });

  it('publishes an empty label_vocabulary when no node labeler has been seeded yet', async () => {
    const service = new NodeService(fakeConfig(), FIXED_VERSION, fakeDataSource([], null));
    const { policy } = await service.getNodePolicy();
    expect(policy?.labelVocabulary).toEqual([]);
  });

  // A-052 (spec §197.1, §197.6): an operator-configured privacy summary, terms URL, appeal
  // instructions, and operator identity all flow straight through from `AppConfigService`.
  it('publishes the operator-configured privacy summary, terms URL, appeal instructions, and operator identity', async () => {
    const service = new NodeService(
      fakeConfig({
        PRIVACY_NOTICE_SUMMARY: 'We store your posts and DMs; DMs are readable by operators.',
        TERMS_URL: 'https://patches.test/terms',
        APPEAL_INSTRUCTIONS: 'Email appeals@patches.test with your handle and notice ID.',
        OPERATOR_CONTACT: 'Operated by the Patches test node maintainers.',
      }),
      FIXED_VERSION,
      fakeDataSource([]),
    );
    const { policy } = await service.getNodePolicy();

    expect(policy?.privacyNoticeSummary).toBe(
      'We store your posts and DMs; DMs are readable by operators.',
    );
    expect(policy?.termsUrl).toBe('https://patches.test/terms');
    expect(policy?.appealInstructions).toBe(
      'Email appeals@patches.test with your handle and notice ID.',
    );
    expect(policy?.operatorIdentity).toBe('Operated by the Patches test node maintainers.');
  });
});
