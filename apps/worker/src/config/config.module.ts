import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { AppConfigService } from './app-config.service.js';
import { validateEnv } from './env.schema.js';

@Global()
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      // `main.ts` loads the repo-root `.env` itself (non-production only); see the same
      // setting in apps/server — reading `<cwd>/.env` here made tests cwd-dependent.
      ignoreEnvFile: true,
      // `validate` runs before any provider is instantiated, so a malformed
      // environment aborts the boot instead of failing later at claim time.
      validate: validateEnv,
    }),
  ],
  providers: [AppConfigService],
  exports: [AppConfigService],
})
export class AppConfigModule {}
