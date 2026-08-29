/**
 * Percentile helpers shared by the `*.perf.test.ts` suite (#199/#200/#205). Deliberately
 * duplicated from `packages/bench/env.ts` rather than imported: `apps/server` never adds a
 * runtime dependency on the standalone DB-only bench package (`@patches/bench` has no gRPC/
 * Nest surface at all — see its module doc comment), and this file is ~30 lines.
 */

export interface LatencyReport {
  samples: number;
  minMs: number;
  avgMs: number;
  p50Ms: number;
  p95Ms: number;
  p99Ms: number;
  maxMs: number;
}

/** Percentile summary over raw latency samples (ms). Throws on zero samples. */
export function latencyReport(samples: number[]): LatencyReport {
  if (samples.length === 0) throw new Error('no latency samples collected');
  const sorted = [...samples].sort((a, b) => a - b);
  const at = (quantile: number): number =>
    sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * quantile))] ?? sorted[0] ?? 0;
  return {
    samples: sorted.length,
    minMs: sorted[0] ?? 0,
    avgMs: sorted.reduce((a, b) => a + b, 0) / sorted.length,
    p50Ms: at(0.5),
    p95Ms: at(0.95),
    p99Ms: at(0.99),
    maxMs: sorted[sorted.length - 1] ?? 0,
  };
}

export function printLatencyReport(label: string, report: LatencyReport): void {
  process.stdout.write(
    [
      '',
      `=== ${label} ===`,
      `Samples: ${String(report.samples)}`,
      `Min:     ${report.minMs.toFixed(2)} ms`,
      `Avg:     ${report.avgMs.toFixed(2)} ms`,
      `P50:     ${report.p50Ms.toFixed(2)} ms`,
      `P95:     ${report.p95Ms.toFixed(2)} ms`,
      `P99:     ${report.p99Ms.toFixed(2)} ms`,
      `Max:     ${report.maxMs.toFixed(2)} ms`,
      '',
    ].join('\n'),
  );
}

/** Times one async call and returns its latency in ms alongside the result. */
export async function timed<T>(run: () => Promise<T>): Promise<{ result: T; ms: number }> {
  const start = performance.now();
  const result = await run();
  return { result, ms: performance.now() - start };
}
