import { Inject, Injectable } from '@nestjs/common';
import {
  FederationStance,
  type GetNodeInfoResponse,
  type GetNodePolicyResponse,
  RegistrationMode,
} from '@patches/proto/nest';

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
import { SERVER_VERSION } from './server-version.provider.js';

/** Alt text has no owning validation module yet — `MediaService` lands in Phase 5. The limit
 * itself is fixed by spec §58 already (`posts.proto`'s `MediaAttachment.alt_text` doc), so
 * this is the value, not a placeholder. */
const ALT_TEXT_MAX_LENGTH = 1000;

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
      },
      capabilities: [...CAPABILITIES],
      socialCapabilities: {
        likeGlyphAllowList: this.config.likeGlyphAllowList.filter(isWidthOneGlyph),
        maxPostChars: this.config.maxPostChars,
        canCreateCommunity: this.config.canCreateCommunity,
        dmEnabled: this.config.dmEnabled,
        dmRetentionDays: this.config.dmRetentionDays,
      },
    };
  }

  /**
   * P14-001 lands the `patches.v1.NodeService.GetNodePolicy` contract only (spec §197.6) —
   * populating it from real operator-supplied settings (privacy notice text, moderator
   * contact, domain policies, retention windows) is a follow-up task. An all-empty
   * `NodePolicy` is the honest answer in the meantime: the proto's own doc says a node that
   * publishes nothing here has said so, and clients render that as "this node publishes no
   * policy" rather than hiding the screen — so this is a real, spec-sanctioned response, not
   * a stub error.
   */
  getNodePolicy(): GetNodePolicyResponse {
    return {
      policy: {
        privacyNoticeSummary: '',
        privacyNoticeVersion: 0,
        privacyNoticeUrl: '',
        termsUrl: '',
        moderatorContact: '',
        appealInstructions: '',
        federationStance: FederationStance.FEDERATION_STANCE_UNSPECIFIED,
        domainPolicies: [],
        dataLocation: '',
        retention: {
          dmRetentionDays: 0,
          evidenceSnapshotRetentionDays: 0,
          uploadedOriginalRetentionDays: 0,
          logRetentionDays: 0,
          exportArchiveRetentionDays: 0,
        },
        operatorIdentity: '',
        labelVocabulary: [],
        accountDeletionGracePeriodDays: 0,
        appealWindowDays: 0,
      },
    };
  }
}
