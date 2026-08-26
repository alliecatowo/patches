#!/usr/bin/env node
/**
 * `mise run merge-pr -- <pr-number> [--bypass "<reason>"]`
 *
 * Merges a pull request only after the `ci-ok` status check has actually
 * succeeded. `main`'s `protect-main` ruleset already requires `ci-ok`, but it
 * grants repository admins `bypass_mode: always` — so an admin (which the
 * owner, and any agent acting on the owner's `gh` token, is) can merge a red
 * or entirely un-run PR without ever being told they did.
 *
 * That silent bypass is the thing this script removes. The bypass stays
 * available — a run that never dispatches must not be able to brick `main` —
 * but it now has to be asked for by name, with a reason that gets printed and
 * recorded in the merge commit body.
 *
 * Exit codes: 0 merged, 1 refused (or a precondition failed).
 */
import { execFileSync } from 'node:child_process';

const REQUIRED_CHECK = 'ci-ok';

function gh(args) {
  return execFileSync('gh', args, { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
}

function die(message) {
  process.stderr.write(`merge-pr: ${message}\n`);
  process.exit(1);
}

const argv = process.argv.slice(2);
const prNumber = argv[0];
if (prNumber === undefined || !/^\d+$/.test(prNumber)) {
  die('usage: merge-pr <pr-number> [--bypass "<reason>"]');
}

const bypassIndex = argv.indexOf('--bypass');
const bypassReason = bypassIndex === -1 ? null : argv[bypassIndex + 1];
if (bypassIndex !== -1 && (bypassReason === undefined || bypassReason.trim() === '')) {
  die('--bypass requires a reason, e.g. --bypass "Actions queue stalled, verified locally"');
}

let pr;
try {
  pr = JSON.parse(
    gh([
      'pr',
      'view',
      prNumber,
      '--json',
      'number,title,state,mergeable,mergeStateStatus,statusCheckRollup',
    ]),
  );
} catch {
  die(`could not read PR #${prNumber} (is it open, and is \`gh\` authenticated?)`);
}

if (pr.state !== 'OPEN') die(`PR #${prNumber} is ${pr.state}, not OPEN.`);
if (pr.mergeable === 'CONFLICTING') {
  die(`PR #${prNumber} is CONFLICTING — rebase it onto main first.`);
}

// statusCheckRollup mixes check runs (`name`/`conclusion`) and legacy commit
// statuses (`context`/`state`); normalise both before looking for `ci-ok`.
const checks = (pr.statusCheckRollup ?? []).map((check) => ({
  name: check.name ?? check.context ?? '(unnamed)',
  status: check.status ?? 'COMPLETED',
  result: check.conclusion ?? check.state ?? null,
}));
const ciOk = checks.find((check) => check.name === REQUIRED_CHECK);

let refusal = null;
if (ciOk === undefined) {
  refusal =
    checks.length === 0
      ? `no status checks have reported on PR #${prNumber} at all — CI has not run.`
      : `PR #${prNumber} has no \`${REQUIRED_CHECK}\` check. Reported: ${checks
          .map((c) => `${c.name}=${c.result ?? c.status}`)
          .join(', ')}`;
} else if (ciOk.status !== 'COMPLETED') {
  refusal = `\`${REQUIRED_CHECK}\` is ${ciOk.status}, not finished yet — wait for it.`;
} else if (ciOk.result !== 'SUCCESS') {
  refusal = `\`${REQUIRED_CHECK}\` concluded ${ciOk.result}, not SUCCESS.`;
}

if (refusal !== null && bypassReason === null) {
  process.stderr.write(
    `\nmerge-pr: REFUSING to merge PR #${prNumber} — ${pr.title}\n` +
      `  ${refusal}\n\n` +
      `  \`main\` requires \`${REQUIRED_CHECK}\`. You are an admin, so GitHub would let you\n` +
      `  merge anyway — that is exactly what this guard is here to make you do on purpose.\n` +
      `  If you have a real reason (e.g. the Actions queue stalled and you verified the\n` +
      `  branch locally), re-run with:\n\n` +
      `      mise run merge-pr -- ${prNumber} --bypass "<reason>"\n\n`,
  );
  process.exit(1);
}

const mergeArgs = ['pr', 'merge', prNumber, '--squash', '--delete-branch'];
if (refusal !== null) {
  process.stdout.write(
    `\nmerge-pr: BYPASSING the ${REQUIRED_CHECK} gate for PR #${prNumber}.\n` +
      `  Gate said: ${refusal}\n` +
      `  Reason given: ${bypassReason}\n\n`,
  );
  mergeArgs.push('--body', `Merged with the ${REQUIRED_CHECK} gate bypassed: ${bypassReason}`);
} else {
  process.stdout.write(`merge-pr: \`${REQUIRED_CHECK}\` is green on PR #${prNumber}. Merging.\n`);
}

try {
  process.stdout.write(gh(mergeArgs));
} catch (mergeError) {
  // `gh pr merge --delete-branch` exits non-zero when it merged fine but could not
  // delete the *local* branch — which is routine here, since a worker's git worktree
  // usually still has that branch checked out. Reporting that as a merge failure sent
  // the caller off investigating a merge that had already succeeded, so re-read the
  // PR's real state before deciding.
  const output = String(
    (mergeError instanceof Error && 'stderr' in mergeError ? mergeError.stderr : '') ||
      (mergeError instanceof Error ? mergeError.message : ''),
  );
  let mergedAnyway = false;
  try {
    mergedAnyway = JSON.parse(gh(['pr', 'view', prNumber, '--json', 'state'])).state === 'MERGED';
  } catch {
    // Couldn't re-read it — fall through and report the original failure.
  }
  if (!mergedAnyway) die(`\`gh pr merge\` failed for PR #${prNumber}.`);
  process.stdout.write(
    `merge-pr: PR #${prNumber} is MERGED. \`gh\` still exited non-zero:\n` +
      `${output.trim().split('\n').slice(0, 3).join('\n')}\n` +
      `  Treating this as success. Remove the worktree holding the branch to silence it.\n`,
  );
}
