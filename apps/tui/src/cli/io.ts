import { createInterface } from 'node:readline';

/**
 * The prompt/output surface every auth subcommand goes through, so tests can
 * inject a scripted fake instead of driving a real terminal (spec §68: no
 * network/IO reaches straight into command logic untestably).
 */
export interface CliIo {
  readonly isTTY: boolean;
  stdout(text: string): void;
  stderr(text: string): void;
  prompt(question: string): Promise<string>;
  promptPassword(question: string): Promise<string>;
  readStdin(): Promise<string>;
}

function readAllStdin(): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk: string) => {
      data += chunk;
    });
    process.stdin.on('end', () => {
      resolve(data.replace(/\r?\n$/, ''));
    });
    process.stdin.on('error', reject);
  });
}

/**
 * Node has no built-in masked-input prompt. Overriding `_writeToOutput` to
 * swallow echoed keystrokes after the prompt text itself has been written is
 * the standard workaround (used by e.g. `npm`'s own CLI prompts) for avoiding
 * an extra dependency just for password masking; it relies on a documented-if-
 * private `readline.Interface` field, hence the cast and the comment.
 */
function promptMasked(question: string): Promise<string> {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    const withInternals = rl as unknown as { _writeToOutput: (text: string) => void };
    let masking = false;
    withInternals._writeToOutput = (text: string) => {
      if (!masking) process.stdout.write(text);
    };
    rl.question(question, (answer) => {
      rl.close();
      process.stdout.write('\n');
      resolve(answer);
    });
    masking = true;
  });
}

function promptPlain(question: string): Promise<string> {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

export function createNodeIo(): CliIo {
  return {
    isTTY: process.stdin.isTTY === true && process.stdout.isTTY === true,
    stdout: (text) => process.stdout.write(text),
    stderr: (text) => process.stderr.write(text),
    prompt: promptPlain,
    promptPassword: promptMasked,
    readStdin: readAllStdin,
  };
}
