#!/usr/bin/env node

/**
 * Build the small, retry-safe packet passed to an autonomous worker.
 * Input and output are JSON so Polyphony can call this without a package install.
 */

export const LIMITS = Object.freeze({
  contextChars: 32_000,
  contextLines: 240,
  fieldChars: 4_000,
  fieldLines: 80,
  commandChars: 6_000,
  commandLines: 120,
  maxChangedFiles: 40,
  maxCommands: 8,
  inputTokenWarn: 40_000,
  inputTokenStop: 60_000,
  outputTokenWarn: 12_000,
  noProgressStop: 3,
  growthStopChars: 8_000,
});

const EXCLUDED =
  /(^|\/)(?:node_modules|dist|build|coverage|\.git|\.turbo|generated)(?:\/|$)|(?:^|\/)(?:tasks\.md|INITIAL_VISION\.md|pnpm-lock\.yaml)$|(?:^|\/)[^/]*\.generated\.[^/]+$|\.(?:lock|zip|tgz|gz|tar|7z)$/i;

function bounded(value, limit = LIMITS.fieldChars) {
  const text = typeof value === 'string' ? value : value == null ? '' : JSON.stringify(value);
  if (text.length <= limit) return text;
  const marker = `\n[… truncated; ${text.length - limit} chars omitted]`;
  return `${text.slice(0, Math.max(0, limit - marker.length))}${marker}`;
}

function boundedLines(value, charLimit, lineLimit) {
  const text = bounded(value, charLimit);
  const lines = text.split('\n');
  if (lines.length <= lineLimit) return text;
  const omitted = lines.length - lineLimit;
  return `${lines.slice(0, lineLimit).join('\n')}\n[… truncated; ${omitted} lines omitted]`;
}

function compactCommandOutput(value) {
  const text = typeof value === 'string' ? value : value == null ? '' : JSON.stringify(value);
  const lines = text.split('\n');
  const compact = [];
  for (const line of lines) {
    if (line === compact.at(-1)) continue;
    compact.push(line);
  }
  return boundedLines(compact.join('\n'), LIMITS.commandChars, LIMITS.commandLines);
}

function listChangedFiles(files) {
  if (!Array.isArray(files)) return [];
  return files
    .filter((file) => typeof file === 'string' && !EXCLUDED.test(file))
    .slice(0, LIMITS.maxChangedFiles)
    .map((file) => bounded(file, 300));
}

function checks(checks) {
  if (!Array.isArray(checks)) return [];
  return checks.slice(0, 12).map((check) => ({
    name: bounded(check?.name, 200),
    conclusion: bounded(check?.conclusion, 100),
    url: bounded(check?.url, 500),
  }));
}

function fitPacket(packet) {
  while (JSON.stringify(packet).length > LIMITS.contextChars) {
    if (packet.commandOutput.length > 256) {
      packet.commandOutput = bounded(
        packet.commandOutput,
        Math.floor(packet.commandOutput.length / 2),
      );
    } else if (packet.failingChecks.length > 1) {
      packet.failingChecks.pop();
    } else if (packet.workpad.length > 256) {
      packet.workpad = boundedLines(
        packet.workpad,
        Math.floor(packet.workpad.length / 2),
        LIMITS.fieldLines,
      );
    } else if (packet.targetedCommands.length > 1) {
      packet.targetedCommands.pop();
    } else if (packet.targetedCommands[0]?.length > 256) {
      packet.targetedCommands[0] = bounded(packet.targetedCommands[0], 256);
    } else if (packet.changedFiles.length > 1) {
      packet.changedFiles.pop();
    } else if (packet.changedFiles[0]?.length > 256) {
      packet.changedFiles[0] = bounded(packet.changedFiles[0], 256);
    } else {
      packet.changedFiles = [];
      packet.targetedCommands = [];
      packet.workpad = '';
      packet.issue = bounded(packet.issue, 256);
    }
  }
  return packet;
}

export function buildWorkerContext(input) {
  const ci = input?.ciRepair;
  const packet = {
    contract: 'patches-worker-context/v1',
    issue: boundedLines(input?.issue, 2_000, LIMITS.fieldLines),
    changedFiles: listChangedFiles(input?.changedFiles),
    workpad: boundedLines(input?.workpad, 4_000, LIMITS.fieldLines),
    failingChecks: checks(ci?.failedChecks ?? input?.failingChecks),
    ciRepair: ci
      ? {
          pr: bounded(ci.pr, 200),
          commitSha: bounded(ci.commitSha, 100),
          priorAttempt: boundedLines(ci.priorAttempt, 2_000, LIMITS.fieldLines),
          discoveryRequired: false,
        }
      : undefined,
    targetedCommands: Array.isArray(input?.targetedCommands)
      ? input.targetedCommands
          .filter((command) => typeof command === 'string')
          .slice(0, LIMITS.maxCommands)
          .map((command) => boundedLines(command, 1_000, 20))
      : [],
    commandOutput: compactCommandOutput(input?.commandOutput),
  };
  fitPacket(packet);
  const json = JSON.stringify(packet);
  const telemetry = input?.telemetry ?? {};
  const inputTokens = Number.isFinite(telemetry.inputTokens) ? telemetry.inputTokens : undefined;
  const outputTokens = Number.isFinite(telemetry.outputTokens) ? telemetry.outputTokens : undefined;
  const contextGrowthChars = Number.isFinite(telemetry.contextGrowthChars)
    ? telemetry.contextGrowthChars
    : undefined;
  const noProgressTurns = Number.isFinite(telemetry.noProgressTurns)
    ? telemetry.noProgressTurns
    : undefined;
  const action =
    inputTokens !== undefined && inputTokens >= LIMITS.inputTokenStop
      ? 'stop'
      : noProgressTurns !== undefined && noProgressTurns >= LIMITS.noProgressStop
        ? 'stop'
        : contextGrowthChars !== undefined && contextGrowthChars >= LIMITS.growthStopChars
          ? 'compress'
          : inputTokens !== undefined && inputTokens >= LIMITS.inputTokenWarn
            ? 'warn'
            : 'ok';
  return {
    ...packet,
    telemetry: {
      inputTokens,
      outputTokens,
      transcriptBytes: Number.isFinite(telemetry.transcriptBytes)
        ? telemetry.transcriptBytes
        : undefined,
      toolCalls: Number.isFinite(telemetry.toolCalls) ? telemetry.toolCalls : undefined,
      wallTimeMs: Number.isFinite(telemetry.wallTimeMs) ? telemetry.wallTimeMs : undefined,
      outcome: typeof telemetry.outcome === 'string' ? bounded(telemetry.outcome, 200) : undefined,
      contextGrowthChars,
      noProgressTurns,
      contextChars: json.length,
      action,
      outputWarning: outputTokens !== undefined && outputTokens >= LIMITS.outputTokenWarn,
    },
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  let source = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (chunk) => {
    source += chunk;
  });
  process.stdin.on('end', () => {
    try {
      const result = buildWorkerContext(JSON.parse(source));
      process.stdout.write(JSON.stringify(result));
      process.exitCode = result.telemetry.action === 'stop' ? 2 : 0;
    } catch (error) {
      process.stderr.write(
        `worker-context: invalid JSON input (${error instanceof Error ? error.message : 'unknown error'})\n`,
      );
      process.exitCode = 1;
    }
  });
}
