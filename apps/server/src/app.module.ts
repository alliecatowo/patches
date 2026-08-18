import { Module } from '@nestjs/common';
import { APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';

import { RpcExceptionsFilter } from './common/errors/rpc-exception.filter.js';
import { RequestContextInterceptor } from './common/interceptors/request-context.interceptor.js';
import { LoggingInterceptor } from './common/logging/logging.interceptor.js';
import { AppConfigModule } from './config/config.module.js';
import { SystemModule } from './modules/system/system.module.js';

@Module({
  imports: [AppConfigModule, SystemModule],
  providers: [
    // Order matters: RequestContextInterceptor establishes the request id that
    // LoggingInterceptor and RpcExceptionsFilter both read.
    { provide: APP_INTERCEPTOR, useClass: RequestContextInterceptor },
    { provide: APP_INTERCEPTOR, useClass: LoggingInterceptor },
    { provide: APP_FILTER, useClass: RpcExceptionsFilter },
  ],
})
export class AppModule {}
