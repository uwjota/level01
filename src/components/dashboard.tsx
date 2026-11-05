'use client';
import Link from 'next/link';
import { useState } from 'react';
import { WeatherCard, NewsCard } from './home-context';
import { addDays, format, parseISO } from 'date-fns';
import {
  ArrowDownLeft,
  ArrowUpRight,
  Wallet,
  CheckCheck,
  Plus,
  ArrowRight,
  CalendarDays,
  Target,
  Check,
  Clock3,
  Repeat2,
  Bell,
  ListTodo,
} from 'lucide-react';
import { useApp } from './app-provider';
import { Button } from './ui/button';
import { balances, expandTasks, money, today, type Task, type Occurrence } from '@/lib/domain';
export function Empty({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="empty">
      <div className="empty-icon">
        <Plus size={23} />
      </div>
      <h3>{title}</h3>
      <p>{description}</p>
      {action}
    </div>
  );
}
export function PageHeading({ title, action }: { title: string; action?: React.ReactNode }) {
  return (
    <div className="page-heading">
      <h1>{title}</h1>
      {action}
    </div>
  );
}
export function TaskLine({ task }: { task: Occurrence }) {
  const { save, notify, edit, data } = useApp();
  const complete = task.status === 'completed';
  async function toggle() {
    try {
      if (task.recurrence) {
        const existing = data.task_occurrences.find(
          (x) => x.task_id === task.task_id && x.occurrence_date === task.original_date,
        );
        await save('task_occurrences', {
          ...(existing ?? {}),
          task_id: task.task_id,
          occurrence_date: task.original_date,
          status: complete ? 'pending' : 'completed',
          completed_at: complete ? null : new Date().toISOString(),
        });
      } else
        await save(
          'tasks',
          { ...task, id: task.task_id, status: complete ? 'pending' : 'completed' },
          'PATCH',
        );
      notify(complete ? 'Tarefa reaberta.' : 'Mais uma tarefa concluída.', () => {
        void toggleReverse();
      });
    } catch (e) {
      notify((e as Error).message);
    }
  }
  async function toggleReverse() {
    try {
      if (task.recurrence) {
        const existing = data.task_occurrences.find(
          (x) => x.task_id === task.task_id && x.occurrence_date === task.original_date,
        );
        await save('task_occurrences', {
          ...(existing ?? {}),
          task_id: task.task_id,
          occurrence_date: task.original_date,
          status: task.status,
          completed_at: complete ? new Date().toISOString() : null,
        });
      } else await save('tasks', { ...task, id: task.task_id, status: task.status }, 'PATCH');
    } catch (e) {
      notify((e as Error).message);
    }
  }
  return (
    <div className={`task-row ${complete ? 'is-complete' : ''}`}>
      <button
        className={`task-check ${complete ? 'checked' : ''}`}
        aria-label={complete ? 'Reabrir tarefa' : 'Concluir tarefa'}
        onClick={() => void toggle()}
      >
        {complete && <Check size={13} />}
      </button>
      <button
        className="task-name"
        onClick={() =>
          edit({
            entity: 'tasks',
            record: task,
            scope: task.recurrence ? 'occurrence' : undefined,
            original: task.original_date,
          })
        }
      >
        <strong>{task.title}</strong>
        <span>
          {task.scheduled_time ? (
            <>
              <Clock3 size={12} />
              {task.scheduled_time.slice(0, 5)}
            </>
          ) : (
            format(parseISO(task.scheduled_on), 'dd/MM')
          )}
          {task.recurrence && <Repeat2 size={12} />}
        </span>
      </button>
      <span className={`badge priority-${task.priority}`}>
        {{ high: 'Alta', medium: 'Média', low: 'Baixa' }[task.priority]}
      </span>
    </div>
  );
}
export function Dashboard() {
  const { data, edit, save, notify } = useApp();
  const [reading, setReading] = useState<string | null>(null);
  const settings = data.settings[0],
    zone = String(settings?.timezone || 'America/Sao_Paulo'),
    date = today(zone);
  const daily = expandTasks(data.tasks as Task[], data.task_occurrences, date, date)
    .filter((t) => t.status !== 'cancelled')
    .sort((a, b) => Number(a.status === 'completed') - Number(b.status === 'completed'));
  const completed = daily.filter((t) => t.status === 'completed').length,
    pending = daily.length - completed;
  const overdue = expandTasks(
    data.tasks as Task[],
    data.task_occurrences,
    format(addDays(parseISO(date), -30), 'yyyy-MM-dd'),
    format(addDays(parseISO(date), -1), 'yyyy-MM-dd'),
  ).filter((t) => t.status === 'pending').length;
  const currentTransactions = data.transactions.filter((t) => String(t.occurred_on) <= date);
  const balance = Object.values(balances(data.financial_accounts, currentTransactions)).reduce(
    (a, b) => a + b,
    0,
  );
  const monthly = currentTransactions.filter(
    (t) => t.status === 'confirmed' && String(t.occurred_on).startsWith(date.slice(0, 7)),
  );
  const incoming = monthly
      .filter((t) => t.type === 'income')
      .reduce((s, t) => s + Number(t.amount_minor), 0),
    outgoing = monthly
      .filter((t) => t.type === 'expense')
      .reduce((s, t) => s + Number(t.amount_minor), 0);
  const unread = data.notifications
    .filter((n) => !n.read_at)
    .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
  const due = data.transactions.filter(
    (t) =>
      t.type === 'expense' &&
      t.status === 'planned' &&
      String(t.occurred_on) <= format(addDays(parseISO(date), 7), 'yyyy-MM-dd'),
  );
  const destination = (type: unknown) =>
    type === 'finance' ? '/financeiro' : type === 'goal' ? '/metas' : '/tarefas';
  return (
    <>
      <div className="home-date">
        {new Intl.DateTimeFormat('pt-BR', {
          weekday: 'long',
          day: 'numeric',
          month: 'long',
          timeZone: zone,
        }).format(new Date())}
      </div>
      <PageHeading
        title="Hoje"
        action={
          <Button onClick={() => edit({ entity: 'tasks', defaults: { scheduled_on: date } })}>
            <Plus size={17} /> Nova tarefa
          </Button>
        }
      />
      <section className="stats-grid home-summary">
        <Stat
          title="Saldo atual"
          value={money(balance)}
          detail={`${data.financial_accounts.length} contas · movimentações até hoje`}
          icon={<Wallet size={19} />}
          primary
        />
        <Stat
          title="Tarefas de hoje"
          value={String(pending)}
          detail={`${completed} concluídas${overdue ? ` · ${overdue} atrasadas` : ' · tudo em dia'}`}
          icon={<ListTodo size={19} />}
        />
        <Stat
          title="Notificações"
          value={String(unread.length)}
          detail={unread.length ? 'Avisos aguardando sua atenção' : 'Nenhum aviso pendente'}
          icon={<Bell size={19} />}
        />
      </section>
      <div className="home-grid">
        <div className="stack">
          <section className="panel home-tasks">
            <div className="panel-heading">
              <h2>
                Tarefas do dia <span className="count">{daily.length}</span>
              </h2>
              <Link className="text-link" href="/calendario">
                <CalendarDays size={15} /> Calendário
              </Link>
            </div>
            <div className="task-progress">
              <div>
                <span>
                  {completed} de {daily.length} concluídas
                </span>
                <span>{daily.length ? Math.round((completed / daily.length) * 100) : 0}%</span>
              </div>
              <div className="progress">
                <i style={{ width: `${daily.length ? (completed / daily.length) * 100 : 0}%` }} />
              </div>
            </div>
            {daily.length ? (
              daily.slice(0, 8).map((t) => <TaskLine task={t} key={t.key} />)
            ) : (
              <Empty
                title="Sem tarefas para hoje"
                description="Adicione uma tarefa para começar."
                action={
                  <Button
                    variant="outline"
                    onClick={() => edit({ entity: 'tasks', defaults: { scheduled_on: date } })}
                  >
                    <Plus size={16} /> Adicionar tarefa
                  </Button>
                }
              />
            )}
            <div className="panel-footer">
              <span className={overdue ? 'warning-text' : ''}>
                {overdue ? `${overdue} atrasadas nos últimos 30 dias` : 'Seu planejamento de hoje'}
              </span>
              <Link href="/tarefas">
                Todas as tarefas <ArrowRight size={14} />
              </Link>
            </div>
          </section>
          <NewsCard />
        </div>
        <div className="stack">
          <WeatherCard />
          <section className="panel home-alerts">
            <div className="panel-heading">
              <h2>
                <Bell size={18} /> Notificações <span className="count">{unread.length}</span>
              </h2>
              <Link className="text-link" href="/configuracoes">
                Configurar
              </Link>
            </div>
            {unread.length ? (
              unread.slice(0, 5).map((n) => (
                <div className="home-alert" key={n.id}>
                  <span className="alert-dot" />
                  <Link href={destination(n.type)}>
                    <strong>{String(n.message)}</strong>
                    <small>
                      {new Intl.DateTimeFormat('pt-BR', {
                        day: '2-digit',
                        month: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit',
                        timeZone: zone,
                      }).format(new Date(String(n.created_at)))}
                    </small>
                  </Link>
                  <button
                    className="icon-button"
                    disabled={reading === n.id}
                    aria-label="Marcar notificação como lida"
                    onClick={async () => {
                      setReading(n.id);
                      try {
                        await save(
                          'notifications',
                          { ...n, read_at: new Date().toISOString() },
                          'PATCH',
                        );
                      } catch {
                        notify('Não foi possível marcar o aviso como lido.');
                      } finally {
                        setReading(null);
                      }
                    }}
                  >
                    <Check size={16} />
                  </button>
                </div>
              ))
            ) : (
              <div className="home-notifications-empty">
                <CheckCheck size={24} />
                <p>Tudo em dia por aqui.</p>
                <Link className="text-link" href="/configuracoes">
                  Ativar notificações no dispositivo
                </Link>
              </div>
            )}
          </section>
          <section className="panel home-finance">
            <div className="panel-heading">
              <h2>Financeiro do mês</h2>
              <Link className="text-link" href="/financeiro">
                <ArrowUpRight size={17} />
                <span className="sr-only">Abrir financeiro</span>
              </Link>
            </div>
            <div className="home-cashflow">
              <div>
                <span>
                  <ArrowDownLeft size={15} /> Entradas
                </span>
                <strong className="positive-text">{money(incoming)}</strong>
              </div>
              <div>
                <span>
                  <ArrowUpRight size={15} /> Saídas
                </span>
                <strong className="negative-text">{money(outgoing)}</strong>
              </div>
            </div>
            <div className="panel-footer">
              <span className={due.length ? 'warning-text' : ''}>
                {due.length
                  ? `${due.length} despesas vencidas ou previstas até 7 dias`
                  : 'Sem despesas previstas nos próximos 7 dias'}
              </span>
            </div>
            <div className="home-finance-action">
              <Button variant="outline" onClick={() => edit({ entity: 'transactions' })}>
                <Plus size={15} /> Registrar movimentação
              </Button>
            </div>
          </section>
        </div>
      </div>
    </>
  );
}
export function Stat({
  title,
  value,
  icon,
  detail,
  primary = false,
  positive = false,
  negative = false,
}: {
  title: string;
  value: string;
  icon: React.ReactNode;
  detail: string;
  primary?: boolean;
  positive?: boolean;
  negative?: boolean;
}) {
  return (
    <div className={`stat ${primary ? 'stat-primary' : ''}`}>
      <div>
        <span>{title}</span>
        <span className={positive ? 'positive-text' : negative ? 'negative-text' : ''}>{icon}</span>
      </div>
      <strong className={positive ? 'positive-text' : negative ? 'negative-text' : ''}>
        {value}
      </strong>
      <small>{detail}</small>
    </div>
  );
}
