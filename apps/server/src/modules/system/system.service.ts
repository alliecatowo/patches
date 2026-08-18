import { Injectable } from '@nestjs/common';
import {
  dateToTimestamp,
  type GetServerInfoResponse,
  MIN_CLIENT_VERSION,
  type PingResponse,
  PROTOCOL_VERSION,
} from '@patches/proto';

import { AppConfigService } from '../../config/app-config.service.js';
import { AppError } from '../../common/errors/app-error.js';
import { readServerVersion } from './server-build.js';

/** Longest nonce `Ping` will echo back, in bytes (spec §58 — limits always exist). */
const MAX_NONCE_BYTES = 64;

/**
 * Capability flags advertised to clients. Clients must tolerate unknown entries,
 * so adding one here is never a breaking change.
 */
const FEATURES: readonly string[] = Object.freeze(['system.ping']);

@Injectable()
export class SystemService {
  private readonly serverVersion = readServerVersion();

  constructor(private readonly config: AppConfigService) {}

  getServerInfo(now: Date = new Date()): GetServerInfoResponse {
    return {
      serverVersion: this.serverVersion,
      protocolVersion: PROTOCOL_VERSION,
      minClientVersion: MIN_CLIENT_VERSION,
      serverTime: dateToTimestamp(now),
      instanceName: this.config.instanceName,
      features: [...FEATURES],
    };
  }

  ping(nonce: string, now: Date = new Date()): PingResponse {
    if (Buffer.byteLength(nonce, 'utf8') > MAX_NONCE_BYTES) {
      throw AppError.validation(`nonce must be at most ${String(MAX_NONCE_BYTES)} bytes.`);
    }
    return { nonce, serverTime: dateToTimestamp(now) };
  }
}
