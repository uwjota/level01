import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  attachBackupFiles,
  verifyBackupFiles,
  restoreBackup,
  type Backup,
} from '../src/lib/backup';
const base: Backup = {
  version: 1,
  user_id: '11111111-1111-4111-8111-111111111111',
  exported_at: '2026-11-04T12:00:00Z',
  tables: { attachments: [{ id: '22222222-2222-4222-8222-222222222222', storage_path: 'old' }] },
  attachments: [],
};
afterEach(() => vi.unstubAllGlobals());
describe('Backup files', () => {
  it('includes binary files, validates hashes and rejects tampering before import', async () => {
    const backup = await attachBackupFiles(base, async () => new Uint8Array([0, 1, 2, 255]));
    await expect(verifyBackupFiles(JSON.parse(JSON.stringify(backup)))).resolves.toBeUndefined();
    backup.attachments[0].bytes = 'AAAA';
    await expect(verifyBackupFiles(backup)).rejects.toThrow('corrompido');
  });
  it('stages files before committing metadata and preserves staged objects when commit outcome is uncertain', async () => {
    const backup = await attachBackupFiles(base, async () => new Uint8Array([0, 1, 2]));
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ path: base.user_id + '/restore/batch/file' }), {
          status: 200,
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: 'Invalid foreign key' }), { status: 422 }),
      )
      .mockResolvedValueOnce(new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetcher);
    await expect(restoreBackup(backup, new Set(), () => {})).rejects.toThrow(
      'confirmar a restauração',
    );
    expect(fetcher.mock.calls[0][0]).toBe('/api/backup/files');
    expect(fetcher.mock.calls[1][0]).toBe('/api/backup');
    expect(JSON.parse(fetcher.mock.calls[1][1].body).tables.attachments[0].storage_path).toContain(
      '/restore/',
    );
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it('preserves existing attachment IDs without reuploading duplicates', async () => {
    const backup = await attachBackupFiles(base, async () => new Uint8Array([0, 1]));
    const fetcher = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ data: { inserted: 0, skipped: 1 } }), { status: 200 }),
      );
    vi.stubGlobal('fetch', fetcher);
    const result = await restoreBackup(
      backup,
      new Set([String(base.tables.attachments[0].id)]),
      () => {},
    );
    expect(result.skipped).toBe(1);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
