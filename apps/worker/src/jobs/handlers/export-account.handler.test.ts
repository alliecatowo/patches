import { createGunzip } from 'node:zlib';

import type { AccountExport } from '@patches/database';
import type { StorageClient } from '@patches/media';
import { extract as tarExtract } from 'tar-stream';
import { describe, expect, it, vi, type Mock } from 'vitest';

import { buildTarGz, ExportAccountHandler, type ArchiveFile } from './export-account.handler.js';

function fakeStorage(): StorageClient {
  return {
    presignPut: vi.fn(),
    presignGet: vi.fn(),
    head: vi.fn(),
    getObject: vi.fn(),
    putObject: vi.fn().mockResolvedValue(undefined),
    deleteObject: vi.fn().mockResolvedValue(undefined),
  };
}

const payload = {
  exportId: '11111111-1111-4111-8111-111111111111',
  actorId: '22222222-2222-4222-8222-222222222222',
};

/** Un-gzips and un-tars an archive built by `buildTarGz`, returning its entries by name. */
async function readArchive(archive: Buffer): Promise<Map<string, Buffer>> {
  const files = new Map<string, Buffer>();
  const extract = tarExtract();

  await new Promise<void>((resolve, reject) => {
    extract.on('entry', (header, stream, next) => {
      const chunks: Buffer[] = [];
      stream.on('data', (chunk: Buffer) => chunks.push(chunk));
      stream.on('end', () => {
        files.set(header.name, Buffer.concat(chunks));
        next();
      });
      stream.on('error', reject);
      stream.resume();
    });
    extract.on('finish', resolve);
    extract.on('error', reject);

    const gunzip = createGunzip();
    gunzip.pipe(extract);
    gunzip.on('error', reject);
    gunzip.end(archive);
  });

  return files;
}

describe('buildTarGz', () => {
  it('produces a gzipped tar with every file plus a manifest listing each one’s sha256', async () => {
    const files: ArchiveFile[] = [
      { name: 'account.json', buffer: Buffer.from('{"a":1}', 'utf8') },
      { name: 'posts.json', buffer: Buffer.from('{"posts":[]}', 'utf8') },
      { name: 'media/m1.jpg', buffer: Buffer.from([0xff, 0xd8, 0xff, 0x00]) },
    ];

    const archive = await buildTarGz(files);
    const extracted = await readArchive(archive);

    expect(Array.from(extracted.keys()).sort()).toEqual([
      'account.json',
      'manifest.json',
      'media/m1.jpg',
      'posts.json',
    ]);
    expect(extracted.get('account.json')?.toString('utf8')).toBe('{"a":1}');
    expect(extracted.get('media/m1.jpg')).toEqual(Buffer.from([0xff, 0xd8, 0xff, 0x00]));

    const manifest = JSON.parse(extracted.get('manifest.json')!.toString('utf8')) as {
      files: Array<{ name: string; bytes: number; sha256: string }>;
    };
    expect(manifest.files).toHaveLength(3);
    const accountEntry = manifest.files.find((entry) => entry.name === 'account.json');
    expect(accountEntry?.bytes).toBe(files[0]!.buffer.length);
    expect(accountEntry?.sha256).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('ExportAccountHandler', () => {
  it('is a no-op when the export row no longer exists (idempotent redelivery)', async () => {
    const findOne = vi.fn().mockResolvedValue(null);
    const storage = fakeStorage();
    const handler = new ExportAccountHandler(
      { getRepository: () => ({ findOne }) } as never,
      storage,
    );

    await handler.handle(payload, { jobId: '1', attempt: 1 });

    expect(storage.putObject).not.toHaveBeenCalled();
  });

  it('is a no-op when the row is no longer PENDING (already READY/FAILED/EXPIRED)', async () => {
    const ready = { id: payload.exportId, status: 'READY' } as AccountExport;
    const findOne = vi.fn().mockResolvedValue(ready);
    const storage = fakeStorage();
    const handler = new ExportAccountHandler(
      { getRepository: () => ({ findOne }) } as never,
      storage,
    );

    await handler.handle(payload, { jobId: '1', attempt: 1 });

    expect(storage.putObject).not.toHaveBeenCalled();
  });

  it('deletes replaced archives only after the transaction commits (ADR 0039 rule 1)', async () => {
    const exportsRepo = {
      findOne: vi.fn().mockResolvedValue({
        id: payload.exportId,
        actorId: payload.actorId,
        status: 'PENDING',
      }),
      update: vi.fn().mockResolvedValue({ affected: 1 }),
      find: vi.fn().mockResolvedValue([
        {
          id: 'prior-export',
          actorId: payload.actorId,
          status: 'READY',
          objectKey: 'exports/actor/prior.tar.gz',
        },
      ]),
    };

    const storage = fakeStorage();
    let insideTransaction = false;
    (storage.deleteObject as Mock).mockImplementation((_objectKey: string) => {
      // ADR 0039 rule 1: the DELETE must not run while a transaction holds the connection.
      expect(insideTransaction).toBe(false);
      return Promise.resolve(undefined);
    });

    const dataSource = {
      getRepository: () => exportsRepo,
      transaction: vi.fn((fn: (manager: unknown) => unknown) => {
        insideTransaction = true;
        const result = fn({ getRepository: () => exportsRepo });
        insideTransaction = false;
        return result;
      }),
    };

    const handler = new ExportAccountHandler(dataSource as never, storage);
    vi.spyOn(
      handler as unknown as { buildArchiveFiles: () => Promise<ArchiveFile[]> },
      'buildArchiveFiles',
    ).mockResolvedValue([{ name: 'account.json', buffer: Buffer.from('{"a":1}', 'utf8') }]);

    await handler.handle(payload, { jobId: '1', attempt: 1 });

    expect(storage.deleteObject).toHaveBeenCalledTimes(1);
    expect(storage.deleteObject).toHaveBeenCalledWith('exports/actor/prior.tar.gz');
    expect(exportsRepo.update).toHaveBeenCalledWith(
      { id: 'prior-export' },
      { status: 'EXPIRED', objectKey: null },
    );
  });
});
