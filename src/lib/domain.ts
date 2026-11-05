import { addDays, differenceInCalendarDays, format, getDaysInMonth, parseISO } from 'date-fns';
export type Row = { id: string; user_id?: string; [key: string]: unknown };
export type Rule = {
  frequency: 'daily' | 'weekly' | 'monthly' | 'yearly';
  interval: number;
  weekdays?: number[];
  end_date?: string | null;
};
export type Task = Row & {
  title: string;
  scheduled_on: string;
  scheduled_time?: string | null;
  priority: string;
  status: string;
  recurrence: Rule | null;
};
export type Occurrence = Task & { key: string; original_date: string; task_id: string };
export const money = (minor: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(minor / 100);
export function toMinor(value: string): number {
  const normalized = value.trim().replace(/\./g, '').replace(',', '.');
  if (!/^-?\d+(\.\d{1,2})?$/.test(normalized)) throw new Error('Use um valor como 1.250,90.');
  const negative = normalized.startsWith('-');
  const [whole, part = ''] = normalized.replace('-', '').split('.');
  const amount = Number(whole) * 100 + Number(part.padEnd(2, '0'));
  if (!Number.isSafeInteger(amount) || amount > 9_000_000_000_000)
    throw new Error('Valor fora do limite.');
  return negative ? -amount : amount;
}
export function today(timezone = 'America/Sao_Paulo', now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}
export function occurs(start: string, date: string, rule: Rule | null) {
  if (date < start) return false;
  if (!rule) return date === start;
  if (rule.end_date && date > rule.end_date) return false;
  const a = parseISO(start),
    b = parseISO(date),
    days = differenceInCalendarDays(b, a),
    step = Math.max(1, rule.interval);
  if (rule.frequency === 'daily') return days % step === 0;
  if (rule.frequency === 'weekly')
    return (
      Math.floor((days + a.getDay()) / 7) % step === 0 &&
      (rule.weekdays?.length ? rule.weekdays : [a.getDay()]).includes(b.getDay())
    );
  const months = (b.getFullYear() - a.getFullYear()) * 12 + b.getMonth() - a.getMonth();
  if (rule.frequency === 'monthly')
    return months % step === 0 && b.getDate() === Math.min(a.getDate(), getDaysInMonth(b));
  return (
    (b.getFullYear() - a.getFullYear()) % step === 0 &&
    b.getMonth() === a.getMonth() &&
    b.getDate() === Math.min(a.getDate(), getDaysInMonth(b))
  );
}
export function expandTasks(
  tasks: Task[],
  exceptions: Row[],
  from: string,
  to: string,
): Occurrence[] {
  if (differenceInCalendarDays(parseISO(to), parseISO(from)) > 730)
    throw new Error('Selecione até dois anos.');
  const result: Occurrence[] = [];
  const seen = new Set<string>();
  for (const t of tasks) {
    for (let d = parseISO(from); format(d, 'yyyy-MM-dd') <= to; d = addDays(d, 1)) {
      const date = format(d, 'yyyy-MM-dd');
      if (!occurs(t.scheduled_on, date, t.recurrence)) continue;
      const ex = exceptions.find((x) => x.task_id === t.id && x.occurrence_date === date);
      const override = (ex?.override_data ?? {}) as Partial<Task>;
      const item = {
        ...t,
        ...override,
        status: String(ex?.status ?? t.status),
        key: `${t.id}:${date}`,
        original_date: date,
        task_id: t.id,
        scheduled_on: override.scheduled_on ?? date,
      };
      seen.add(item.key);
      if (item.scheduled_on >= from && item.scheduled_on <= to) result.push(item);
    }
    // Include occurrences rescheduled into this window from outside it.
    for (const ex of exceptions.filter((x) => x.task_id === t.id)) {
      const override = (ex.override_data ?? {}) as Partial<Task>;
      const key = `${t.id}:${ex.occurrence_date}`;
      if (
        !seen.has(key) &&
        override.scheduled_on &&
        override.scheduled_on >= from &&
        override.scheduled_on <= to &&
        occurs(t.scheduled_on, String(ex.occurrence_date), t.recurrence)
      )
        result.push({
          ...t,
          ...override,
          status: String(ex.status),
          key,
          task_id: t.id,
          original_date: String(ex.occurrence_date),
        });
    }
  }
  return result.sort((a, b) =>
    (a.scheduled_on + (a.scheduled_time ?? '')).localeCompare(
      b.scheduled_on + (b.scheduled_time ?? ''),
    ),
  );
}
export function balances(accounts: Row[], transactions: Row[]) {
  const b: Record<string, number> = {};
  for (const a of accounts) b[a.id] = Number(a.opening_balance_minor);
  for (const t of transactions) {
    if (t.status !== 'confirmed') continue;
    const n = Number(t.amount_minor),
      id = String(t.account_id);
    b[id] = (b[id] ?? 0) + (t.type === 'income' ? n : -n);
    if (t.type === 'transfer') {
      const dest = String(t.destination_account_id);
      b[dest] = (b[dest] ?? 0) + n;
    }
  }
  return b;
}
export function csv(rows: Row[]) {
  const fields = [
    'description',
    'type',
    'amount_minor',
    'occurred_on',
    'status',
    'account_id',
    'category_id',
  ];
  const escape = (x: unknown) =>
    '"' +
    String(x ?? '')
      .replace(/^[=+@\-\t\r]/, "'$&")
      .replace(/"/g, '""') +
    '"';
  return (
    '\uFEFF' +
    [fields.join(';'), ...rows.map((r) => fields.map((k) => escape(r[k])).join(';'))].join('\r\n')
  );
}
