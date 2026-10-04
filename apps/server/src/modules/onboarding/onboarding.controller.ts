import { Controller } from '@nestjs/common';
import { Payload } from '@nestjs/microservices';
import { dateToTimestamp } from '@patches/proto';
import {
  OnboardingServiceControllerMethods,
  type OnboardingServiceController,
  type RequestInviteRequest,
  type RequestInviteResponse,
  type StartDemoRequest,
  type StartDemoResponse,
} from '@patches/proto/nest';

import { toProtoSession } from '../auth/auth.mapper.js';
import { DemoSandboxService } from './demo-sandbox.service.js';
import { InviteRequestService } from './invite-request.service.js';

/**
 * Transport adapter for `patches.v1.OnboardingService` (ADR 0044). Both RPCs are
 * unauthenticated by design: the caller is a signed-out visitor.
 */
@Controller()
@OnboardingServiceControllerMethods()
export class OnboardingController implements OnboardingServiceController {
  constructor(
    private readonly demo: DemoSandboxService,
    private readonly inviteRequests: InviteRequestService,
  ) {}

  async startDemo(@Payload() _request: StartDemoRequest): Promise<StartDemoResponse> {
    const sandbox = await this.demo.start();
    return {
      session: toProtoSession(sandbox.visitor),
      friends: sandbox.friends.map((session) => ({ session: toProtoSession(session) })),
      expiresAt: dateToTimestamp(sandbox.expiresAt),
    };
  }

  async requestInvite(@Payload() request: RequestInviteRequest): Promise<RequestInviteResponse> {
    await this.inviteRequests.request(request.contact, request.message);
    return {};
  }
}
