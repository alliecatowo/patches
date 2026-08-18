import { type ConfigService } from '@nestjs/config';
import { MIN_CLIENT_VERSION, PROTOCOL_VERSION, timestampToDate } from '@patches/proto';
import { describe, expect, it } from 'vitest';

import { AppConfigService } from '../../config/app-config.service.js';
import { type Env } from '../../config/env.schema.js';
import { AppError } from '../../common/errors/app-error.js';
import { SystemService } from './system.service.js';

/** A minimal `AppConfigService` — SystemService only ever reads `instanceName`. */
function configWithInstanceName(instanceName: string): AppConfigService {
  const stub = {
    get: (key: string) => (key === 'INSTANCE_NAME' ? instanceName : undefined),
  } as unknown as ConfigService<Env, true>;
  return new AppConfigService(stub);
}

const FIXED_VERSION = '9.9.9-test';

describe('SystemService', () => {
  describe('getServerInfo', () => {
    it('reports the injected SERVER_VERSION rather than probing the filesystem itself', () => {
      const service = new SystemService(configWithInstanceName('patches-dev'), FIXED_VERSION);
      const info = service.getServerInfo(new Date('2026-01-01T00:00:00.000Z'));

      expect(info.serverVersion).toBe(FIXED_VERSION);
      expect(info.protocolVersion).toBe(PROTOCOL_VERSION);
      expect(info.minClientVersion).toBe(MIN_CLIENT_VERSION);
      expect(info.instanceName).toBe('patches-dev');
      expect(info.features).toContain('system.ping');
    });

    it('reports the given time as a protobuf Timestamp', () => {
      const service = new SystemService(configWithInstanceName('patches-dev'), FIXED_VERSION);
      const now = new Date('2026-06-15T12:30:00.000Z');

      const info = service.getServerInfo(now);

      expect(timestampToDate(info.serverTime)).toEqual(now);
    });

    it('reflects the configured instance name', () => {
      const service = new SystemService(configWithInstanceName('my-instance'), FIXED_VERSION);
      expect(service.getServerInfo().instanceName).toBe('my-instance');
    });
  });

  describe('ping', () => {
    it('echoes the nonce back with a server timestamp', () => {
      const service = new SystemService(configWithInstanceName('patches-dev'), FIXED_VERSION);
      const now = new Date('2026-03-01T00:00:00.000Z');

      const response = service.ping('hello', now);

      expect(response.nonce).toBe('hello');
      expect(timestampToDate(response.serverTime)).toEqual(now);
    });

    it('accepts a nonce at exactly the 64-byte limit', () => {
      const service = new SystemService(configWithInstanceName('patches-dev'), FIXED_VERSION);
      const nonce = 'a'.repeat(64);
      expect(() => {
        service.ping(nonce);
      }).not.toThrow();
    });

    it('rejects a nonce over the 64-byte limit with a validation AppError', () => {
      const service = new SystemService(configWithInstanceName('patches-dev'), FIXED_VERSION);

      expect(() => {
        service.ping('a'.repeat(65));
      }).toThrow(AppError);

      try {
        service.ping('a'.repeat(65));
        expect.unreachable('expected ping() to throw');
      } catch (error) {
        expect((error as AppError).code).toBe('VALIDATION_ERROR');
      }
    });

    it('counts bytes, not characters, against the nonce limit', () => {
      const service = new SystemService(configWithInstanceName('patches-dev'), FIXED_VERSION);
      // Each 'é' is 2 UTF-8 bytes, so 33 of them is 66 bytes — over the 64-byte limit
      // even though the string is only 33 characters long.
      const nonce = 'é'.repeat(33);

      expect(() => {
        service.ping(nonce);
      }).toThrow(AppError);
    });
  });
});
