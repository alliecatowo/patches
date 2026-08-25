import { constants as fsConstants } from 'node:fs';
import { open } from 'node:fs/promises';

const REQUEST_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const TRACE_ID = /^[0-9a-f]{32}$/u;
const TOKEN = /^[A-Za-z][A-Za-z0-9_.:-]{0,63}$/u;
const MAX_STRING = 128;

export interface BoundedLogSource {
  readonly service: string;
  readonly content: string;
  readonly truncated: boolean;
  readonly bytesRead: number;
}

export async function readBoundedLogTail(
  path: string,
  limits: { maxBytes: number; maxLines: number } = { maxBytes: 262_144, maxLines: 1_000 },
): Promise<BoundedLogSource> {
  if (!Number.isInteger(limits.maxBytes) || limits.maxBytes < 1 || limits.maxBytes > 1_048_576)
    throw new Error('log byte limit must be 1-1048576');
  if (!Number.isInteger(limits.maxLines) || limits.maxLines < 1 || limits.maxLines > 10_000)
    throw new Error('log line limit must be 1-10000');
  const handle = await open(path, fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW);
  try {
    const metadata = await handle.stat();
    if (!metadata.isFile()) throw new Error('log must be a regular file');
    const bytesRead = Math.min(metadata.size, limits.maxBytes);
    const buffer = Buffer.alloc(bytesRead);
    if (bytesRead > 0) await handle.read(buffer, 0, bytesRead, metadata.size - bytesRead);
    let lines = buffer.toString('utf8').split(/\r?\n/u);
    let truncated = metadata.size > bytesRead;
    if (lines.length > limits.maxLines) {
      lines = lines.slice(-limits.maxLines);
      truncated = true;
    }
    return { service: '', content: lines.join('\n'), truncated, bytesRead };
  } finally {
    await handle.close();
  }
}

function clean(value: string): string {
  return [...value]
    .filter((character) => {
      const code = character.codePointAt(0) ?? 0;
      return code >= 32 && code !== 127;
    })
    .join('')
    .slice(0, MAX_STRING);
}

function safeToken(value: string): string | undefined {
  const cleaned = clean(value);
  return TOKEN.test(cleaned) ? cleaned : undefined;
}

export function safeLogLine(line: string, requestId?: string): string | undefined {
  let parsed: unknown;
  try {
    parsed = JSON.parse(line);
  } catch {
    return undefined;
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return undefined;
  const source = parsed as Record<string, unknown>;
  if (requestId !== undefined && source['requestId'] !== requestId) return undefined;
  const output: Record<string, string | number> = {};
  if (typeof source['time'] === 'number' && Number.isFinite(source['time']))
    output['time'] = source['time'];
  if (typeof source['level'] === 'number' && Number.isInteger(source['level']))
    output['level'] = source['level'];
  else if (typeof source['level'] === 'string') {
    const value = safeToken(source['level']);
    if (value !== undefined) output['level'] = value;
  }
  for (const field of ['service', 'event', 'status'] as const) {
    if (typeof source[field] !== 'string') continue;
    const value = safeToken(source[field]);
    if (value !== undefined) output[field] = value;
  }
  if (typeof source['msg'] === 'string') {
    const value = clean(source['msg']);
    output['msg'] = /^[a-z][a-z0-9_-]*(?:[.:][a-z0-9_-]+)+$/u.test(value) ? value : '[REDACTED]';
  }
  if (typeof source['requestId'] === 'string' && REQUEST_ID.test(source['requestId']))
    output['requestId'] = source['requestId'];
  if (typeof source['traceId'] === 'string' && TRACE_ID.test(source['traceId']))
    output['traceId'] = source['traceId'];
  if (
    typeof source['count'] === 'number' &&
    Number.isSafeInteger(source['count']) &&
    source['count'] >= 0
  )
    output['count'] = source['count'];
  return Object.keys(output).length === 0 ? undefined : JSON.stringify(output);
}

export function safeLogOutput(
  sources: readonly BoundedLogSource[],
  options: { requestId?: string; limit: number },
): readonly string[] {
  if (!Number.isInteger(options.limit) || options.limit < 1 || options.limit > 1_000)
    throw new Error('log limit must be 1-1000');
  if (options.requestId !== undefined && !REQUEST_ID.test(options.requestId))
    throw new Error('request ID must be a canonical UUID');
  const output: string[] = [];
  for (const source of sources) {
    for (const line of source.content.split(/\r?\n/u)) {
      if (line === '') continue;
      const safe = safeLogLine(line, options.requestId);
      if (safe !== undefined) output.push(safe);
    }
  }
  const bounded = output.slice(-options.limit);
  if (!sources.some((source) => source.truncated)) return bounded;
  const indicator = JSON.stringify({ event: 'logs.truncated', status: 'truncated' });
  return options.limit === 1 ? [indicator] : [indicator, ...bounded.slice(-(options.limit - 1))];
}

export function writeSafeLogOutput(
  sources: readonly BoundedLogSource[],
  options: { requestId?: string; limit: number },
  write: (content: string) => void = (content) => process.stdout.write(content),
): void {
  for (const line of safeLogOutput(sources, options)) write(`${line}\n`);
}
