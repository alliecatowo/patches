import { open, mkdir, readFile, readdir, rename, rm, chmod } from 'node:fs/promises';

/**
 * The only filesystem surface `FileVaultStore` touches — injected wholesale in tests so
 * torn writes, missing directories, and crash windows can be simulated deterministically.
 * Everything that must be durable goes through a file handle `sync()` before `rename`.
 */
export interface VaultFileHandle {
  writeFile(data: Uint8Array): Promise<void>;
  sync(): Promise<void>;
  close(): Promise<void>;
}

export interface VaultFileOperations {
  mkdir(path: string, options: { recursive: true; mode: number }): Promise<unknown>;
  /** Opens for writing with `O_EXCL` semantics — the lock file and temp files rely on it. */
  openWriteExclusive(path: string, mode: number): Promise<VaultFileHandle>;
  readFile(path: string): Promise<Uint8Array>;
  rename(from: string, to: string): Promise<void>;
  readdir(path: string): Promise<string[]>;
  rm(path: string, options: { force: true }): Promise<void>;
  chmod(path: string, mode: number): Promise<void>;
  /** fsyncs the containing directory so a completed `rename` survives power loss. */
  syncDirectory(path: string): Promise<void>;
  /** Liveness probe used to steal a lock file left by a crashed process. */
  isProcessAlive(pid: number): boolean;
}

function isErrnoException(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error;
}

const DEFAULT_FILE_OPERATIONS: VaultFileOperations = {
  mkdir: (path, options) => mkdir(path, options),
  async openWriteExclusive(path, mode) {
    const handle = await open(path, 'wx', mode);
    return {
      writeFile: (data) => handle.writeFile(data),
      sync: () => handle.sync(),
      close: () => handle.close(),
    };
  },
  readFile: (path) => readFile(path),
  rename: (from, to) => rename(from, to),
  readdir: (path) => readdir(path),
  rm: (path, options) => rm(path, options),
  chmod: (path, mode) => chmod(path, mode),
  async syncDirectory(path) {
    let handle: Awaited<ReturnType<typeof open>> | undefined;
    try {
      handle = await open(path, 'r');
      await handle.sync();
    } catch (error) {
      // Directory fsync is unsupported on some platforms/filesystems (e.g. EPERM on
      // Windows, EINVAL on odd FUSE mounts); the rename above is still atomic there,
      // so durability degrades instead of failing the commit.
      if (
        !isErrnoException(error) ||
        typeof error.code !== 'string' ||
        !['EPERM', 'EINVAL', 'EISDIR', 'ENOTSUP'].includes(error.code)
      ) {
        throw error;
      }
    } finally {
      await handle?.close();
    }
  },
  isProcessAlive(pid) {
    if (pid <= 0) return false;
    try {
      process.kill(pid, 0);
      return true;
    } catch (error) {
      // EPERM means the process exists but is owned by someone else; anything else
      // (ESRCH) means it is gone.
      return isErrnoException(error) && error.code === 'EPERM';
    }
  },
};

export function defaultVaultFileOperations(): VaultFileOperations {
  return DEFAULT_FILE_OPERATIONS;
}
