'use client';
import { useEffect, useRef, useState } from 'react';
import { Download, File, Trash2, Upload, Eye, X } from 'lucide-react';
import { Modal } from './ui/dialog';
import { Button } from './ui/button';
import { useApp } from './app-provider';
import { download } from '@/lib/data';
import { MAX_ATTACHMENT_BYTES, matchesMime } from '@/lib/files';
import { seal, unseal } from '@/lib/crypto';
export function Attachments({
  entity,
  id,
  onClose,
  vaultKey,
}: {
  entity: string;
  id: string;
  onClose: () => void;
  vaultKey?: CryptoKey;
}) {
  const { data, user, refresh, notify } = useApp(),
    [busy, setBusy] = useState(false),
    [progress, setProgress] = useState(0),
    [preview, setPreview] = useState<{
      url: string;
      type: string;
      name: string;
      text?: string;
    } | null>(null);
  const previewURL = useRef<string | null>(null);
  useEffect(
    () => () => {
      if (previewURL.current) URL.revokeObjectURL(previewURL.current);
    },
    [],
  );
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const rows = data.attachments.filter((a) => a.entity_type === entity && a.entity_id === id);
  async function upload(file: File) {
    if (file.size > MAX_ATTACHMENT_BYTES) {
      notify('O limite por arquivo nesta interface é 2 MB.');
      return;
    }
    if (
      !['application/pdf', 'image/png', 'image/jpeg', 'image/webp', 'text/plain'].includes(
        file.type,
      )
    ) {
      notify('Envie PDF, PNG, JPEG, WebP ou texto.');
      return;
    }
    setBusy(true);
    setProgress(0);
    try {
      const raw = new Uint8Array(await file.arrayBuffer());
      if (!matchesMime(raw, file.type)) throw Error('Tipo inválido');
      let content: Blob = file;
      if (vaultKey) {
        let binary = '';
        for (const byte of raw) binary += String.fromCharCode(byte);
        content = new Blob(
          [
            JSON.stringify(
              await seal(
                vaultKey,
                { name: file.name, type: file.type, bytes: btoa(binary) },
                user.id + ':attachment:' + id,
              ),
            ),
          ],
          { type: 'application/octet-stream' },
        );
      }
      const form = new FormData();
      form.set('entity', entity);
      form.set('id', id);
      form.set('encrypted', String(!!vaultKey));
      form.set('file', content, vaultKey ? 'encrypted.bin' : file.name);
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('POST', '/api/attachments');
        xhr.upload.onprogress = (e) =>
          e.lengthComputable && setProgress(Math.round((e.loaded / e.total) * 100));
        xhr.onload = () =>
          xhr.status < 300 ? resolve() : reject(Error('Falha ao enviar arquivo.'));
        xhr.onerror = () => reject(Error('Falha de conexão.'));
        xhr.send(form);
      });
      await refresh();
      notify('Arquivo guardado com acesso privado.');
    } catch {
      notify('Não foi possível enviar o arquivo.');
    } finally {
      setBusy(false);
    }
  }
  async function get(row: (typeof rows)[number], show = false) {
    try {
      const response = await fetch(`/api/attachments?id=${row.id}`, { cache: 'no-store' });
      if (!response.ok) throw Error();
      if (!mounted.current) return;
      if (row.is_encrypted) {
        if (!vaultKey) throw Error();
        const payload = await unseal(
          vaultKey,
          await response.json(),
          user.id + ':attachment:' + id,
        );
        if (!mounted.current) return;
        await display(
          payload.name,
          new Blob([Uint8Array.from(atob(payload.bytes), (c) => c.charCodeAt(0))], {
            type: payload.type,
          }),
          show,
        );
      } else {
        const metadata = row.metadata as Record<string, string>;
        await display(
          metadata.name || 'arquivo',
          new Blob([await response.arrayBuffer()], { type: metadata.type }),
          show,
        );
      }
    } catch {
      notify('Não foi possível abrir o arquivo.');
    }
  }
  async function display(name: string, blob: Blob, show: boolean) {
    if (!show) {
      download(name, blob);
      return;
    }
    if (
      !['application/pdf', 'image/png', 'image/jpeg', 'image/webp', 'text/plain'].includes(
        blob.type,
      )
    ) {
      notify('Pré-visualização indisponível para este formato.');
      return;
    }
    const text = blob.type === 'text/plain' ? (await blob.text()).slice(0, 100000) : undefined;
    if (!mounted.current) return;
    if (previewURL.current) URL.revokeObjectURL(previewURL.current);
    previewURL.current = URL.createObjectURL(blob);
    setPreview({ url: previewURL.current, type: blob.type, name, text });
  }
  return (
    <Modal
      open
      onClose={onClose}
      title="Arquivos privados"
      description={
        vaultKey
          ? 'Arquivo e nome são criptografados antes do envio.'
          : 'PDF, imagem ou texto · até 2 MB por arquivo.'
      }
    >
      <label className="upload-zone">
        <Upload size={24} />
        <strong>{busy ? `Enviando… ${progress}%` : 'Selecionar arquivo'}</strong>
        <input
          type="file"
          accept=".pdf,.png,.jpg,.jpeg,.webp,.txt"
          disabled={busy}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void upload(f);
            e.target.value = '';
          }}
        />
      </label>
      {busy && <progress value={progress} max={100} />}
      <div className="stack">
        {preview && (
          <section className="file-preview">
            <div>
              <strong>{preview.name}</strong>
              <button
                className="icon-button"
                aria-label="Fechar pré-visualização"
                onClick={() => {
                  if (previewURL.current) URL.revokeObjectURL(previewURL.current);
                  previewURL.current = null;
                  setPreview(null);
                }}
              >
                <X size={17} />
              </button>
            </div>
            {preview.type.startsWith('image/') ? (
              <img src={preview.url} alt={preview.name} />
            ) : preview.type === 'text/plain' ? (
              <pre>{preview.text}</pre>
            ) : (
              <iframe src={preview.url} title={preview.name} sandbox="" />
            )}
          </section>
        )}
        {rows.map((row) => (
          <div className="file-row" key={row.id}>
            <File size={19} />
            <span>
              {row.is_encrypted
                ? 'Anexo criptografado'
                : String((row.metadata as Record<string, unknown>).name)}
            </span>
            <button
              className="icon-button"
              aria-label="Pré-visualizar arquivo"
              onClick={() => void get(row, true)}
            >
              <Eye size={17} />
            </button>
            <button
              className="icon-button"
              aria-label="Baixar arquivo"
              onClick={() => void get(row)}
            >
              <Download size={17} />
            </button>
            <button
              className="icon-button"
              aria-label="Excluir arquivo"
              onClick={async () => {
                if (!confirm('Excluir este arquivo permanentemente?')) return;
                const r = await fetch(`/api/attachments?id=${row.id}`, { method: 'DELETE' });
                if (!r.ok) notify('Não foi possível excluir.');
                else await refresh();
              }}
            >
              <Trash2 size={16} />
            </button>
          </div>
        ))}
        {!rows.length && <p className="empty-text">Nenhum arquivo anexado.</p>}
      </div>
      <div className="form-footer">
        <Button variant="outline" onClick={onClose}>
          Fechar
        </Button>
      </div>
    </Modal>
  );
}
