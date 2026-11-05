import { addDays, format, parseISO } from 'date-fns';
import { expandTasks, today, type Row, type Task } from './domain';
import { reminderDue } from './reminders';
export function buildReminders(
  userId: string,
  settings: Row | undefined,
  tasks: Row[],
  occurrences: Row[],
  transactions: Row[],
  goals: Row[],
  now = new Date(),
) {
  const zone = String(settings?.timezone || 'America/Sao_Paulo');
  const date = new Intl.DateTimeFormat('en-CA', {
    timeZone: zone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
  const end = format(addDays(parseISO(date), 7), 'yyyy-MM-dd');
  const prefs = (settings?.notification_preferences ?? {
    tasks: true,
    finance: true,
    goals: true,
    advance_minutes: 30,
  }) as Record<string, unknown>;
  const rows: {
    user_id: string;
    type: string;
    message: string;
    scheduled_at: string;
    idempotency_key: string;
  }[] = [];
  const push = (type: string, message: string, key: string) =>
    rows.push({
      user_id: userId,
      type,
      message: message.slice(0, 300),
      scheduled_at: now.toISOString(),
      idempotency_key: key,
    });
  if (prefs.tasks)
    for (const task of expandTasks(tasks as Task[], occurrences, date, end)) {
      if (
        task.status === 'pending' &&
        reminderDue(
          task.scheduled_on,
          task.scheduled_time || '09:00',
          zone,
          task.scheduled_time ? Number(prefs.advance_minutes ?? 30) : 0,
          now,
        )
      )
        push(
          'task',
          `Tarefa ${task.scheduled_on === date ? 'hoje' : format(parseISO(task.scheduled_on), 'dd/MM')}: ${task.title}`,
          `task:${task.key}`,
        );
    }
  if (reminderDue(date, '09:00', zone, 0, now)) {
    if (prefs.finance)
      for (const item of transactions.filter(
        (t) => t.type === 'expense' && t.status === 'planned' && String(t.occurred_on) <= end,
      ))
        push('finance', `Despesa prevista: ${item.description}`, `finance:${item.id}`);
    if (prefs.goals)
      for (const item of goals.filter(
        (g) => g.status === 'active' && g.target_date && String(g.target_date) <= end,
      ))
        push('goal', `Prazo da meta: ${item.title}`, `goal:${item.id}:${item.target_date}`);
  }
  return rows;
}
