import { Inject, Injectable } from '@nestjs/common';
import { type GetNodeInfoResponse, RegistrationMode } from '@patches/proto/nest';

import { AppConfigService } from '../../config/app-config.service.js';
import {
  BIO_MAX_LENGTH,
  DISPLAY_NAME_MAX_LENGTH,
  LOCATION_TEXT_MAX_LENGTH,
  SEARCH_QUERY_MAX_LENGTH,
  WEBSITE_URL_MAX_LENGTH,
} from '../actors/validation.js';
import { HANDLE_MAX_LENGTH } from '../auth/validation.js';
import { POST_BODY_MAX_LENGTH } from '../posts/validation.js';
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
        postBodyMaxChars: POST_BODY_MAX_LENGTH,
        bioMaxChars: BIO_MAX_LENGTH,
        displayNameMaxChars: DISPLAY_NAME_MAX_LENGTH,
        handleMaxChars: HANDLE_MAX_LENGTH,
        locationTextMaxChars: LOCATION_TEXT_MAX_LENGTH,
        websiteUrlMaxChars: WEBSITE_URL_MAX_LENGTH,
        altTextMaxChars: ALT_TEXT_MAX_LENGTH,
        searchQueryMaxChars: SEARCH_QUERY_MAX_LENGTH,
      },
      capabilities: [...CAPABILITIES],
    };
  }
}
