import { Injectable } from '@nestjs/common';

/**
 * In-process mirror of the `grpc.health.v1.Health` status `main.ts` flips via the
 * `HealthControl` returned from `createGrpcMicroservice` (`grpc-options.ts`).
 *
 * `HealthImplementation` (the `grpc-health-check` package) has no getter for its current
 * status and isn't part of Nest's DI graph — it's attached straight to the raw `grpc.Server`
 * — so `HealthService` (`GET /healthz`, A-043) can't read it directly. `main.ts` calls
 * `setServing` next to every `health.setStatus` call so the two never drift apart; this class
 * only stores the last value it was told.
 */
@Injectable()
export class ReadinessState {
  private serving = false;

  setServing(serving: boolean): void {
    this.serving = serving;
  }

  isServing(): boolean {
    return this.serving;
  }
}
