import { describe, it, expect } from 'vitest';
import { balances, occurs, expandTasks, toMinor, today, csv, type Task } from '../src/lib/domain';
import { schemas } from '../src/lib/schemas';
const task: Task = {
  id: '1',
  title: 'Estudar',
  scheduled_on: '2026-01-05',
  scheduled_time: '19:00',
  status: 'pending',
  priority: 'medium',
  recurrence: { frequency: 'weekly', interval: 1, weekdays: [1, 3, 5] },
};
describe('Recurring tasks', () => {
  it('generates only requested weekdays and keeps future occurrences pending', () => {
    const rows = expandTasks(
      [task],
      [{ id: 'x', task_id: '1', occurrence_date: '2026-01-05', status: 'completed' }],
      '2026-01-05',
      '2026-01-11',
    );
    expect(rows.map((r) => r.scheduled_on)).toEqual(['2026-01-05', '2026-01-07', '2026-01-09']);
    expect(rows.map((r) => r.status)).toEqual(['completed', 'pending', 'pending']);
  });
  it('moves one occurrence without changing the series and includes moved-in exceptions', () => {
    const rows = expandTasks(
      [task],
      [
        {
          id: 'x',
          task_id: '1',
          occurrence_date: '2026-01-05',
          status: 'pending',
          override_data: { scheduled_on: '2026-01-13', title: 'Estudar depois' },
        },
      ],
      '2026-01-12',
      '2026-01-18',
    );
    expect(rows.find((r) => r.original_date === '2026-01-05')?.scheduled_on).toBe('2026-01-13');
    expect(rows.find((r) => r.original_date === '2026-01-14')?.title).toBe('Estudar');
  });
  it('clamps month-end and leap day without drifting future months', () => {
    const r = { frequency: 'monthly' as const, interval: 1 };
    expect(occurs('2026-01-31', '2026-02-28', r)).toBe(true);
    expect(occurs('2026-01-31', '2026-03-31', r)).toBe(true);
    expect(occurs('2026-01-31', '2026-03-28', r)).toBe(false);
    expect(occurs('2024-02-29', '2025-02-28', { frequency: 'yearly', interval: 1 })).toBe(true);
  });
  it('respects intervals, ending and single tasks', () => {
    expect(occurs('2026-01-01', '2026-01-04', { frequency: 'daily', interval: 3 })).toBe(true);
    expect(
      occurs('2026-01-01', '2026-01-04', {
        frequency: 'daily',
        interval: 3,
        end_date: '2026-01-03',
      }),
    ).toBe(false);
    expect(occurs('2026-01-01', '2026-01-02', null)).toBe(false);
  });
  it('uses configured timezone at the UTC date boundary', () => {
    expect(today('America/Sao_Paulo', new Date('2026-11-05T01:00:00Z'))).toBe('2026-11-04');
    expect(today('Asia/Tokyo', new Date('2026-11-05T01:00:00Z'))).toBe('2026-11-05');
  });
});
describe('Money', () => {
  it('parses integer cents exactly and rejects hidden precision', () => {
    expect(toMinor('1.234,56')).toBe(123456);
    expect(toMinor('0,10') + toMinor('0,20')).toBe(30);
    expect(() => toMinor('1,234')).toThrow();
  });
  it('transfers preserve consolidated balance and planned expenses do not reduce it', () => {
    const accounts = [
      { id: 'a', opening_balance_minor: 10000 },
      { id: 'b', opening_balance_minor: 0 },
    ];
    const tx = [
      { id: '1', account_id: 'a', type: 'income', status: 'confirmed', amount_minor: 2500 },
      { id: '2', account_id: 'a', type: 'expense', status: 'planned', amount_minor: 8000 },
      {
        id: '3',
        account_id: 'a',
        destination_account_id: 'b',
        type: 'transfer',
        status: 'confirmed',
        amount_minor: 3000,
      },
    ];
    expect(balances(accounts, tx)).toEqual({ a: 9500, b: 3000 });
    expect(
      balances(accounts, [
        ...tx,
        { id: '4', account_id: 'b', type: 'expense', status: 'confirmed', amount_minor: 1000 },
      ]),
    ).toEqual({ a: 9500, b: 2000 });
  });
  it('rejects a transfer into the same account', () => {
    const id = '11111111-1111-4111-8111-111111111111';
    expect(
      schemas.transactions.safeParse({
        type: 'transfer',
        description: 'transfer',
        amount_minor: 100,
        account_id: id,
        destination_account_id: id,
        occurred_on: '2026-01-01',
        status: 'confirmed',
      }).success,
    ).toBe(false);
  });
  it('neutralizes spreadsheet formulas in CSV fields', () =>
    expect(csv([{ id: '1', description: '=HYPERLINK("evil")' }])).toContain("'=HYPERLINK"));
});
import { reminderDue } from '../src/lib/reminders';
describe('Timezone-aware reminders', () => {
  it('respects lead time and date boundaries', () => {
    expect(
      reminderDue('2026-11-04', '19:00', 'America/Sao_Paulo', 30, new Date('2026-11-04T21:29:00Z')),
    ).toBe(false);
    expect(
      reminderDue('2026-11-04', '19:00', 'America/Sao_Paulo', 30, new Date('2026-11-04T21:30:00Z')),
    ).toBe(true);
  });
  it('keeps wall-clock time across daylight saving changes', () => {
    expect(
      reminderDue('2026-03-07', '09:00', 'America/New_York', 0, new Date('2026-03-07T13:59:00Z')),
    ).toBe(false);
    expect(
      reminderDue('2026-03-09', '09:00', 'America/New_York', 0, new Date('2026-03-09T13:00:00Z')),
    ).toBe(true);
  });
});
import { matchesMime } from '../src/lib/files';
describe('File validation', () => {
  it('rejects an HTML payload disguised as an image and accepts a PNG signature', () => {
    expect(matchesMime(new TextEncoder().encode('<script>evil()</script>'), 'image/png')).toBe(
      false,
    );
    expect(matchesMime(new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]), 'image/png')).toBe(true);
  });
});
