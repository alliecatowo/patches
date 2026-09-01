import { execFileSync } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const workspaceArg = process.argv[2] ?? '';
const workspace = workspaceArg
  ? path.relative(root, path.resolve(root, workspaceArg)).replaceAll(path.sep, '/')
  : '';
const lintable = /\.(?:ts|tsx|mts|cts|js|mjs|cjs)$/i;

function gitFiles(args, optional = false) {
  try {
    return execFileSync('git', args, { cwd: root, encoding: 'utf8' })
      .split('\0')
      .filter(Boolean);
  } catch (error) {
    if (optional) return [];
    const detail = error instanceof Error ? error.message : String(error);
    console.error(`Unable to determine changed files: ${detail}`);
    process.exit(1);
  }
}

const files = new Set([
  // A local clone may not have origin/main yet; worktree and staged/untracked
  // discovery below remains sufficient for the local changed-file gate.
  ...gitFiles(['diff', '--name-only', '--diff-filter=ACMR', 'origin/main...HEAD'], true),
  ...gitFiles(['diff', '--name-only', '--diff-filter=ACMR']),
  ...gitFiles(['diff', '--cached', '--name-only', '--diff-filter=ACMR']),
  ...gitFiles(['ls-files', '--others', '--exclude-standard']),
]);

const selected = [...files]
  .filter((file) => lintable.test(file))
  .filter((file) => !workspace || file === workspace || file.startsWith(`${workspace}/`))
  .sort();

if (selected.length === 0) {
  console.log(workspace ? `No changed lintable files under ${workspace}` : 'No changed lintable files');
  process.exit(0);
}

console.log(`Linting ${selected.length} changed file${selected.length === 1 ? '' : 's'} uncached`);
execFileSync('pnpm', ['exec', 'eslint', '--no-cache', ...selected], {
  cwd: root,
  stdio: 'inherit',
});
