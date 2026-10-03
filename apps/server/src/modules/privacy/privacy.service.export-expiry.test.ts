import { describe, expect, it, vi } from 'vitest';

import { PrivacyService } from './privacy.service.js';

function serviceWith(row: Record<string, unknown>) {
  const presignGet = vi.fn().mockResolvedValue({ url: 'https://download.example/archive' });
  const dataSource = { getRepository: () => ({ findOne: vi.fn().mockResolvedValue(row) }) };
  const service = new PrivacyService(
    dataSource as never,
    { presignGet } as never,
    { mediaPresignGetTtlSeconds: 600 } as never,
    {} as never,
    {} as never,
  );
  return { service, presignGet };
}

const base = {
  id: 'export-1',
  status: 'READY',
  objectKey: 'exports/1.tar.gz',
  requestedAt: new Date('2026-10-01T00:00:00Z'),
  readyAt: new Date('2026-10-01T00:05:00Z'),
};

describe('PrivacyService.getExportStatus expiry (S-M7)', () => {
  it('serves a presigned URL for a READY export that has not expired', async () => {
    const { service, presignGet } = serviceWith({
      ...base,
      expiresAt: new Date(Date.now() + 60_000),
    });
    const view = await service.getExportStatus('actor-1');
    expect(view?.downloadUrl).toBe('https://download.example/archive');
    expect(presignGet).toHaveBeenCalledOnce();
  });

  it('reports EXPIRED with no URL once expiresAt has passed', async () => {
    const { service, presignGet } = serviceWith({
      ...base,
      expiresAt: new Date(Date.now() - 1_000),
    });
    const view = await service.getExportStatus('actor-1');
    expect(view?.status).toBe('EXPIRED');
    expect(view?.downloadUrl).toBeNull();
    expect(presignGet).not.toHaveBeenCalled();
  });
});
