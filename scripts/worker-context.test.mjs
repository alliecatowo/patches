import test from 'node:test';
import assert from 'node:assert/strict';
import { buildWorkerContext, LIMITS } from './worker-context.mjs';

test('normal packets exclude repository-scale artifacts and cap command output', () => {
  const result = buildWorkerContext({
    issue: 'Fix the parser',
    changedFiles: ['src/parser.ts', 'tasks.md', 'INITIAL_VISION.md', 'pnpm-lock.yaml', 'dist/parser.js', 'src/parser.test.ts'],
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
    failingChecks: Array.from({ length: 30 }, (_, index) => ({ name: `check-${index}`, conclusion: 'FAILURE', url: 'https://example.test/check' })),
  });
  assert.ok(JSON.stringify(result).length <= LIMITS.contextChars);
});

test('CI repair packets preserve actionable evidence without transcript fields', () => {
  const result = buildWorkerContext({
    issue: '#443',
    workpad: 'Attempt 1 changed scripts/worker-context.mjs',
    ciRepair: {
      pr: 441,
      commitSha: 'abc123',
      priorAttempt: 'CI failed after typecheck',
      failedChecks: [{ name: 'harness tests', conclusion: 'FAILURE', url: 'https://github.com/check/1' }],
    },
  });
  assert.deepEqual(result.failingChecks, [{ name: 'harness tests', conclusion: 'FAILURE', url: 'https://github.com/check/1' }]);
  assert.equal(result.ciRepair.pr, '441');
  assert.equal(result.ciRepair.commitSha, 'abc123');
  assert.equal('transcript' in result, false);
});

test('telemetry warns and stops at explicit input budgets', () => {
  assert.equal(buildWorkerContext({ telemetry: { inputTokens: LIMITS.inputTokenWarn } }).telemetry.action, 'warn');
  assert.equal(buildWorkerContext({ telemetry: { inputTokens: LIMITS.inputTokenStop } }).telemetry.action, 'stop');
  assert.equal(buildWorkerContext({ telemetry: { outputTokens: LIMITS.outputTokenWarn } }).telemetry.outputWarning, true);
});
