import { DynamicModule, Module } from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';
import type { IncomingMessage } from 'http';

@Module({})
export class PinoLoggerModule {
  static forRoot(): DynamicModule {
    return LoggerModule.forRoot({
      pinoHttp: {
        redact: {
          paths: [
            'req.headers.authorization',
            'req.headers.cookie',
            'res.headers',
            '*.token',
            '*.password',
            '*.secret',
          ],
          censor: '[REDACTED]',
        },
        customProps: (req: IncomingMessage) => ({
          traceId:
            (req.headers['x-request-id'] as string) ||
            (req.headers['x-b3-traceid'] as string) ||
            undefined,
        }),
      },
      exclude: ['/healthz', '/metrics'],
    });
  }
}
