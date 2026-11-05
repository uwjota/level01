'use client';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  LayoutGrid,
  BookOpen,
  CheckSquare,
  CalendarDays,
  Wallet,
  Target,
  LockKeyhole,
  Settings,
  Search,
  Plus,
  Bell,
  PanelLeftClose,
  PanelLeft,
  LogOut,
  Menu,
  ArrowUpRight,
  Check,
  X,
  RefreshCw,
  Info,
} from 'lucide-react';
import { list, mutate } from '@/lib/data';
import type { Row } from '@/lib/domain';
import { disableDevicePush } from '@/lib/push-client';
import { browserClient } from '@/lib/supabase/client';
import { Button } from './ui/button';
import { Modal } from './ui/dialog';
import { Brand } from './brand';
import { EntityForm } from './entity-form';
import { NavigationHint } from './navigation-hint';
const tables = [
  'tasks',
  'task_occurrences',
  'financial_accounts',
  'financial_categories',
  'transactions',
  'financial_recurrence_rules',
  'goals',
  'goal_updates',
  'notes',
  'study_collections',
  'study_notes',
  'settings',
  'notifications',
  'attachments',
];
type Editor = {
  entity: string;
  record?: Row;
  defaults?: Record<string, unknown>;
  scope?: 'occurrence';
  original?: string;
};
export type VaultSearchResult = { id: string; title: string; select: () => void };
type AppContextType = {
  data: Record<string, Row[]>;
  loading: boolean;
  user: { id: string; email: string };
  refresh: () => Promise<void>;
  save: (entity: string, value: Record<string, unknown>, method?: string) => Promise<Row>;
  edit: (e: Editor) => void;
  notify: (message: string, undo?: () => void) => void;
  remove: (entity: string, row: Row) => Promise<void>;
  registerVaultSearch: (search: ((query: string) => VaultSearchResult[]) | null) => void;
};
export const AppContext = createContext<AppContextType>(null!);
const Context = AppContext;
export const useApp = () => useContext(Context);
export const nav = [
  { path: '/', label: 'Início', icon: LayoutGrid },
  { path: '/tarefas', label: 'Tarefas', icon: CheckSquare },
  { path: '/calendario', label: 'Calendário', icon: CalendarDays },
  { path: '/financeiro', label: 'Financeiro', icon: Wallet },
  { path: '/metas', label: 'Metas', icon: Target },
  { path: '/estudos', label: 'Estudos', icon: BookOpen },
  { path: '/cofre', label: 'Cofre', icon: LockKeyhole },
  { path: '/configuracoes', label: 'Configurações', icon: Settings },
];
export function AppProvider({
  user,
  children,
}: {
  user: { id: string; email: string };
  children: ReactNode;
}) {
  const [data, setData] = useState<Record<string, Row[]>>(
      Object.fromEntries(tables.map((t) => [t, []])),
    ),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(''),
    [editor, setEditor] = useState<Editor | null>(null),
    [toast, setToast] = useState<{ message: string; undo?: () => void } | null>(null),
    [collapsed, setCollapsed] = useState(false),
    [mobile, setMobile] = useState(false),
    [quick, setQuick] = useState(false),
    [search, setSearch] = useState(false),
    [query, setQuery] = useState(''),
    [notifications, setNotifications] = useState(false);
  const vaultSearch = useRef<((query: string) => VaultSearchResult[]) | null>(null);
  const revision = useRef(0);
  const sidebarRef = useRef<HTMLElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const router = useRouter();
  const [, setVaultEpoch] = useState(0);
  const registerVaultSearch = useCallback(
    (handler: ((query: string) => VaultSearchResult[]) | null) => {
      vaultSearch.current = handler;
      setVaultEpoch((n) => n + 1);
    },
    [],
  );
  const path = usePathname(),
    current = nav.find((x) => x.path === path) ?? nav[0];
  const refresh = useCallback(async () => {
    const version = revision.current;
    try {
      const entries = await Promise.all(tables.map(async (t) => [t, await list(t)] as const));
      if (version !== revision.current) return;
      setData(Object.fromEntries(entries));
      setError('');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);
  const notify = useCallback(
    (message: string, undo?: () => void) => setToast({ message, undo }),
    [],
  );
  useEffect(() => {
    void fetch('/api/recurrences', { method: 'POST' })
      .catch(() => {})
      .finally(() => void refresh());
  }, [refresh]);
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 7000);
    return () => clearTimeout(id);
  }, [toast]);
  useEffect(() => {
    if (!mobile) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const items = () =>
      Array.from(
        sidebarRef.current?.querySelectorAll<HTMLElement>('a[href], button:not([disabled])') ?? [],
      ).filter((item) => item.getClientRects().length > 0);
    items()[0]?.focus();
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMobile(false);
      if (event.key !== 'Tab') return;
      const controls = items(),
        first = controls[0],
        last = controls.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };
    const resize = () => {
      if (window.innerWidth > 760) setMobile(false);
    };
    window.addEventListener('keydown', key);
    window.addEventListener('resize', resize);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', key);
      window.removeEventListener('resize', resize);
      menuButtonRef.current?.focus();
    };
  }, [mobile]);
  useEffect(() => {
    const event = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        setSearch((v) => !v);
      }
    };
    window.addEventListener('keydown', event);
    if (window.isSecureContext && 'serviceWorker' in navigator)
      void navigator.serviceWorker.register('/sw.js').catch(() => {});
    return () => window.removeEventListener('keydown', event);
  }, []);
  const settings = data.settings[0];
  useEffect(() => {
    const media = matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      const preference = settings?.theme ?? 'dark';
      const theme = preference === 'system' ? (media.matches ? 'dark' : 'light') : preference;
      document.documentElement.dataset.theme = String(theme);
      document
        .querySelector('meta[name="theme-color"]')
        ?.setAttribute('content', theme === 'dark' ? '#0a0a0a' : '#fafafa');
    };
    apply();
    media.addEventListener('change', apply);
    return () => media.removeEventListener('change', apply);
  }, [settings?.theme]);
  useEffect(() => {
    if (loading || error) return;
    let active = true;
    const update = async () => {
      if (document.visibilityState === 'hidden') return;
      try {
        const r = await fetch('/api/reminders', { method: 'POST' });
        if (r.ok) {
          const rows = await list('notifications');
          if (active) setData((d) => ({ ...d, notifications: rows }));
        }
      } catch {}
    };
    void update();
    const interval = setInterval(() => void update(), 60000);
    const visible = () => void update();
    document.addEventListener('visibilitychange', visible);
    return () => {
      active = false;
      clearInterval(interval);
      document.removeEventListener('visibilitychange', visible);
    };
  }, [loading, error]);
  async function save(entity: string, value: Record<string, unknown>, method = 'POST') {
    const row = await mutate(entity, value, method);
    revision.current++;
    setData((previous) => ({
      ...previous,
      [entity]:
        method === 'DELETE'
          ? previous[entity].filter((item) => item.id !== value.id)
          : [row, ...previous[entity].filter((item) => item.id !== row.id)],
    }));
    // Refresh cross-table effects only. A preference or task edit needs no full reload.
    if (entity === 'financial_recurrence_rules' && method !== 'DELETE')
      await fetch('/api/recurrences', { method: 'POST' });
    if (
      method === 'DELETE' ||
      ['financial_recurrence_rules', 'goals', 'goal_updates'].includes(entity)
    )
      await refresh();
    return row;
  }
  async function remove(entity: string, row: Row) {
    if (!confirm('Excluir este registro? Esta ação não pode ser desfeita.')) return;
    try {
      await save(entity, { id: row.id }, 'DELETE');
      notify('Registro excluído.');
    } catch (e) {
      notify((e as Error).message);
    }
  }
  const quickItems = [
    ['tasks', 'Nova tarefa'],
    ['income', 'Nova entrada'],
    ['expense', 'Nova saída'],
    ['notes', 'Nova nota'],
    ['goals', 'Nova meta'],
    ['credential', 'Nova credencial'],
  ];
  function create(entity: string) {
    setQuick(false);
    if (entity === 'credential') {
      router.push('/cofre?tab=credentials');
      return;
    }
    setEditor({
      entity: ['income', 'expense'].includes(entity) ? 'transactions' : entity,
      defaults: ['income', 'expense'].includes(entity) ? { type: entity } : undefined,
    });
  }
  const results = query.trim()
    ? (
        [
          'tasks',
          'notes',
          'transactions',
          'goals',
          'financial_categories',
          'study_collections',
          'study_notes',
        ] as const
      ).flatMap((t) =>
        (data[t] ?? [])
          .filter((x) =>
            String(x.title ?? x.description ?? x.name)
              .toLocaleLowerCase('pt-BR')
              .includes(query.toLocaleLowerCase('pt-BR')),
          )
          .slice(0, 8)
          .map((x) => ({ entity: t, row: x })),
      )
    : [];
  return (
    <Context.Provider
      value={{
        data,
        loading,
        user,
        refresh,
        save,
        edit: setEditor,
        notify,
        remove,
        registerVaultSearch,
      }}
    >
      <div className={`app-shell ${collapsed ? 'collapsed' : ''}`}>
        <aside
          ref={sidebarRef}
          id="main-sidebar"
          className={`sidebar ${mobile ? 'mobile-open' : ''}`}
          aria-label="Menu principal"
        >
          <Link
            className="brand"
            href="/"
            aria-label="Level01 — início"
            onClick={() => setMobile(false)}
          >
            <Brand compact={collapsed && !mobile} />
          </Link>
          <nav>
            {nav.map((n) => (
              <Link
                key={n.path}
                title={n.label}
                aria-current={path === n.path ? 'page' : undefined}
                href={n.path}
                onClick={() => setMobile(false)}
                className={path === n.path ? 'active' : ''}
              >
                <n.icon size={19} />
                <span>{n.label}</span>
                <NavigationHint />
                {n.path === '/tarefas' &&
                  data.tasks.filter((t) => t.status === 'pending').length > 0 && (
                    <small>{data.tasks.filter((t) => t.status === 'pending').length}</small>
                  )}
              </Link>
            ))}
          </nav>
          <div className="sidebar-bottom">
            <Link className="profile" href="/configuracoes" onClick={() => setMobile(false)}>
              <span className="avatar">
                {String(settings?.display_name || user.email)
                  .slice(0, 1)
                  .toUpperCase()}
              </span>
              <span>
                <strong>{String(settings?.display_name || 'Minha conta')}</strong>
                <small>Conta pessoal</small>
              </span>
              <Settings size={16} />
            </Link>
            <button
              className="collapse-toggle"
              onClick={() => setCollapsed((v) => !v)}
              aria-label="Recolher menu"
            >
              {collapsed ? (
                <PanelLeft size={18} />
              ) : (
                <>
                  <PanelLeftClose size={18} /> Recolher menu
                </>
              )}
            </button>
          </div>
        </aside>
        {mobile && (
          <button
            className="mobile-backdrop"
            aria-label="Fechar menu"
            onClick={() => setMobile(false)}
          />
        )}
        <div className="workspace" inert={mobile || undefined}>
          <header className="topbar">
            <div className="topbar-title">
              <button
                ref={menuButtonRef}
                className="icon-button mobile-only"
                aria-label="Abrir menu"
                aria-controls="main-sidebar"
                aria-expanded={mobile}
                onClick={() => setMobile(true)}
              >
                <Menu size={21} />
              </button>
              <span>{current.label}</span>
              <span className="topbar-date">
                {new Intl.DateTimeFormat('pt-BR', {
                  day: 'numeric',
                  month: 'long',
                  timeZone: String(settings?.timezone || 'America/Sao_Paulo'),
                }).format(new Date())}
              </span>
            </div>
            <div className="topbar-actions">
              <button className="search-trigger" onClick={() => setSearch(true)}>
                <Search size={17} />
                <span>Buscar</span>
                <kbd>⌘ K</kbd>
              </button>
              <Button onClick={() => setQuick(true)}>
                <Plus size={17} />
                <span>Novo</span>
              </Button>
              <button
                className="icon-button notification-trigger"
                aria-label="Notificações"
                onClick={() => setNotifications(true)}
              >
                <Bell size={19} />
                {data.notifications.some((n) => !n.read_at) && <i />}
              </button>
              <Link className="avatar" aria-label="Configurações da conta" href="/configuracoes">
                {String(settings?.display_name || user.email)
                  .slice(0, 1)
                  .toUpperCase()}
              </Link>
            </div>
          </header>
          <main className="page-content">
            {error ? (
              <div className="notice error">
                <strong>Não foi possível sincronizar seus dados.</strong>
                <p>{error}</p>
                <Button variant="outline" onClick={() => void refresh()}>
                  <RefreshCw size={16} /> Tentar novamente
                </Button>
              </div>
            ) : loading ? (
              <div className="loading-state">
                <RefreshCw className="spin" />
                <p>Carregando…</p>
              </div>
            ) : (
              <div key={path} className="route-content">
                {children}
              </div>
            )}
          </main>
        </div>
        <button className="fab" aria-label="Criar novo registro" onClick={() => setQuick(true)}>
          <Plus size={24} />
        </button>
      </div>
      {toast && (
        <div className="toast" role="status">
          <Info size={17} />
          {toast.message}
          {toast.undo && (
            <button
              onClick={() => {
                toast.undo?.();
                setToast(null);
              }}
            >
              Desfazer
            </button>
          )}
          <button aria-label="Fechar aviso" onClick={() => setToast(null)}>
            <X size={16} />
          </button>
        </div>
      )}
      <Modal
        open={quick}
        onClose={() => setQuick(false)}
        title="Adicionar"
        description="Escolha o tipo de registro."
      >
        <div className="quick-grid">
          {quickItems.map(([entity, label]) =>
            entity === 'credential' ? (
              <Link key={entity} href="/cofre?tab=credentials" onClick={() => setQuick(false)}>
                <Plus size={20} />
                {label}
                <ArrowUpRight size={16} />
              </Link>
            ) : (
              <button key={entity} onClick={() => create(entity)}>
                <Plus size={20} />
                {label}
                <ArrowUpRight size={16} />
              </button>
            ),
          )}
        </div>
      </Modal>
      <Modal
        open={search}
        onClose={() => setSearch(false)}
        title="Buscar"
        description="Tarefas, notas, movimentações, metas e categorias."
      >
        <label className="search-field">
          <Search size={20} />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="O que você está procurando?"
          />
        </label>
        <div className="search-results">
          {results.map(({ entity, row }) => (
            <button
              key={row.id}
              onClick={() => {
                setSearch(false);
                if (entity === 'study_notes' || entity === 'study_collections') {
                  router.push(
                    `/estudos?${entity === 'study_notes' ? 'note' : 'collection'}=${row.id}`,
                  );
                } else setEditor({ entity, record: row });
              }}
            >
              <span>
                <small>
                  {
                    {
                      tasks: 'Tarefa',
                      notes: 'Nota',
                      transactions: 'Movimentação',
                      goals: 'Meta',
                      financial_categories: 'Categoria',
                      study_collections: 'Livro ou matéria',
                      study_notes: 'Nota de estudo',
                    }[entity]
                  }
                </small>
                {String(row.title ?? row.description ?? row.name)}
              </span>
              <ArrowUpRight size={17} />
            </button>
          ))}
          {query &&
            vaultSearch.current?.(query).map((result) => (
              <button
                key={'vault:' + result.id}
                onClick={() => {
                  setSearch(false);
                  result.select();
                }}
              >
                <span>
                  <small>Credencial · Cofre desbloqueado</small>
                  {result.title}
                </span>
                <LockKeyhole size={17} />
              </button>
            ))}
          {query && !results.length && !vaultSearch.current?.(query).length && (
            <p className="muted">Nenhum resultado encontrado.</p>
          )}
        </div>
      </Modal>
      <Modal
        open={notifications}
        onClose={() => setNotifications(false)}
        title="Notificações"
        description="Lembretes da sua rotina, sem dados confidenciais."
      >
        <div className="stack">
          {!data.notifications.length && (
            <p className="empty-text">Tudo em dia. Nenhuma notificação por aqui.</p>
          )}
          {data.notifications.map((n) => (
            <div className="notification-row" key={n.id}>
              <Bell size={18} />
              <p>
                {String(n.message)}
                <small>{new Date(String(n.scheduled_at)).toLocaleString('pt-BR')}</small>
              </p>
              {!n.read_at && (
                <Button
                  variant="ghost"
                  onClick={() =>
                    void save(
                      'notifications',
                      { ...n, read_at: new Date().toISOString() },
                      'PATCH',
                    ).catch((e) => notify(e.message))
                  }
                >
                  Marcar lida
                </Button>
              )}
              <button
                className="icon-button"
                aria-label="Excluir notificação"
                onClick={() => void remove('notifications', n)}
              >
                <X size={16} />
              </button>
            </div>
          ))}
        </div>
      </Modal>
      {editor && <EntityForm editor={editor} onClose={() => setEditor(null)} />}
    </Context.Provider>
  );
}
