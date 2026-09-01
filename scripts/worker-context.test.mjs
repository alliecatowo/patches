import test from 'node:test';
import assert from 'node:assert/strict';
import { buildWorkerContext, LIMITS } from './worker-context.mjs';

test('normal packets exclude repository-scale artifacts and cap command output', () => {
  const result = buildWorkerContext({
    issue: 'Fix the parser',
    changedFiles: [
      'src/parser.ts',
      'tasks.md',
      'INITIAL_VISION.md',
      'pnpm-lock.yaml',
      'dist/parser.js',
      'src/parser.test.ts',
    ],
    commandOutput: 'x'.repeat(20_000),
    targetedCommands: ['pnpm --filter @patches/harness test'],
  });
  assert.deepEqual(result.changedFiles, ['src/parser.ts', 'src/parser.test.ts']);
  assert.ok(result.commandOutput.length <= LIMITS.commandChars + 80);
  assert.ok(JSON.stringify(result).length <= LIMITS.contextChars);
});

test('whole packets stay within the hard context ceiling', () => {
  const result = buildWorkerContext({
    issue: 'i'.repeat(10_000),
    workpad: 'w'.repeat(10_000),
    commandOutput: 'o'.repeat(20_000),
    failingChecks: Array.from({ length: 30 }, (_, index) => ({
      name: `check-${index}`,
      conclusion: 'FAILURE',
      url: 'https://example.test/check',
    })),
  });
  assert.ok(JSON.stringify(result).length <= LIMITS.contextChars);
});

test('large command lists and paths remain bounded without hanging', () => {
  const result = buildWorkerContext({
    changedFiles: Array.from({ length: 80 }, () => 'src/'.padEnd(2_000, 'x')),
    targetedCommands: Array.from({ length: 12 }, () => 'pnpm '.padEnd(8_000, 'x')),
  });
  assert.ok(JSON.stringify(result).length <= LIMITS.contextChars);
  assert.ok(result.targetedCommands[0].includes('truncated'));
});

test('large multiline artifacts are bounded by both bytes and lines', () => {
  const result = buildWorkerContext({
    issue: Array.from({ length: 400 }, (_, index) => `acceptance-${index}`).join('\n'),
    workpad: Array.from({ length: 400 }, (_, index) => `workpad-${index}`).join('\n'),
    commandOutput: Array.from({ length: 400 }, (_, index) => `output-${index}`).join('\n'),
  });
  assert.ok(result.issue.split('\n').length <= LIMITS.fieldLines + 1);
  assert.ok(result.workpad.split('\n').length <= LIMITS.fieldLines + 1);
  assert.ok(result.commandOutput.split('\n').length <= LIMITS.commandLines + 1);
  assert.ok(result.telemetry.contextChars <= LIMITS.contextChars);
});

test('repeated command output is collapsed while preserving failure evidence', () => {
  const result = buildWorkerContext({
    commandOutput: ['FAIL check=typecheck', ...Array(200).fill('same noisy tool line')].join('\n'),
    failingChecks: [{ name: 'typecheck', conclusion: 'FAILURE', url: 'https://example.test/1' }],
  });
  assert.equal(result.commandOutput.split('\n').length, 2);
  assert.equal(result.failingChecks[0].name, 'typecheck');
});

test('CI repair packets preserve actionable evidence without transcript fields', () => {
  const result = buildWorkerContext({
    issue: '#443',
    workpad: 'Attempt 1 changed scripts/worker-context.mjs',
    ciRepair: {
      pr: 441,
      commitSha: 'abc123',
      priorAttempt: 'CI failed after typecheck',
      failedChecks: [
        { name: 'harness tests', conclusion: 'FAILURE', url: 'https://github.com/check/1' },
      ],
    },
  });
  assert.deepEqual(result.failingChecks, [
    { name: 'harness tests', conclusion: 'FAILURE', url: 'https://github.com/check/1' },
  ]);
  assert.equal(result.ciRepair.pr, '441');
  assert.equal(result.ciRepair.commitSha, 'abc123');
  assert.equal(result.ciRepair.discoveryRequired, false);
  assert.equal('transcript' in result, false);
});

test('telemetry warns and stops at explicit input budgets', () => {
  assert.equal(
    buildWorkerContext({ telemetry: { inputTokens: LIMITS.inputTokenWarn } }).telemetry.action,
    'warn',
  );
  assert.equal(
    buildWorkerContext({ telemetry: { inputTokens: LIMITS.inputTokenStop } }).telemetry.action,
    'stop',
  );
  assert.equal(
    buildWorkerContext({ telemetry: { outputTokens: LIMITS.outputTokenWarn } }).telemetry
      .outputWarning,
    true,
  );
  assert.equal(
    buildWorkerContext({ telemetry: { noProgressTurns: LIMITS.noProgressStop } }).telemetry.action,
    'stop',
  );
  assert.equal(
    buildWorkerContext({ telemetry: { contextGrowthChars: LIMITS.growthStopChars } }).telemetry
      .action,
    'compress',
  );
});

test('representative packets retain task outcome metrics within explicit budgets', () => {
  for (const fixture of [
    { issue: 'small fix', targetedCommands: ['pnpm test'] },
    { issue: 'normal fix', workpad: 'changed parser and tests', changedFiles: ['src/parser.ts'] },
    {
      issue: 'repair CI',
      ciRepair: {
        pr: 459,
        commitSha: 'abc123',
        priorAttempt: 'typecheck failed',
        failedChecks: [{ name: 'typecheck', conclusion: 'FAILURE', url: 'https://example.test/1' }],
      },
    },
  ]) {
    const result = buildWorkerContext({
      ...fixture,
      telemetry: {
        inputTokens: 100,
        outputTokens: 20,
        toolCalls: 2,
        wallTimeMs: 50,
        outcome: 'complete',
      },
    });
    assert.ok(result.telemetry.contextChars <= LIMITS.contextChars);
    assert.equal(result.telemetry.action, 'ok');
    assert.equal(result.telemetry.outcome, 'complete');
    assert.equal(result.telemetry.toolCalls, 2);
    assert.equal(result.telemetry.wallTimeMs, 50);
  }
});
