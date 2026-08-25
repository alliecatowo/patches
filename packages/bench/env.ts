import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { readDotEnvFile } from '@patches/config';

/**
 * Loads the repo-root `.env` (same dev-only pattern as the apps' `main.ts` entrypoints) and
 * returns `DATABASE_URL`, exiting loudly when absent. Benches run by hand against a scratch
 * database (`mise run compose`, a Neon branch) — never pointed at production by accident:
 * `fixtures.ts` truncates every table it knows about.
 */
export function loadBenchDatabaseUrl(): string {
  let current = dirname(fileURLToPath(import.meta.url));
  for (;;) {
    if (existsSync(join(current, 'pnpm-workspace.yaml'))) break;
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }
  for (const [key, value] of Object.entries(readDotEnvFile(join(current, '.env')))) {
    process.env[key] ??= value;
  }
  const url = process.env.DATABASE_URL;
  if (url === undefined || url === '') {
    console.error('DATABASE_URL not set — point it at a scratch database, not production.');
    process.exit(1);
  }
  return url;
}

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

/** Prints a report in the shape `docs/operations/capacity.md` §"measured baselines" expects. */
export function printLatencyReport(label: string, report: LatencyReport): void {
  console.log(`\n=== ${label} ===`);
  console.log(`Samples:    ${String(report.samples)}`);
  console.log(`Min:        ${report.minMs.toFixed(2)} ms`);
  console.log(`Avg:        ${report.avgMs.toFixed(2)} ms`);
  console.log(`P50:        ${report.p50Ms.toFixed(2)} ms`);
  console.log(`P95:        ${report.p95Ms.toFixed(2)} ms`);
  console.log(`P99:        ${report.p99Ms.toFixed(2)} ms`);
  console.log(`Max:        ${report.maxMs.toFixed(2)} ms`);
}

export function intEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  const parsed = raw === undefined ? NaN : Number.parseInt(raw, 10);
  return Number.isNaN(parsed) ? fallback : parsed;
}
