import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const DEFAULT_EDITOR = 'vi';

export interface EditInEditorOptions {
  env?: NodeJS.ProcessEnv;
  /** Injectable for tests — replaces the real terminal hand-off with something that
   * can mutate the temp file deterministically instead of taking over a real TTY
   * (mirrors `media/open-external.ts`'s `spawnFn`). */
  runEditor?: (path: string) => void;
  stdin?: NodeJS.ReadStream;
}

export interface EditResult {
  status: 'edited' | 'spawn-failed';
  text: string;
}

/** Splits `$VISUAL`/`$EDITOR` into a command + argument array — never through a shell
 * (spec §76's "argument arrays / no-shell process execution" convention, reused here for
 * the same reason: an editor command composed from an env var must not be interpolated
 * into a shell string). */
function parseEditorCommand(raw: string): [string, string[]] {
  const parts = raw
    .trim()
    .split(/\s+/)
    .filter((part) => part !== '');
  const [command, ...args] = parts.length > 0 ? parts : [DEFAULT_EDITOR];
  return [command ?? DEFAULT_EDITOR, args];
}

/**
 * Writes `initialText` to a temp file, hands the terminal to `$VISUAL`/`$EDITOR`
 * (P45-006's "or raw JSON in `$EDITOR`" flow) via a blocking, argument-array-only spawn,
 * and returns whatever the editor left behind once it exits.
 *
 * Ink keeps holding the alternate screen throughout — most editors (vim, nano, emacs
 * -nw) enter and restore their *own* alternate screen on start/exit, which is what
 * makes the terminal come back looking like Ink's last frame with no explicit redraw
 * here; `docs/architecture/tui.md` documents this as a known limitation for editors
 * that don't (e.g. a bare `cat`-style `$EDITOR`).
 */
export async function editInExternalEditor(
  initialText: string,
  options: EditInEditorOptions = {},
): Promise<EditResult> {
  const env = options.env ?? process.env;
  const dir = await mkdtemp(join(tmpdir(), 'patches-page-edit-'));
  const path = join(dir, 'page.json');
  try {
    await writeFile(path, initialText, 'utf8');

    if (options.runEditor !== undefined) {
      options.runEditor(path);
    } else {
      const stdin = options.stdin ?? process.stdin;
      const wasRaw = stdin.isTTY && stdin.isRaw;
      if (stdin.isTTY) stdin.setRawMode(false);
      const [command, args] = parseEditorCommand(env.VISUAL ?? env.EDITOR ?? DEFAULT_EDITOR);
      const result = spawnSync(command, [...args, path], { stdio: 'inherit', shell: false });
      if (stdin.isTTY) stdin.setRawMode(wasRaw === true);
      if (result.error !== undefined) {
        const text = await readFile(path, 'utf8');
        return { status: 'spawn-failed', text };
      }
    }

    const text = await readFile(path, 'utf8');
    return { status: 'edited', text };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
