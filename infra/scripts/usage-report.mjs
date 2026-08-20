#!/usr/bin/env node
/**
 * Context-economy meter (H-010). Reads the Claude Code transcripts for this project and
 * reports the numbers `docs/agents/CONTEXT_ECONOMY.md` is written around, so "is it getting
 * better?" is a command rather than a feeling.
 *
 *   mise run usage              # this project, all sessions found
 *   mise run usage -- --json    # machine-readable, for diffing across sessions
 *   mise run usage -- --since 2026-08-19
 *
 * Per-request usage lives in JSONL: the main session under
 * `~/.claude/projects/<slug>/<session>.jsonl`, each subagent under
 * `${TMPDIR:-/tmp}/claude-<uid>/<slug>/<session>/tasks/<agent>.output`. An assistant entry
 * carries `message.usage` (input/cache_read/cache_creation/output) and `message.content[]`,
 * whose `tool_use` blocks give that request's tool-call count. "Context size" is the sum of
 * the three input counters — that is what the request actually re-read.
 *
 * TRAP: Claude Code writes ONE API request as SEVERAL JSONL lines (a `thinking` line, then a
 * `tool_use` line, ...), each repeating the *identical* `usage` object. Summing per line
 * inflates every total ~40% and invents a large population of "zero-tool turns" that are
 * really the thinking half of a request that did call a tool. Group by `message.id` first.
 * Everything below counts API requests, not JSONL lines.
 */
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';

const args = process.argv.slice(2);
const asJson = args.includes('--json');
const sinceArg = args[args.indexOf('--since') + 1];
const since = args.includes('--since') && sinceArg !== undefined ? Date.parse(sinceArg) : 0;

/** Claude Code slugifies the project path by replacing every non-alphanumeric run with `-`. */
const slug = process.cwd().replace(/[^a-zA-Z0-9]/g, '-');
const projectDir = join(homedir(), '.claude', 'projects', slug);
const agentRoot = join(tmpdir(), `claude-${String(process.getuid?.() ?? 0)}`, slug);

function walk(dir, match, out = []) {
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) walk(path, match, out);
    else if (match(entry.name)) out.push(path);
  }
  return out;
}

/**
 * One row per API request, which is the unit that pays for a context re-read.
 *
 * Several JSONL lines can share one `message.id` — they are fragments of a single request and
 * repeat its `usage` verbatim. The first fragment wins for the token counters; `tool_use` blocks
 * are summed across all fragments, so a request whose thinking and tool call were logged
 * separately is correctly counted as one request that called one tool.
 */
function turnsIn(path) {
  const byId = new Map();
  let anonymous = 0;
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    if (line === '') continue;
    let entry;
    try {
      entry = JSON.parse(line);
    } catch {
      continue; // partial write, or a non-JSON framing line
    }
    const message = entry?.message;
    if (typeof message !== 'object' || message === null) continue;
    const usage = message.usage;
    if (typeof usage !== 'object' || usage === null) continue;
    const id = typeof message.id === 'string' ? message.id : `anon:${anonymous++}`;
    const content = Array.isArray(message.content) ? message.content : [];
    let turn = byId.get(id);
    if (turn === undefined) {
      turn = {
        model: typeof message.model === 'string' ? message.model : 'unknown',
        context:
          (usage.input_tokens ?? 0) +
          (usage.cache_read_input_tokens ?? 0) +
          (usage.cache_creation_input_tokens ?? 0),
        cacheRead: usage.cache_read_input_tokens ?? 0,
        output: usage.output_tokens ?? 0,
        tools: 0,
      };
      byId.set(id, turn);
    }
    turn.tools += content.filter((block) => block?.type === 'tool_use').length;
  }
  return [...byId.values()];
}

function collect(paths) {
  const contexts = [];
  for (const path of paths) {
    if (since > 0 && statSync(path).mtimeMs < since) continue;
    const turns = turnsIn(path);
    if (turns.length > 0) contexts.push({ path, turns });
  }
  return contexts;
}

const main = collect(walk(projectDir, (name) => name.endsWith('.jsonl')));
const subagents = collect(walk(agentRoot, (name) => name.endsWith('.output')));

function totals(contexts) {
  const turns = contexts.flatMap((context) => context.turns);
  const sum = (pick) => turns.reduce((acc, turn) => acc + pick(turn), 0);
  return {
    contexts: contexts.length,
    turns: turns.length,
    toolCalls: sum((t) => t.tools),
    cacheRead: sum((t) => t.cacheRead),
    contextTokens: sum((t) => t.context),
    output: sum((t) => t.output),
    noToolTokens: turns.filter((t) => t.tools === 0).reduce((acc, t) => acc + t.context, 0),
    noToolTurns: turns.filter((t) => t.tools === 0).length,
    above100k: turns.reduce((acc, t) => acc + Math.max(0, t.context - 100_000), 0),
    above200k: turns.reduce((acc, t) => acc + Math.max(0, t.context - 200_000), 0),
  };
}

const report = {
  project: process.cwd(),
  main: totals(main),
  subagents: totals(subagents),
  all: totals([...main, ...subagents]),
  worstAgents: subagents
    .map((context) => ({
      turns: context.turns.length,
      cacheRead: context.turns.reduce((acc, t) => acc + t.cacheRead, 0),
      meanContext: Math.round(
        context.turns.reduce((acc, t) => acc + t.context, 0) / context.turns.length,
      ),
    }))
    .sort((a, b) => b.cacheRead - a.cacheRead)
    .slice(0, 5),
};

if (asJson) {
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  process.exit(0);
}

const B = (n) => `${(n / 1e9).toFixed(2)}B`;
const M = (n) => `${(n / 1e6).toFixed(1)}M`;
const pct = (part, whole) => (whole === 0 ? '0%' : `${Math.round((part / whole) * 100)}%`);
const { all, main: mainTotals, subagents: subTotals } = report;

const lines = [
  `context economy — ${report.project}`,
  ``,
  `  cache reads      ${B(all.cacheRead)}   (orchestrator ${pct(mainTotals.cacheRead, all.cacheRead)}, subagents ${pct(subTotals.cacheRead, all.cacheRead)})`,
  `  output           ${M(all.output)}   amplification ${Math.round(all.cacheRead / Math.max(all.output, 1))}:1`,
  `  API requests     ${all.turns} across ${all.contexts} contexts`,
  `  tool calls/req   ${(all.toolCalls / Math.max(all.turns, 1)).toFixed(2)}   ← batching; 1.0 means never batched`,
  `  no-tool requests ${pct(all.noToolTurns, all.turns)} of requests, ${pct(all.noToolTokens, all.contextTokens)} of tokens   ← narration`,
  `  read above 100k  ${pct(all.above100k, all.contextTokens)} of tokens   ← agent lifetime`,
  `  read above 200k  ${pct(all.above200k, all.contextTokens)} of tokens   ← agent lifetime, tail`,
  ``,
  `  workers only (subagents; the orchestrator is allowed a long context):`,
  `    mean context   ${Math.round(subTotals.contextTokens / Math.max(subTotals.turns, 1) / 1000)}k over ${subTotals.turns} requests`,
  `    above 100k     ${pct(subTotals.above100k, subTotals.contextTokens)} of tokens`,
  `    above 200k     ${pct(subTotals.above200k, subTotals.contextTokens)} of tokens`,
  ``,
  `  worst subagent contexts (cache read / requests / mean context):`,
  ...report.worstAgents.map(
    (agent) =>
      `    ${M(agent.cacheRead).padStart(8)}  ${String(agent.turns).padStart(4)} req  ${Math.round(agent.meanContext / 1000)}k mean`,
  ),
  ``,
  `  targets (docs/agents/CONTEXT_ECONOMY.md): worker above-200k share < 10%, worker above-100k`,
  `  share < 35%, tool calls/req > 1.5. Compare runs with --json --since <date>.`,
];
process.stdout.write(`${lines.join('\n')}\n`);
