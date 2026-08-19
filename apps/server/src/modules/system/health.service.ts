import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

import { ReadinessState } from './readiness-state.js';

export interface HealthCheckResult {
  ok: boolean;
  database: boolean;
  serving: boolean;
}

/**
 * The logic behind `GET /healthz` (A-043), answered by `HealthController` on the always-on
 * HTTP adapter (ADR 0016 §4). One definition of "healthy": the gRPC health status is SERVING
 * (mirrored via `ReadinessState`) and the database answers a trivial query.
 */
@Injectable()
export class HealthService {
  private readonly logger = new Logger(HealthService.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly readiness: ReadinessState,
  ) {}

  async check(): Promise<HealthCheckResult> {
    const serving = this.readiness.isServing();
    const database = await this.pingDatabase();
    return { ok: serving && database, database, serving };
  }

  private async pingDatabase(): Promise<boolean> {
    try {
      await this.dataSource.query('SELECT 1');
      return true;
    } catch (error) {
      // Not actionable here beyond "unhealthy" — the specific error belongs in logs, not the
      // health response body a load balancer reads.
      this.logger.warn(`healthz database check failed: ${String(error)}`);
      return false;
    }
  }
}
