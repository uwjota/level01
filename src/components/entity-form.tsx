'use client';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Save, Trash2 } from 'lucide-react';
import { useApp } from './app-provider';
import { Modal } from './ui/dialog';
import { Button } from './ui/button';
import { today, toMinor, type Row } from '@/lib/domain';
import { schemas, type Entity } from '@/lib/schemas';
type Field = {
  name: string;
  label: string;
  type?: string;
  options?: [string, string][];
  required?: boolean;
  full?: boolean;
};
const fields: Record<string, Field[]> = {
  tasks: [
    { name: 'title', label: 'Título', required: true, full: true },
    { name: 'description', label: 'Descrição', type: 'textarea', full: true },
    { name: 'scheduled_on', label: 'Data', type: 'date', required: true },
    { name: 'scheduled_time', label: 'Horário', type: 'time' },
    {
      name: 'priority',
      label: 'Prioridade',
      options: [
        ['low', 'Baixa'],
        ['medium', 'Média'],
        ['high', 'Alta'],
      ],
    },
    {
      name: 'status',
      label: 'Status',
      options: [
        ['pending', 'Pendente'],
        ['completed', 'Concluída'],
        ['cancelled', 'Cancelada'],
      ],
    },
  ],
  transactions: [
    { name: 'description', label: 'Descrição', required: true, full: true },
    {
      name: 'type',
      label: 'Tipo',
      options: [
        ['expense', 'Saída'],
        ['income', 'Entrada'],
        ['transfer', 'Transferência'],
      ],
    },
    { name: 'amount', label: 'Valor (R$)', required: true },
    { name: 'account_id', label: 'Conta de origem', required: true },
    { name: 'destination_account_id', label: 'Conta de destino' },
    { name: 'category_id', label: 'Categoria' },
    { name: 'occurred_on', label: 'Data', type: 'date', required: true },
    {
      name: 'status',
      label: 'Situação',
      options: [
        ['confirmed', 'Efetivada'],
        ['planned', 'Prevista'],
      ],
    },
    { name: 'notes', label: 'Observação', type: 'textarea', full: true },
  ],
  financial_accounts: [
    { name: 'name', label: 'Nome da conta', required: true, full: true },
    {
      name: 'type',
      label: 'Tipo',
      options: [
        ['checking', 'Conta corrente'],
        ['digital', 'Conta digital'],
        ['cash', 'Dinheiro'],
        ['savings', 'Poupança'],
        ['other', 'Outra'],
      ],
    },
    { name: 'opening', label: 'Saldo inicial (R$)', required: true },
    { name: 'archived', label: 'Arquivar conta', type: 'checkbox' },
  ],
  financial_categories: [
    { name: 'name', label: 'Nome', required: true, full: true },
    {
      name: 'type',
      label: 'Tipo',
      options: [
        ['expense', 'Despesa'],
        ['income', 'Receita'],
      ],
    },
  ],
  financial_recurrence_rules: [
    { name: 'description', label: 'Descrição', required: true, full: true },
    {
      name: 'type',
      label: 'Tipo',
      options: [
        ['expense', 'Saída'],
        ['income', 'Entrada'],
      ],
    },
    { name: 'amount', label: 'Valor (R$)', required: true },
    { name: 'account_id', label: 'Conta', required: true },
    { name: 'category_id', label: 'Categoria' },
    { name: 'start_date', label: 'Primeira data', type: 'date', required: true },
    { name: 'active', label: 'Recorrência ativa', type: 'checkbox' },
  ],
  notes: [
    { name: 'title', label: 'Título', required: true, full: true },
    { name: 'content', label: 'Sua anotação', type: 'textarea', full: true },
    { name: 'category', label: 'Categoria' },
    { name: 'tags_text', label: 'Etiquetas (separadas por vírgula)' },
    { name: 'favorite', label: 'Favorita', type: 'checkbox' },
  ],
  goals: [
    { name: 'title', label: 'Nome da meta', required: true, full: true },
    { name: 'description', label: 'Descrição', type: 'textarea', full: true },
    { name: 'category', label: 'Categoria' },
    { name: 'target_value', label: 'Quantidade-alvo', type: 'number', required: true },
    { name: 'current_value', label: 'Progresso atual', type: 'number', required: true },
    { name: 'start_date', label: 'Início', type: 'date', required: true },
    { name: 'target_date', label: 'Prazo', type: 'date' },
    {
      name: 'status',
      label: 'Status',
      options: [
        ['active', 'Em andamento'],
        ['completed', 'Concluída'],
        ['paused', 'Pausada'],
      ],
    },
  ],
};
const names: Record<string, string> = {
  tasks: 'tarefa',
  transactions: 'movimentação',
  financial_accounts: 'conta',
  financial_categories: 'categoria',
  financial_recurrence_rules: 'recorrência financeira',
  notes: 'nota',
  goals: 'meta',
};
export function EntityForm({
  editor,
  onClose,
}: {
  editor: {
    entity: string;
    record?: Row;
    defaults?: Record<string, unknown>;
    scope?: 'occurrence';
    original?: string;
  };
  onClose: () => void;
}) {
  const { data, save, notify, remove } = useApp(),
    { entity, record, scope } = editor;
  const r: Record<string, unknown> = record ?? {};
  const recurrence = r.recurrence as
    { frequency?: string; interval?: number; weekdays?: number[]; end_date?: string } | undefined;
  const { register, handleSubmit, watch } = useForm<Record<string, unknown>>({
    defaultValues: {
      title: '',
      description: '',
      content: '',
      notes: '',
      scheduled_on: today(String(data.settings[0]?.timezone || 'America/Sao_Paulo')),
      scheduled_time: '',
      occurred_on: today(),
      start_date: today(),
      priority: 'medium',
      status: entity === 'goals' ? 'active' : entity === 'transactions' ? 'confirmed' : 'pending',
      type: entity === 'financial_accounts' ? 'checking' : 'expense',
      color: '#171717',
      category: 'Pessoal',
      target_value: 100,
      current_value: 0,
      active: true,
      ...r,
      ...editor.defaults,
      amount:
        r.amount_minor !== undefined
          ? (Number(r.amount_minor) / 100).toFixed(2).replace('.', ',')
          : '',
      opening:
        r.opening_balance_minor !== undefined
          ? (Number(r.opening_balance_minor) / 100).toFixed(2).replace('.', ',')
          : '0,00',
      tags_text: Array.isArray(r.tags) ? r.tags.join(', ') : '',
      archived: !!r.archived_at,
      frequency:
        recurrence?.frequency ?? (entity === 'financial_recurrence_rules' ? 'monthly' : 'none'),
      interval: recurrence?.interval ?? 1,
      weekdays: recurrence?.weekdays?.map(String) ?? [],
      end_date: recurrence?.end_date ?? '',
    },
  });
  const [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  const type = watch('type'),
    frequency = watch('frequency');
  async function submit(values: Record<string, unknown>) {
    setBusy(true);
    setError('');
    try {
      const v = { ...values };
      for (const key of ['target_value', 'current_value']) if (key in v) v[key] = Number(v[key]);
      if ('amount' in v) v.amount_minor = String(v.amount) ? toMinor(String(v.amount)) : 0;
      if (entity === 'financial_accounts') v.opening_balance_minor = toMinor(String(v.opening));
      v.archived_at = v.archived ? new Date().toISOString() : null;
      v.tags = String(v.tags_text ?? '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      for (const key of ['scheduled_time', 'target_date', 'category_id', 'destination_account_id'])
        v[key] = v[key] || null;
      if (type !== 'transfer') v.destination_account_id = null;
      else v.category_id = null;
      v.recurrence =
        frequency === 'none'
          ? null
          : {
              frequency,
              interval: Number(v.interval),
              weekdays: Array.isArray(v.weekdays) ? v.weekdays.map(Number) : [],
              end_date: v.end_date || null,
            };
      const parsed = schemas[entity as Entity].safeParse(v);
      if (!parsed.success)
        throw new Error(
          parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join(' · '),
        );
      if (scope === 'occurrence' && record) {
        await save('task_occurrences', {
          task_id: record.task_id ?? record.id,
          occurrence_date: editor.original,
          status: v.status,
          completed_at: v.status === 'completed' ? new Date().toISOString() : null,
          override_data: {
            title: v.title,
            description: v.description,
            scheduled_on: v.scheduled_on,
            scheduled_time: v.scheduled_time,
            priority: v.priority,
          },
        });
      } else
        await save(
          entity,
          { ...parsed.data, ...(record ? { id: record.id } : {}) },
          record ? 'PATCH' : 'POST',
        );
      notify('Salvo.');
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      open
      onClose={onClose}
      title={`${record ? 'Editar' : 'Nova'} ${names[entity] ?? 'informação'}${scope === 'occurrence' ? ' · esta ocorrência' : ''}`}
    >
      <form onSubmit={handleSubmit(submit)}>
        <div className="form-grid">
          {(fields[entity] ?? [])
            .filter(
              (f) =>
                !(f.name === 'destination_account_id' && type !== 'transfer') &&
                !(f.name === 'category_id' && type === 'transfer'),
            )
            .map((f) => {
              let options = f.options;
              if (f.name === 'account_id' || f.name === 'destination_account_id')
                options = data.financial_accounts
                  .filter((a) => !a.archived_at || a.id === r[f.name])
                  .map((a) => [a.id, String(a.name)]);
              if (f.name === 'category_id')
                options = data.financial_categories
                  .filter((c) => c.type === type)
                  .map((c) => [c.id, String(c.name)]);
              return (
                <label
                  key={f.name}
                  className={`${f.full ? 'full' : ''} ${f.type === 'checkbox' ? 'check-label' : ''}`}
                >
                  {f.label}
                  {options ? (
                    <select {...register(f.name)} required={f.required}>
                      {!f.options && <option value="">Selecionar…</option>}
                      {options.map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                  ) : f.type === 'textarea' ? (
                    <textarea {...register(f.name)} rows={entity === 'notes' ? 8 : 3} />
                  ) : (
                    <input
                      {...register(f.name)}
                      type={f.type ?? 'text'}
                      required={f.required}
                      step={f.type === 'number' ? 'any' : undefined}
                      min={f.type === 'number' ? 0 : undefined}
                    />
                  )}
                </label>
              );
            })}
          {(entity === 'tasks' || entity === 'financial_recurrence_rules') &&
            scope !== 'occurrence' && (
              <>
                <label className="full">
                  Repetir
                  <select {...register('frequency')}>
                    <option value="none">Não repetir</option>
                    <option value="daily">Diariamente</option>
                    <option value="weekly">Semanalmente / dias específicos</option>
                    <option value="monthly">Mensalmente</option>
                    <option value="yearly">Anualmente</option>
                  </select>
                </label>
                {frequency !== 'none' && (
                  <>
                    <label>
                      A cada (intervalo)
                      <input type="number" min="1" max="365" {...register('interval')} />
                    </label>
                    <label>
                      Encerrar em (opcional)
                      <input type="date" {...register('end_date')} />
                    </label>
                    {frequency === 'weekly' && (
                      <fieldset className="full weekdays">
                        <legend>Dias da semana</legend>
                        {['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].map((day, i) => (
                          <label key={day}>
                            <input type="checkbox" value={String(i)} {...register('weekdays')} />
                            {day}
                          </label>
                        ))}
                      </fieldset>
                    )}
                  </>
                )}
              </>
            )}
        </div>
        {error && (
          <p role="alert" className="notice error">
            {error}
          </p>
        )}
        <div className="form-footer">
          {record && scope !== 'occurrence' && (
            <Button
              type="button"
              variant="destructive"
              onClick={async () => {
                await remove(entity, record);
                onClose();
              }}
            >
              <Trash2 size={16} /> Excluir
            </Button>
          )}
          <Button type="button" variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" disabled={busy}>
            <Save size={16} />
            {busy ? 'Salvando…' : 'Salvar'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
