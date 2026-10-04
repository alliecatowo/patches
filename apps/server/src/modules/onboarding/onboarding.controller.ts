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

import { AppError } from '../../common/errors/app-error.js';
import { toProtoSession } from '../auth/auth.mapper.js';
import { DemoSandboxService } from './demo-sandbox.service.js';

/**
 * Transport adapter for `patches.v1.OnboardingService` (ADR 0044). Both RPCs are
 * unauthenticated by design: the caller is a signed-out visitor.
 */
@Controller()
@OnboardingServiceControllerMethods()
export class OnboardingController implements OnboardingServiceController {
  constructor(private readonly demo: DemoSandboxService) {}

  async startDemo(@Payload() _request: StartDemoRequest): Promise<StartDemoResponse> {
    const sandbox = await this.demo.start();
    return {
      session: toProtoSession(sandbox.visitor),
      friends: sandbox.friends.map((session) => ({ session: toProtoSession(session) })),
      expiresAt: dateToTimestamp(sandbox.expiresAt),
    };
  }

  requestInvite(@Payload() _request: RequestInviteRequest): Promise<RequestInviteResponse> {
    return Promise.reject(
      new AppError('NOT_IMPLEMENTED', 'Invite requests are not available yet.'),
    );
  }
}
