'use client';
import { useState } from 'react';
import {
  ArrowDownLeft,
  ArrowUpRight,
  Wallet,
  Plus,
  Repeat2,
  Download,
  Check,
  ArrowRightLeft,
  Pencil,
  Trash2,
} from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
  CartesianGrid,
  Legend,
} from 'recharts';
import { addMonths, format, parseISO } from 'date-fns';
import { useApp } from './app-provider';
import { Button } from './ui/button';
import { Empty, PageHeading, Stat } from './dashboard';
import { balances, csv, money, today } from '@/lib/domain';
import { download } from '@/lib/data';
import { Attachments } from './attachments';
export function Finance() {
  const { data, edit, save, remove, notify, refresh } = useApp();
  const [tab, setTab] = useState('Movimentações'),
    [period, setPeriod] = useState(today().slice(0, 7)),
    [account, setAccount] = useState(''),
    [category, setCategory] = useState(''),
    [query, setQuery] = useState(''),
    [page, setPage] = useState(0),
    [busy, setBusy] = useState(false),
    [attachment, setAttachment] = useState<string | null>(null);
  const b = balances(data.financial_accounts, data.transactions),
    total = Object.values(b).reduce((a, b) => a + b, 0);
  const tx = data.transactions
    .filter(
      (t) =>
        (!period || String(t.occurred_on).startsWith(period)) &&
        (!account || t.account_id === account || t.destination_account_id === account) &&
        (!category || t.category_id === category) &&
        String(t.description).toLowerCase().includes(query.toLowerCase()),
    )
    .sort((a, b) => String(b.occurred_on).localeCompare(String(a.occurred_on)));
  const income = tx
      .filter((t) => t.type === 'income' && t.status === 'confirmed')
      .reduce((a, t) => a + Number(t.amount_minor), 0),
    expense = tx
      .filter((t) => t.type === 'expense' && t.status === 'confirmed')
      .reduce((a, t) => a + Number(t.amount_minor), 0);
  async function generate() {
    setBusy(true);
    try {
      const r = await fetch('/api/recurrences', { method: 'POST' });
      if (!r.ok) throw Error('Falha ao gerar previsões.');
      await refresh();
      notify('Previsões atualizadas para os próximos 90 dias.');
    } catch (e) {
      notify((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const chartData = Array.from({ length: 6 }, (_, i) => {
    const month = format(
      addMonths(parseISO((period || today().slice(0, 7)) + '-01'), i - 5),
      'yyyy-MM',
    );
    const items = data.transactions.filter(
      (t) =>
        String(t.occurred_on).startsWith(month) &&
        t.status === 'confirmed' &&
        (!account || t.account_id === account || t.destination_account_id === account) &&
        (!category || t.category_id === category),
    );
    const before = data.transactions.filter((t) => String(t.occurred_on).slice(0, 7) <= month);
    const balancesAt = balances(data.financial_accounts, before);
    return {
      name: month.slice(5),
      Entradas: items
        .filter((t) => t.type === 'income')
        .reduce((s, t) => s + Number(t.amount_minor) / 100, 0),
      Saídas: items
        .filter((t) => t.type === 'expense')
        .reduce((s, t) => s + Number(t.amount_minor) / 100, 0),
      Saldo:
        (account
          ? balancesAt[account] || 0
          : Object.values(balancesAt).reduce((a, b) => a + b, 0)) / 100,
    };
  });
  const categories = [
    ...data.financial_categories,
    { id: 'none', name: 'Sem categoria', color: '#8a8a8a' },
  ]
    .map((c, index) => ({
      name: String(c.name),
      color: ['var(--accent)', '#8a8a8a', '#b5b5b5', '#626262', '#d4d4d4', '#444444'][index % 6],
      value: tx
        .filter(
          (t) =>
            t.type === 'expense' && t.status === 'confirmed' && (t.category_id || 'none') === c.id,
        )
        .reduce((s, t) => s + Number(t.amount_minor) / 100, 0),
    }))
    .filter((c) => c.value > 0);
  return (
    <>
      <PageHeading
        title="Finanças"
        action={
          <Button onClick={() => edit({ entity: 'transactions' })}>
            <Plus size={17} /> Nova movimentação
          </Button>
        }
      />
      <div className="stats-grid">
        <Stat
          title="Saldo consolidado"
          value={money(total)}
          detail="Todas as contas · saldo real"
          icon={<Wallet size={18} />}
          primary
        />
        <Stat
          title="Entradas no período"
          value={money(income)}
          detail="Somente efetivadas"
          icon={<ArrowDownLeft size={18} />}
          positive
        />
        <Stat
          title="Saídas no período"
          value={money(expense)}
          detail="Somente efetivadas"
          icon={<ArrowUpRight size={18} />}
          negative
        />
        <Stat
          title="Resultado do período"
          value={money(income - expense)}
          detail="Transferências não incluídas"
          positive={income > expense}
          negative={income < expense}
          icon={<ArrowRightLeft size={18} />}
        />
      </div>
      <div className="list-toolbar">
        <div className="tabs">
          {['Movimentações', 'Contas', 'Categorias', 'Recorrências', 'Relatórios'].map((t) => (
            <button key={t} onClick={() => setTab(t)} className={tab === t ? 'active' : ''}>
              {t}
            </button>
          ))}
        </div>
      </div>
      {['Movimentações', 'Relatórios'].includes(tab) && (
        <div className="filters finance-filters">
          <input
            aria-label="Mês"
            type="month"
            value={period}
            onChange={(e) => {
              setPeriod(e.target.value);
              setPage(0);
            }}
          />
          <select
            aria-label="Filtrar conta"
            value={account}
            onChange={(e) => {
              setAccount(e.target.value);
              setPage(0);
            }}
          >
            <option value="">Todas as contas</option>
            {data.financial_accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {String(a.name)}
              </option>
            ))}
          </select>
          <select
            aria-label="Filtrar categoria"
            value={category}
            onChange={(e) => {
              setCategory(e.target.value);
              setPage(0);
            }}
          >
            <option value="">Todas as categorias</option>
            {data.financial_categories.map((c) => (
              <option key={c.id} value={c.id}>
                {String(c.name)}
              </option>
            ))}
          </select>
          <input
            aria-label="Pesquisar movimentação"
            placeholder="Pesquisar…"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(0);
            }}
          />
        </div>
      )}
      {tab === 'Movimentações' && (
        <section className="panel">
          <div className="panel-heading">
            <h2>
              Suas movimentações <span className="count">{tx.length}</span>
            </h2>
            <Button
              variant="ghost"
              onClick={() => download('movimentacoes.csv', csv(tx), 'text/csv;charset=utf-8')}
            >
              <Download size={16} /> CSV
            </Button>
          </div>
          {!tx.length ? (
            <Empty
              title="Sem movimentações"
              description="Crie uma conta e adicione sua primeira movimentação."
              action={
                <Button
                  variant="outline"
                  onClick={() =>
                    edit({
                      entity: data.financial_accounts.length
                        ? 'transactions'
                        : 'financial_accounts',
                    })
                  }
                >
                  {data.financial_accounts.length
                    ? 'Registrar movimentação'
                    : 'Criar minha primeira conta'}
                </Button>
              }
            />
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Descrição</th>
                    <th>Conta / categoria</th>
                    <th>Data</th>
                    <th>Situação</th>
                    <th>Valor</th>
                    <th>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {tx.slice(page * 30, page * 30 + 30).map((t) => (
                    <tr key={t.id}>
                      <td>
                        <button
                          className="table-title"
                          onClick={() => edit({ entity: 'transactions', record: t })}
                        >
                          {String(t.description)}
                        </button>
                        <button className="text-link small" onClick={() => setAttachment(t.id)}>
                          Comprovantes
                        </button>
                      </td>
                      <td>
                        {String(
                          data.financial_accounts.find((a) => a.id === t.account_id)?.name || '',
                        )}
                        <small>
                          {String(
                            data.financial_categories.find((c) => c.id === t.category_id)?.name ||
                              (t.type === 'transfer' ? 'Transferência' : 'Sem categoria'),
                          )}
                        </small>
                      </td>
                      <td>{format(parseISO(String(t.occurred_on)), 'dd/MM/yyyy')}</td>
                      <td>
                        <span
                          className={`badge ${t.status === 'planned' ? 'priority-medium' : 'priority-low'}`}
                        >
                          {t.status === 'planned' ? 'Prevista' : 'Efetivada'}
                        </span>
                      </td>
                      <td
                        className={
                          t.type === 'income'
                            ? 'positive-text'
                            : t.type === 'expense'
                              ? 'negative-text'
                              : ''
                        }
                      >
                        {t.type === 'expense' ? '−' : ''}
                        {money(Number(t.amount_minor))}
                      </td>
                      <td>
                        <div className="row-actions">
                          {t.status === 'planned' && (
                            <button
                              className="icon-button"
                              title="Confirmar movimentação"
                              onClick={() =>
                                void save(
                                  'transactions',
                                  { ...t, status: 'confirmed' },
                                  'PATCH',
                                ).catch((e) => notify(e.message))
                              }
                            >
                              <Check size={17} />
                            </button>
                          )}
                          <button
                            className="icon-button"
                            aria-label="Editar movimentação"
                            onClick={() => edit({ entity: 'transactions', record: t })}
                          >
                            <Pencil size={16} />
                          </button>
                          <button
                            className="icon-button"
                            aria-label="Excluir movimentação"
                            onClick={() => void remove('transactions', t)}
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="panel-footer">
            <span>Previsões não alteram seu saldo real.</span>
            <div className="flex">
              <Button variant="ghost" disabled={!page} onClick={() => setPage((p) => p - 1)}>
                Anterior
              </Button>
              <Button
                variant="ghost"
                disabled={(page + 1) * 30 >= tx.length}
                onClick={() => setPage((p) => p + 1)}
              >
                Próxima
              </Button>
            </div>
          </div>
        </section>
      )}
      {['Contas', 'Categorias', 'Recorrências'].includes(tab) && (
        <>
          <div className="section-actions">
            <Button
              variant="outline"
              onClick={() =>
                edit({
                  entity:
                    tab === 'Contas'
                      ? 'financial_accounts'
                      : tab === 'Categorias'
                        ? 'financial_categories'
                        : 'financial_recurrence_rules',
                })
              }
            >
              <Plus size={16} /> Adicionar{' '}
              {tab === 'Contas' ? 'conta' : tab === 'Categorias' ? 'categoria' : 'recorrência'}
            </Button>
            {tab === 'Recorrências' && (
              <Button disabled={busy} onClick={() => void generate()}>
                <Repeat2 size={16} />
                {busy ? 'Gerando…' : 'Gerar previsões · 90 dias'}
              </Button>
            )}
          </div>
          <div className="cards-grid">
            {(tab === 'Contas'
              ? data.financial_accounts
              : tab === 'Categorias'
                ? data.financial_categories
                : data.financial_recurrence_rules
            ).map((r) => (
              <button
                className="panel account-card"
                key={r.id}
                onClick={() =>
                  edit({
                    entity:
                      tab === 'Contas'
                        ? 'financial_accounts'
                        : tab === 'Categorias'
                          ? 'financial_categories'
                          : 'financial_recurrence_rules',
                    record: r,
                  })
                }
              >
                <span className="account-dot" />
                <h3>{String(r.name ?? r.description)}</h3>
                {tab === 'Contas' ? (
                  <>
                    <strong>{money(b[r.id] ?? 0)}</strong>
                    <small>{r.archived_at ? 'Arquivada' : 'Conta ativa'}</small>
                  </>
                ) : tab === 'Recorrências' ? (
                  <>
                    <strong>{money(Number(r.amount_minor))}</strong>
                    <small>{r.active ? 'Ativa' : 'Encerrada'} · confirmar cada lançamento</small>
                  </>
                ) : (
                  <small>{r.type === 'income' ? 'Receita' : 'Despesa'}</small>
                )}
              </button>
            ))}
          </div>
          {!(
            tab === 'Contas'
              ? data.financial_accounts
              : tab === 'Categorias'
                ? data.financial_categories
                : data.financial_recurrence_rules
          ).length && (
            <section className="panel">
              <Empty
                title="Nenhum registro"
                description="Adicione seu primeiro registro usando o botão acima."
              />
            </section>
          )}
        </>
      )}
      {tab === 'Relatórios' && (
        <div className="report-grid">
          <section className="panel chart-panel">
            <h2>Entradas e saídas · seis meses</h2>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={chartData}>
                <CartesianGrid vertical={false} stroke="var(--border)" />
                <XAxis dataKey="name" stroke="var(--muted)" tickLine={false} axisLine={false} />
                <YAxis stroke="var(--muted)" tickLine={false} axisLine={false} />
                <Tooltip
                  contentStyle={{
                    background: 'var(--surface)',
                    border: '1px solid var(--border)',
                    borderRadius: 12,
                    color: 'var(--text)',
                  }}
                  itemStyle={{ color: 'var(--text)' }}
                  formatter={(v) => money(Number(v) * 100)}
                />
                <Legend iconType="circle" iconSize={8} />
                <Bar dataKey="Entradas" fill="var(--positive)" radius={[4, 4, 0, 0]} />
                <Bar dataKey="Saídas" fill="var(--negative)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </section>
          <section className="panel chart-panel">
            <h2>Despesas por categoria</h2>
            {categories.length ? (
              <>
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie
                      data={categories}
                      dataKey="value"
                      nameKey="name"
                      innerRadius={60}
                      outerRadius={90}
                    >
                      {categories.map((c) => (
                        <Cell key={c.name} fill={c.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        background: 'var(--surface)',
                        border: '1px solid var(--border)',
                        borderRadius: 12,
                        color: 'var(--text)',
                      }}
                      itemStyle={{ color: 'var(--text)' }}
                      formatter={(v) => money(Number(v) * 100)}
                    />
                  </PieChart>
                </ResponsiveContainer>
                <div className="chart-legend">
                  {categories.map((c) => (
                    <span key={c.name}>
                      <i style={{ background: c.color }} />
                      {c.name} · {money(c.value * 100)}
                    </span>
                  ))}
                </div>
              </>
            ) : (
              <Empty
                title="Sem despesas neste período"
                description="Os gráficos usam somente suas movimentações reais."
              />
            )}
          </section>
          <section className="panel chart-panel full">
            <h2>Evolução do saldo confirmado</h2>
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={chartData}>
                <CartesianGrid vertical={false} stroke="var(--border)" />
                <XAxis dataKey="name" stroke="var(--muted)" tickLine={false} axisLine={false} />
                <YAxis stroke="var(--muted)" tickLine={false} axisLine={false} />
                <Tooltip
                  contentStyle={{
                    background: 'var(--surface)',
                    border: '1px solid var(--border)',
                    borderRadius: 12,
                    color: 'var(--text)',
                  }}
                  itemStyle={{ color: 'var(--text)' }}
                  formatter={(v) => money(Number(v) * 100)}
                />
                <Line dataKey="Saldo" stroke="var(--accent)" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </section>
        </div>
      )}
      {attachment && (
        <Attachments entity="transactions" id={attachment} onClose={() => setAttachment(null)} />
      )}
    </>
  );
}
