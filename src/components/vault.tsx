'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  LockKeyhole,
  LockOpen,
  Plus,
  Search,
  FileText,
  Star,
  Copy,
  Eye,
  EyeOff,
  RefreshCw,
  Paperclip,
  Pencil,
  Trash2,
  KeyRound,
} from 'lucide-react';
import { useApp } from './app-provider';
import { PageHeading, Empty } from './dashboard';
import { Button } from './ui/button';
import { Modal } from './ui/dialog';
import { Attachments } from './attachments';
import { list, mutate } from '@/lib/data';
import {
  createVault,
  unlockVault,
  changeMaster,
  seal,
  unseal,
  generatePassword,
  type VaultConfig,
  type Envelope,
} from '@/lib/crypto';
import type { Row } from '@/lib/domain';
type Credential = {
  id: string;
  name: string;
  url: string;
  username: string;
  password: string;
  notes: string;
  category: string;
};
const blank = (): Credential => ({
  id: crypto.randomUUID(),
  name: '',
  url: '',
  username: '',
  password: '',
  notes: '',
  category: 'Pessoal',
});
export function Vault() {
  const requestedTab = useSearchParams().get('tab');
  const { data, user, edit, notify, refresh, remove, registerVaultSearch } = useApp();
  const [tab, setTab] = useState('notes'),
    [query, setQuery] = useState(''),
    [favorites, setFavorites] = useState(false),
    [key, setKey] = useState<CryptoKey | null>(null),
    [config, setConfig] = useState<VaultConfig | null>(null),
    [configLoaded, setConfigLoaded] = useState(false),
    [items, setItems] = useState<Credential[]>([]),
    [master, setMaster] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [credential, setCredential] = useState<Credential | null>(null),
    [reveal, setReveal] = useState(false),
    [attachment, setAttachment] = useState<{ entity: string; id: string } | null>(null),
    [change, setChange] = useState(false);
  const generation = useRef(0),
    timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const lock = useCallback(() => {
    registerVaultSearch?.(null);
    generation.current++;
    setKey(null);
    setItems([]);
    setCredential(null);
    setMaster('');
    setReveal(false);
    setAttachment(null);
    setChange(false);
    setError('');
  }, [registerVaultSearch]);
  useEffect(() => {
    void list('vault_configs')
      .then((rows) => {
        setConfig((rows[0] as unknown as VaultConfig) ?? null);
        setConfigLoaded(true);
      })
      .catch(() => setError('Não foi possível carregar a configuração do Cofre.'));
    return () => {
      generation.current++;
    };
  }, []);
  useEffect(() => {
    if (requestedTab === 'credentials') setTab('credentials');
  }, [requestedTab]);
  useEffect(() => {
    const hide = () => {
      if (document.visibilityState === 'hidden') lock();
    };
    document.addEventListener('visibilitychange', hide);
    return () => document.removeEventListener('visibilitychange', hide);
  }, [lock]);
  useEffect(() => {
    if (!key) return;
    const touch = () => {
      clearTimeout(timer.current);
      timer.current = setTimeout(
        lock,
        Number(data.settings[0]?.vault_timeout_minutes || 5) * 60000,
      );
    };
    touch();
    window.addEventListener('pointerdown', touch);
    window.addEventListener('keydown', touch);
    return () => {
      clearTimeout(timer.current);
      window.removeEventListener('pointerdown', touch);
      window.removeEventListener('keydown', touch);
    };
  }, [key, lock, data.settings]);
  useEffect(() => {
    if (key)
      registerVaultSearch?.((query) =>
        items
          .filter((item) =>
            `${item.name} ${item.username} ${item.category}`
              .toLowerCase()
              .includes(query.toLowerCase()),
          )
          .slice(0, 8)
          .map((item) => ({ id: item.id, title: item.name, select: () => setCredential(item) })),
      );
    else registerVaultSearch?.(null);
    return () => registerVaultSearch?.(null);
  }, [key, items, registerVaultSearch]);
  async function readItems(activeKey: CryptoKey, epoch: number) {
    const rows = await list('vault_items');
    const decrypted: Credential[] = await Promise.all(
      rows.map(async (row) => ({
        ...(await unseal(activeKey, row as unknown as Envelope, user.id + ':item:' + row.id)),
        id: row.id,
      })),
    );
    if (epoch === generation.current) setItems(decrypted);
  }
  async function unlock(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    const epoch = generation.current;
    try {
      let nextKey: CryptoKey;
      if (config) {
        nextKey = await unlockVault(master, user.id, config);
      } else {
        const created = await createVault(master, user.id);
        await mutate('vault_configs', created.config);
        setConfig(created.config);
        nextKey = created.key;
      }
      if (epoch !== generation.current) return;
      setMaster('');
      await readItems(nextKey, epoch);
      if (epoch === generation.current) setKey(nextKey);
    } catch {
      setError('Não foi possível desbloquear. Confira a senha mestra e a conexão.');
    } finally {
      setMaster('');
      setBusy(false);
    }
  }
  async function saveCredential(e: React.FormEvent) {
    e.preventDefault();
    if (!key || !credential) return;
    setBusy(true);
    setError('');
    const epoch = generation.current;
    try {
      const value = { ...credential };
      if (value.url && !/^https?:\/\//i.test(value.url))
        throw Error('Use uma URL iniciada por https:// ou http://.');
      const envelope = await seal(key, value, user.id + ':item:' + value.id);
      await mutate(
        'vault_items',
        { ...envelope, id: value.id, item_type: 'credential' },
        items.some((i) => i.id === value.id) ? 'PATCH' : 'POST',
      );
      await readItems(key, epoch);
      setCredential(null);
      notify('Credencial criptografada e salva.');
    } catch {
      setError('Não foi possível salvar a credencial. Confira os campos e a conexão.');
    } finally {
      setBusy(false);
    }
  }
  async function copy(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      notify('Copiado para a área de transferência.');
    } catch {
      notify('O navegador não permitiu copiar.');
    }
  }
  const notes = data.notes.filter(
    (n) =>
      (!favorites || n.favorite) &&
      `${n.title} ${n.content} ${(n.tags as string[]).join(' ')}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  const credentials = items.filter((i) =>
    `${i.name} ${i.username} ${i.category}`.toLowerCase().includes(query.toLowerCase()),
  );
  return (
    <>
      <PageHeading
        title="Cofre"
        action={
          tab === 'notes' ? (
            <Button onClick={() => edit({ entity: 'notes' })}>
              <Plus size={17} /> Nova anotação
            </Button>
          ) : key ? (
            <Button
              onClick={() => {
                setError('');
                setCredential(blank());
              }}
            >
              <Plus size={17} /> Nova credencial
            </Button>
          ) : undefined
        }
      />
      <div className="list-toolbar">
        <div className="tabs">
          <button
            className={tab === 'notes' ? 'active' : ''}
            onClick={() => {
              setTab('notes');
              setQuery('');
            }}
          >
            <FileText size={16} /> Anotações
          </button>
          <button
            className={tab === 'credentials' ? 'active' : ''}
            onClick={() => {
              setTab('credentials');
              setQuery('');
            }}
          >
            <LockKeyhole size={16} /> Credenciais
          </button>
        </div>
        {tab === 'credentials' && key && (
          <div className="flex">
            <Button variant="ghost" onClick={() => setChange(true)}>
              <KeyRound size={16} /> Alterar senha mestra
            </Button>
            <Button variant="outline" onClick={lock}>
              <LockKeyhole size={16} /> Bloquear
            </Button>
          </div>
        )}
      </div>
      {(tab === 'notes' || key) && (
        <div className="filters section-actions">
          <input
            aria-label="Pesquisar neste módulo"
            placeholder={tab === 'notes' ? 'Buscar anotações…' : 'Buscar no Cofre desbloqueado…'}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {tab === 'notes' && (
            <Button
              variant={favorites ? 'default' : 'outline'}
              onClick={() => setFavorites((v) => !v)}
            >
              <Star size={16} /> Favoritas
            </Button>
          )}
        </div>
      )}
      {tab === 'notes' && (
        <>
          <div className="cards-grid">
            {notes.map((n) => (
              <article className="panel note-card" key={n.id}>
                <div className="note-top">
                  <span className="badge">{String(n.category)}</span>
                  <button
                    className="icon-button"
                    aria-label="Alternar favorita"
                    onClick={async () => {
                      try {
                        await mutate('notes', { ...n, favorite: !n.favorite }, 'PATCH');
                        await refresh();
                      } catch {
                        notify('Não foi possível atualizar.');
                      }
                    }}
                  >
                    <Star
                      size={17}
                      fill={n.favorite ? 'currentColor' : 'none'}
                      color="currentColor"
                    />
                  </button>
                </div>
                <button className="note-body" onClick={() => edit({ entity: 'notes', record: n })}>
                  <h2>{String(n.title)}</h2>
                  <p>{String(n.content) || 'Sem conteúdo.'}</p>
                </button>
                <div className="note-tags">
                  {(n.tags as string[]).map((t) => (
                    <span key={t}>#{t}</span>
                  ))}
                </div>
                <div className="note-footer">
                  <small>{new Date(String(n.updated_at)).toLocaleDateString('pt-BR')}</small>
                  <Button
                    variant="ghost"
                    aria-label="Anexos da nota"
                    onClick={() => setAttachment({ entity: 'notes', id: n.id })}
                  >
                    <Paperclip size={16} />
                  </Button>
                </div>
              </article>
            ))}
          </div>
          {!notes.length && (
            <section className="panel">
              <Empty
                title="Nenhuma anotação"
                description="Adicione uma anotação, link ou referência."
                action={
                  <Button variant="outline" onClick={() => edit({ entity: 'notes' })}>
                    Escrever uma anotação
                  </Button>
                }
              />
            </section>
          )}
        </>
      )}
      {tab === 'credentials' && !key && (
        <section className="panel vault-locked">
          <div className="vault-lock-icon">
            <LockKeyhole size={34} />
          </div>
          <h2>{config ? 'Seu Cofre está bloqueado.' : 'Crie seu Cofre pessoal.'}</h2>
          <p>
            {config
              ? 'Use sua senha mestra para acessar as credenciais.'
              : 'Escolha uma senha mestra independente da senha de login, com pelo menos 12 caracteres.'}
          </p>
          <form onSubmit={unlock}>
            <label>
              Senha mestra
              <input
                type="password"
                value={master}
                onChange={(e) => setMaster(e.target.value)}
                required
                minLength={config ? 1 : 12}
                autoComplete={config ? 'current-password' : 'new-password'}
              />
            </label>
            <Button disabled={busy || !configLoaded} type="submit">
              <LockOpen size={17} />
              {busy
                ? 'Desbloqueando…'
                : config
                  ? 'Desbloquear meu Cofre'
                  : 'Criar Cofre criptografado'}
            </Button>
          </form>
          {error && (
            <p className="notice error" role="alert">
              {error}
            </p>
          )}
          <div className="vault-warning">
            Sem a senha mestra, seu conteúdo pode ser irrecuperável. A recuperação do login não
            recupera esta senha.
          </div>
          <small>AES-256-GCM no navegador · bloqueio por inatividade e ao ocultar a página</small>
        </section>
      )}
      {tab === 'credentials' && key && (
        <>
          <div className="notice subtle">
            <LockOpen size={16} /> Cofre desbloqueado nesta aba. A busca acontece apenas no seu
            navegador.
          </div>
          <div className="cards-grid">
            {credentials.map((c) => (
              <article className="panel credential-card" key={c.id}>
                <div className="credential-title">
                  <span className="credential-icon">
                    <KeyRound size={22} />
                  </span>
                  <div>
                    <h2>{c.name}</h2>
                    <small>{c.category}</small>
                  </div>
                  <button
                    className="icon-button"
                    aria-label="Editar credencial"
                    onClick={() => {
                      setCredential(c);
                      setError('');
                    }}
                  >
                    <Pencil size={17} />
                  </button>
                </div>
                <div className="credential-field">
                  <span>{c.username || 'Sem usuário'}</span>
                  <button
                    className="icon-button"
                    aria-label="Copiar usuário"
                    onClick={() => void copy(c.username)}
                  >
                    <Copy size={16} />
                  </button>
                </div>
                <div className="credential-field">
                  <span>••••••••••••</span>
                  <button
                    className="icon-button"
                    aria-label="Copiar senha"
                    onClick={() => void copy(c.password)}
                  >
                    <Copy size={16} />
                  </button>
                </div>
                <div className="credential-actions">
                  <Button
                    variant="ghost"
                    onClick={() => setAttachment({ entity: 'vault_items', id: c.id })}
                  >
                    <Paperclip size={16} /> Anexos
                  </Button>
                  <button
                    className="icon-button"
                    aria-label="Excluir credencial"
                    onClick={async () => {
                      const epoch = generation.current;
                      await remove('vault_items', { id: c.id });
                      if (key) await readItems(key, epoch);
                    }}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </article>
            ))}
          </div>
          {!credentials.length && (
            <section className="panel">
              <Empty
                title="Nenhuma credencial"
                description="Adicione uma credencial. Todos os campos serão criptografados antes de sair do navegador."
                action={
                  <Button variant="outline" onClick={() => setCredential(blank())}>
                    Adicionar credencial
                  </Button>
                }
              />
            </section>
          )}
        </>
      )}
      <Modal
        open={!!credential && !!key}
        onClose={() => {
          setCredential(null);
          setReveal(false);
        }}
        title="Credencial"
        description="Todos os campos abaixo são criptografados no navegador."
      >
        {credential && (
          <form onSubmit={saveCredential}>
            <div className="form-grid">
              {[
                ['name', 'Nome do serviço'],
                ['url', 'URL'],
                ['username', 'Usuário ou e-mail'],
                ['category', 'Categoria'],
              ].map(([field, label]) => (
                <label key={field}>
                  {label}
                  <input
                    required={field === 'name'}
                    value={credential[field as keyof Credential]}
                    onChange={(e) => setCredential({ ...credential, [field]: e.target.value })}
                  />
                </label>
              ))}
              <label className="full">
                Senha
                <div className="password-field">
                  <input
                    type={reveal ? 'text' : 'password'}
                    value={credential.password}
                    autoComplete="new-password"
                    onChange={(e) => setCredential({ ...credential, password: e.target.value })}
                  />
                  <button
                    type="button"
                    className="icon-button"
                    aria-label="Mostrar ou ocultar senha"
                    onClick={() => setReveal((v) => !v)}
                  >
                    {reveal ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                  <button
                    type="button"
                    className="icon-button"
                    aria-label="Gerar senha forte"
                    onClick={() => setCredential({ ...credential, password: generatePassword() })}
                  >
                    <RefreshCw size={18} />
                  </button>
                </div>
              </label>
              <label className="full">
                Observações confidenciais
                <textarea
                  rows={4}
                  value={credential.notes}
                  onChange={(e) => setCredential({ ...credential, notes: e.target.value })}
                />
              </label>
            </div>
            {error && (
              <p className="notice error" role="alert">
                {error}
              </p>
            )}
            <div className="form-footer">
              <Button type="button" variant="outline" onClick={() => setCredential(null)}>
                Cancelar
              </Button>
              <Button disabled={busy} type="submit">
                {busy ? 'Criptografando…' : 'Salvar credencial'}
              </Button>
            </div>
          </form>
        )}
      </Modal>
      <Modal
        open={change && !!key}
        onClose={() => setChange(false)}
        title="Alterar senha mestra"
        description="Sua chave de dados será protegida pela nova senha; as credenciais não precisam ser reenviadas."
      >
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (!config) return;
            const form = new FormData(e.currentTarget);
            setBusy(true);
            try {
              const next = await changeMaster(
                String(form.get('old')),
                String(form.get('new')),
                user.id,
                config,
              );
              await mutate(
                'vault_configs',
                { ...next, expected_wrapped_key: config.encrypted_data_key },
                'PATCH',
              );
              setConfig(next);
              lock();
              notify('Senha mestra alterada. Desbloqueie novamente.');
            } catch {
              notify('Não foi possível alterar. Confira a senha atual.');
            } finally {
              setBusy(false);
            }
          }}
        >
          <label>
            Senha mestra atual
            <input name="old" type="password" required autoComplete="current-password" />
          </label>
          <label>
            Nova senha mestra
            <input name="new" type="password" minLength={12} required autoComplete="new-password" />
          </label>
          <Button disabled={busy} type="submit">
            Alterar e bloquear Cofre
          </Button>
        </form>
      </Modal>
      {attachment && (
        <Attachments
          {...attachment}
          vaultKey={attachment.entity === 'vault_items' ? (key ?? undefined) : undefined}
          onClose={() => setAttachment(null)}
        />
      )}
    </>
  );
}
