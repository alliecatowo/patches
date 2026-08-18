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
      // `main.ts` loads the repo-root `.env` itself (non-production only, walking up to
      // `pnpm-workspace.yaml`); letting @nestjs/config also read `<cwd>/.env` made the
      // effective environment depend on the working directory — integration tests run
      // from the repo root silently picked up the dev `DATABASE_URL`.
      ignoreEnvFile: true,
      // `validate` runs before any provider is instantiated, so a malformed
      // environment aborts the boot instead of failing later at request time.
      validate: validateEnv,
    }),
  ],
  providers: [AppConfigService],
  exports: [AppConfigService],
})
export class AppConfigModule {}
