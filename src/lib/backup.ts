'use client';
import { backupSchema } from './schemas';
import { MAX_UPLOAD_BYTES } from './files';
export const MAX_BACKUP_RECORD_BYTES = 3_000_000;
export type Backup = ReturnType<typeof backupSchema.parse>;
const encode = (bytes: Uint8Array) => {
  let text = '';
  for (const byte of bytes) text += String.fromCharCode(byte);
  return btoa(text);
};
const decode = (value: string) => Uint8Array.from(atob(value), (c) => c.charCodeAt(0));
export async function digest(bytes: Uint8Array) {
  return Array.from(
    new Uint8Array(await crypto.subtle.digest('SHA-256', new Uint8Array(bytes))),
    (b) => b.toString(16).padStart(2, '0'),
  ).join('');
}
export async function attachBackupFiles(
  backup: Backup,
  load: (id: string) => Promise<Uint8Array>,
): Promise<Backup> {
  const attachments = [];
  let total = 0;
  for (const row of backup.tables.attachments ?? []) {
    const bytes = await load(String(row.id));
    total += bytes.length;
    if (total > 50 * 1024 * 1024) throw Error('O pacote de arquivos excede 50 MB.');
    attachments.push({ id: String(row.id), bytes: encode(bytes), sha256: await digest(bytes) });
  }
  return { ...backup, attachments };
}
export async function verifyBackupFiles(backup: Backup) {
  const known = new Set((backup.tables.attachments ?? []).map((r) => r.id));
  const seen = new Set<string>();
  for (const file of backup.attachments) {
    if (
      typeof file.id !== 'string' ||
      !known.has(file.id) ||
      seen.has(file.id) ||
      typeof file.bytes !== 'string' ||
      typeof file.sha256 !== 'string'
    )
      throw Error('Anexo de backup inválido.');
    seen.add(file.id);
    if (file.bytes.length > Math.ceil(MAX_UPLOAD_BYTES / 3) * 4)
      throw Error('Arquivo do backup excede o limite.');
    const bytes = decode(file.bytes);
    if ((await digest(bytes)) !== file.sha256)
      throw Error('Arquivo do backup foi alterado ou corrompido.');
  }
}
export async function restoreBackup(
  backup: Backup,
  existingIds: Set<string>,
  progress: (value: string) => void,
) {
  await verifyBackupFiles(backup);
  const working = structuredClone(backup);
  working.attachments = [];
  if (new TextEncoder().encode(JSON.stringify(working)).length > MAX_BACKUP_RECORD_BYTES)
    throw Error('Os registros do backup excedem 3 MB.');
  const staged: string[] = [];
  const batch = crypto.randomUUID();
  let commitStarted = false;
  async function clean() {
    const results = await Promise.allSettled(
      staged.map((path) =>
        fetch(`/api/backup/files?path=${encodeURIComponent(path)}`, { method: 'DELETE' }),
      ),
    );
    return results.every((r) => r.status === 'fulfilled' && r.value.ok);
  }
  try {
    let count = 0;
    for (const file of backup.attachments) {
      if (existingIds.has(String(file.id))) continue;
      progress(`Preparando arquivo ${++count} de ${backup.attachments.length}…`);
      const bytes = decode(String(file.bytes));
      const form = new FormData();
      form.set('batch', batch);
      form.set('id', String(file.id));
      form.set('file', new Blob([bytes], { type: 'application/octet-stream' }), 'backup.bin');
      const response = await fetch('/api/backup/files', { method: 'POST', body: form });
      if (!response.ok) throw Error('Falha ao preparar os arquivos.');
      const { path } = await response.json();
      staged.push(path);
      const metadata = working.tables.attachments.find((row) => row.id === file.id)!;
      metadata.storage_path = path;
    }
    progress('Restaurando registros em uma única transação…');
    commitStarted = true;
    const r = await fetch('/api/backup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(working),
    });
    const result = await r.json();
    if (!r.ok) throw Error(result.error);
    const cleaned = await clean();
    return { ...result.data, cleanupPending: !cleaned };
  } catch (error) {
    if (commitStarted)
      throw Error(
        'Não foi possível confirmar a restauração. Os arquivos preparados foram preservados para evitar perda em caso de resposta interrompida. Confira os registros antes de tentar novamente.',
      );
    const cleaned = await clean();
    if (!cleaned)
      throw Error(
        'A importação falhou. Pode haver arquivos temporários privados em restore/; os registros não foram importados.',
      );
    throw error;
  }
}
