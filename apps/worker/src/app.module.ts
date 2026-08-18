import { Module } from '@nestjs/common';

import { AppConfigModule } from './config/config.module.js';
import { JobRunnerModule } from './jobs/job-runner.module.js';

@Module({
  imports: [AppConfigModule, JobRunnerModule],
})
export class AppModule {}
