'use client';
import { useState } from 'react';
import { Plus, Target, History, CalendarDays } from 'lucide-react';
import { differenceInCalendarDays, parseISO } from 'date-fns';
import { useApp } from './app-provider';
import { PageHeading, Empty } from './dashboard';
import { Button } from './ui/button';
import { Modal } from './ui/dialog';
import { today } from '@/lib/domain';
export function Goals() {
  const { data, edit } = useApp(),
    [filter, setFilter] = useState('active'),
    [history, setHistory] = useState<string | null>(null);
  const goals = data.goals.filter((g) => filter === 'all' || g.status === filter);
  return (
    <>
      <PageHeading
        title="Metas"
        action={
          <Button onClick={() => edit({ entity: 'goals' })}>
            <Plus size={17} /> Nova meta
          </Button>
        }
      />
      <div className="tabs section-tabs">
        {[
          ['active', 'Em andamento'],
          ['completed', 'Concluídas'],
          ['all', 'Todas'],
        ].map(([v, label]) => (
          <button key={v} className={filter === v ? 'active' : ''} onClick={() => setFilter(v)}>
            {label}
          </button>
        ))}
      </div>
      <div className="cards-grid">
        {goals.map((g) => {
          const percent = Math.min(100, (Number(g.current_value) / Number(g.target_value)) * 100),
            days = g.target_date
              ? differenceInCalendarDays(parseISO(String(g.target_date)), parseISO(today()))
              : null;
          return (
            <section className="panel goal-card" key={g.id}>
              <div className="goal-card-top">
                <span>
                  <Target size={24} />
                </span>
                <span className="badge">{String(g.category)}</span>
              </div>
              <h2>{String(g.title)}</h2>
              {g.description ? <p>{String(g.description)}</p> : null}
              <div className="goal-numbers">
                <strong>
                  {String(g.current_value)} <small>/ {String(g.target_value)}</small>
                </strong>
                <span>{Math.round(percent)}%</span>
              </div>
              <div className="progress">
                <i style={{ width: `${percent}%` }} />
              </div>
              <small className="goal-deadline">
                <CalendarDays size={14} />
                {days === null
                  ? 'Sem prazo'
                  : days < 0
                    ? `Prazo encerrado há ${-days} dias`
                    : `${days} dias restantes`}
              </small>
              <div className="goal-card-actions">
                <Button variant="outline" onClick={() => edit({ entity: 'goals', record: g })}>
                  Atualizar progresso
                </Button>
                <Button
                  variant="ghost"
                  aria-label="Histórico da meta"
                  onClick={() => setHistory(g.id)}
                >
                  <History size={18} />
                </Button>
              </div>
            </section>
          );
        })}
      </div>
      {!goals.length && (
        <section className="panel">
          <Empty
            title="Nenhuma meta"
            description="Adicione uma meta para começar."
            action={
              <Button onClick={() => edit({ entity: 'goals' })}>
                <Plus size={16} /> Criar minha primeira meta
              </Button>
            }
          />
        </section>
      )}
      <Modal
        open={!!history}
        onClose={() => setHistory(null)}
        title="Histórico"
        description="Histórico de atualizações de progresso."
      >
        {data.goal_updates
          .filter((u) => u.goal_id === history)
          .map((u) => (
            <div className="history-row" key={u.id}>
              <span>{new Date(String(u.created_at)).toLocaleString('pt-BR')}</span>
              <strong>
                {Number(u.change_value) > 0 ? '+' : ''}
                {String(u.change_value)} <small>→ {String(u.resulting_value)}</small>
              </strong>
            </div>
          ))}
      </Modal>
    </>
  );
}
