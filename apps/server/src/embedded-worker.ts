import { spawn, type ChildProcess } from 'node:child_process';
import { resolve } from 'node:path';

/**
 * Scale-to-zero support: when `WORKER_IN_PROCESS=true`, the server machine also runs the job
 * worker (`apps/worker`, a Postgres `FOR UPDATE SKIP LOCKED` poll loop) as a child process, so
 * the only Fly Machine can stop when idle and wake on a request. A separate always-on `worker`
 * Machine could never wake from traffic, since it has no service. Queued work is claimed
 * while the machine is awake; delayed or scheduled jobs simply run on the next wake (every
 * handler is lease-based and idempotent, so late is safe).
 */
export interface EmbeddedWorkerOptions {
  /** Path to the built worker entrypoint; relative paths resolve from the process cwd (/app). */
  readonly entrypoint: string;
  readonly log: (message: string) => void;
  /** Delay before respawning a worker that exited unexpectedly. */
  readonly restartDelayMs?: number;
}

export interface EmbeddedWorker {
  /** Forward SIGTERM so the worker drains in-flight jobs; resolves once the child exits. */
  readonly stop: () => Promise<void>;
}

export function embeddedWorkerEnabled(env: NodeJS.ProcessEnv): boolean {
  return env.WORKER_IN_PROCESS === 'true';
}

export function startEmbeddedWorker(options: EmbeddedWorkerOptions): EmbeddedWorker {
  const { log, restartDelayMs = 5_000 } = options;
  const entrypoint = resolve(options.entrypoint);
  let stopping = false;
  let child: ChildProcess | undefined;
  let restartTimer: NodeJS.Timeout | undefined;
  let exited: Promise<void> = Promise.resolve();

  const launch = (): void => {
    // The server owns the metrics port; the worker must not try to bind it too.
    const proc = spawn(process.execPath, [entrypoint], {
      stdio: 'inherit',
      env: { ...process.env, METRICS_ENABLED: 'false' },
    });
    child = proc;
    log(`embedded worker started (pid=${String(proc.pid)})`);
    exited = new Promise<void>((resolveExit) => {
      proc.once('exit', (code, signal) => {
        child = undefined;
        log(`embedded worker exited (code=${String(code)}, signal=${String(signal)})`);
        if (!stopping) {
          restartTimer = setTimeout(launch, restartDelayMs);
        }
        resolveExit();
      });
    });
  };

  launch();

  return {
    stop: async () => {
      stopping = true;
      if (restartTimer !== undefined) clearTimeout(restartTimer);
      child?.kill('SIGTERM');
      await exited;
    },
  };
}
