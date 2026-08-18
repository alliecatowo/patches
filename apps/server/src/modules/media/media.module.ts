import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module.js';
import { MediaController } from './media.controller.js';
import { MediaService } from './media.service.js';
import { storageClientProvider } from './storage-client.provider.js';

/** Direct-to-object-storage media upload/download (spec §29–32, §54,
 * `docs/architecture/media.md`). `AuthModule` is imported for `AuthGuard` and the shared
 * `RateLimitService`. */
@Module({
  imports: [AuthModule],
  controllers: [MediaController],
  providers: [MediaService, storageClientProvider],
})
export class MediaModule {}
