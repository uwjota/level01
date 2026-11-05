'use client';
import { useState } from 'react';
import {
  addDays,
  addMonths,
  format,
  parseISO,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
} from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Plus, ChevronLeft, ChevronRight, Repeat2 } from 'lucide-react';
import { useApp } from './app-provider';
import { PageHeading, Empty, TaskLine } from './dashboard';
import { Button } from './ui/button';
import { expandTasks, today, type Task } from '@/lib/domain';
export function Tasks({ calendar = false }: { calendar?: boolean }) {
  const { data, edit } = useApp();
  const date = today(String(data.settings[0]?.timezone || 'America/Sao_Paulo'));
  const [filter, setFilter] = useState('Hoje'),
    [sort, setSort] = useState('date'),
    [query, setQuery] = useState(''),
    [month, setMonth] = useState(parseISO(date)),
    [selected, setSelected] = useState(date),
    [view, setView] = useState('Mês'),
    [page, setPage] = useState(0);
  const weekStartsOn = Number(data.settings[0]?.week_starts_on ?? 1) as 0 | 1;
  const start = calendar
      ? format(startOfMonth(month), 'yyyy-MM-dd')
      : format(addDays(parseISO(date), -365), 'yyyy-MM-dd'),
    end = calendar
      ? format(endOfMonth(month), 'yyyy-MM-dd')
      : format(addDays(parseISO(date), 365), 'yyyy-MM-dd');
  const items = expandTasks(data.tasks as Task[], data.task_occurrences, start, end);
  let tasks = items.filter((t) => t.title.toLowerCase().includes(query.toLowerCase()));
  if (calendar) {
    if (view === 'Mês' || view === 'Dia') tasks = tasks.filter((t) => t.scheduled_on === selected);
    if (view === 'Semana')
      tasks = tasks.filter(
        (t) =>
          t.scheduled_on >=
            format(startOfWeek(parseISO(selected), { weekStartsOn }), 'yyyy-MM-dd') &&
          t.scheduled_on <= format(endOfWeek(parseISO(selected), { weekStartsOn }), 'yyyy-MM-dd'),
      );
  } else
    tasks = tasks.filter((t) =>
      filter === 'Hoje'
        ? t.scheduled_on === date
        : filter === 'Amanhã'
          ? t.scheduled_on === format(addDays(parseISO(date), 1), 'yyyy-MM-dd')
          : filter === 'Esta semana'
            ? t.scheduled_on >= date &&
              t.scheduled_on <= format(endOfWeek(parseISO(date), { weekStartsOn }), 'yyyy-MM-dd')
            : filter === 'Concluídas'
              ? t.status === 'completed'
              : filter === 'Atrasadas'
                ? t.scheduled_on < date && t.status === 'pending'
                : true,
    );
  if (sort === 'priority') {
    const order: Record<string, number> = { high: 0, medium: 1, low: 2 };
    tasks.sort((a, b) => order[a.priority] - order[b.priority]);
  }
  const days = [];
  for (
    let d = startOfWeek(startOfMonth(month), { weekStartsOn });
    d <= endOfWeek(endOfMonth(month), { weekStartsOn });
    d = addDays(d, 1)
  )
    days.push(d);
  return (
    <>
      <PageHeading
        title={calendar ? 'Calendário' : 'Tarefas'}
        action={
          <Button
            onClick={() =>
              edit({ entity: 'tasks', defaults: { scheduled_on: calendar ? selected : date } })
            }
          >
            <Plus size={17} /> Nova tarefa
          </Button>
        }
      />
      {calendar ? (
        <section className="panel calendar-panel">
          <div className="calendar-toolbar">
            <div>
              <Button
                variant="ghost"
                aria-label="Mês anterior"
                onClick={() => setMonth(addMonths(month, -1))}
              >
                <ChevronLeft size={18} />
              </Button>
              <h2>{format(month, 'MMMM yyyy', { locale: ptBR })}</h2>
              <Button
                variant="ghost"
                aria-label="Próximo mês"
                onClick={() => setMonth(addMonths(month, 1))}
              >
                <ChevronRight size={18} />
              </Button>
            </div>
            <div className="segmented">
              {['Mês', 'Semana', 'Dia', 'Agenda'].map((v) => (
                <button className={view === v ? 'active' : ''} key={v} onClick={() => setView(v)}>
                  {v}
                </button>
              ))}
            </div>
          </div>
          {view === 'Mês' && (
            <div className="calendar-grid">
              {Array.from(
                { length: 7 },
                (_, i) => ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'][(i + weekStartsOn) % 7],
              ).map((d) => (
                <div className="weekday" key={d}>
                  {d}
                </div>
              ))}
              {days.map((day) => {
                const key = format(day, 'yyyy-MM-dd'),
                  daily = items.filter((t) => t.scheduled_on === key);
                return (
                  <button
                    key={key}
                    className={`calendar-day ${key === selected ? 'selected' : ''} ${key === date ? 'today' : ''} ${day.getMonth() !== month.getMonth() ? 'outside' : ''}`}
                    onClick={() => setSelected(key)}
                    onDoubleClick={() => edit({ entity: 'tasks', defaults: { scheduled_on: key } })}
                  >
                    <span>{format(day, 'd')}</span>
                    {daily.slice(0, 3).map((t) => (
                      <small className={t.status === 'completed' ? 'done' : ''} key={t.key}>
                        {t.recurrence && <Repeat2 size={10} />} {t.title}
                      </small>
                    ))}
                    {daily.length > 3 && <small>+{daily.length - 3} tarefas</small>}
                  </button>
                );
              })}
            </div>
          )}
        </section>
      ) : (
        <div className="list-toolbar">
          <div className="tabs">
            {['Hoje', 'Amanhã', 'Esta semana', 'Todas', 'Concluídas', 'Atrasadas'].map((f) => (
              <button
                key={f}
                className={f === filter ? 'active' : ''}
                onClick={() => {
                  setFilter(f);
                  setPage(0);
                }}
              >
                {f}
              </button>
            ))}
          </div>
          <div className="filters">
            <input
              aria-label="Buscar tarefa"
              placeholder="Buscar tarefa…"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setPage(0);
              }}
            />
            <select
              aria-label="Ordenar tarefas"
              value={sort}
              onChange={(e) => setSort(e.target.value)}
            >
              <option value="date">Por data</option>
              <option value="priority">Por prioridade</option>
            </select>
          </div>
        </div>
      )}
      <section className="panel">
        <div className="panel-heading">
          <h2>
            {calendar ? `Agenda · ${format(parseISO(selected), 'dd/MM/yyyy')}` : filter}
            <span className="count">{tasks.length}</span>
          </h2>
          {calendar && (
            <Button
              variant="ghost"
              onClick={() => edit({ entity: 'tasks', defaults: { scheduled_on: selected } })}
            >
              <Plus size={16} /> Adicionar neste dia
            </Button>
          )}
        </div>
        {tasks.length ? (
          tasks.slice(page * 30, page * 30 + 30).map((t) => (
            <div key={t.key} className="task-with-series">
              <TaskLine task={t} />
              {t.recurrence && (
                <button
                  className="series-edit"
                  onClick={() =>
                    edit({ entity: 'tasks', record: data.tasks.find((x) => x.id === t.task_id) })
                  }
                >
                  Editar série
                </button>
              )}
            </div>
          ))
        ) : (
          <Empty
            title="Nenhuma tarefa"
            description="Nenhuma tarefa encontrada neste período."
            action={
              <Button
                variant="outline"
                onClick={() =>
                  edit({ entity: 'tasks', defaults: { scheduled_on: calendar ? selected : date } })
                }
              >
                Adicionar tarefa
              </Button>
            }
          />
        )}
        <div className="panel-footer">
          <small>
            {calendar
              ? 'Selecione um dia para ver ou criar tarefas.'
              : 'Ocorrências calculadas em uma janela de um ano antes e depois de hoje.'}
          </small>
          <div className="flex">
            <Button variant="ghost" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
              Anterior
            </Button>
            <Button
              variant="ghost"
              disabled={(page + 1) * 30 >= tasks.length}
              onClick={() => setPage((p) => p + 1)}
            >
              Próxima
            </Button>
          </div>
        </div>
      </section>
    </>
  );
}
