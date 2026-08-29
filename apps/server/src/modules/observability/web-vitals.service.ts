import { Injectable } from '@nestjs/common';
import { webVitalsPayloadSchema, type WebVitalsPayload } from '@patches/domain';
import { webVitalsCls, webVitalsInpMs, webVitalsLcpMs } from '@patches/observability/metrics';

export type WebVitalsIngestOutcome =
  | { readonly accepted: true }
  | { readonly accepted: false; readonly reason: 'malformed_json' | 'invalid_payload' };

/**
 * B-182 — application service for the Web Vitals ingest route (spec §128 layering: the
 * controller only reads the transport bytes and maps the outcome to a status code; this is
 * where the untrusted body is actually parsed/validated and folded into metrics).
 *
 * Every field is treated as hostile input (this is an unauthenticated, internet-facing
 * write endpoint): `webVitalsPayloadSchema` (`@patches/domain`) bounds every string length,
 * the sample array length, and — critically for Prometheus label cardinality — restricts
 * `route` to the shared client/server allow-list, so nothing here ever calls `.observe()`
 * with an attacker-chosen label value.
 */
@Injectable()
export class WebVitalsService {
  ingestRawBody(rawBody: string): WebVitalsIngestOutcome {
    let json: unknown;
    try {
      json = JSON.parse(rawBody);
    } catch {
      return { accepted: false, reason: 'malformed_json' };
    }

    const parsed = webVitalsPayloadSchema.safeParse(json);
    if (!parsed.success) {
      return { accepted: false, reason: 'invalid_payload' };
    }

    this.record(parsed.data);
    return { accepted: true };
  }

  private record(payload: WebVitalsPayload): void {
    for (const sample of payload.samples) {
      switch (sample.name) {
        case 'CLS':
          webVitalsCls.observe({ route: payload.route }, sample.value);
          break;
        case 'INP':
          webVitalsInpMs.observe({ route: payload.route }, sample.value);
          break;
        case 'LCP':
          webVitalsLcpMs.observe({ route: payload.route }, sample.value);
          break;
      }
    }
  }
}
