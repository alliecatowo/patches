import { type ConfigService } from '@nestjs/config';
import { DomainBlock, Labeler } from '@patches/database';
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
    NODE_MODERATORS: [],
    FEDERATION_STANCE: undefined,
    DATA_LOCATION: '',
    PRIVACY_NOTICE_VERSION: 0,
    APPEAL_WINDOW_DAYS: 14,
    ACCOUNT_DELETION_GRACE_PERIOD_DAYS: 30,
    LABEL_VOCABULARY: [],
    FEDERATION_ENABLED: false,
    PUBLIC_READ: true,
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
});

describe('NodeService.getNodePolicy (P14-012, spec §197.6)', () => {
  it('renders an honest all-empty-ish policy when nothing is configured', async () => {
    const service = new NodeService(fakeConfig(), FIXED_VERSION, fakeDataSource([]));
    const { policy } = await service.getNodePolicy();

    expect(policy?.privacyNoticeUrl).toBe('');
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
});
