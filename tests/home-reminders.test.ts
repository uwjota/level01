import { describe, it, expect } from 'vitest';
import { parseHeadlines } from '@/lib/news-feed';
import { buildReminders } from '@/lib/reminder-jobs';
import { allowedPushEndpoint, pushSubscriptionSchema } from '@/lib/push';
import type { Row } from '@/lib/domain';
const owner = '11111111-1111-4111-8111-111111111111';
const settings: Row = {
  id: owner,
  timezone: 'America/Sao_Paulo',
  notification_preferences: { tasks: true, finance: true, goals: true, advance_minutes: 30 },
};
const task: Row = {
  id: '22222222-2222-4222-8222-222222222222',
  title: 'Estudar',
  scheduled_on: '2026-11-05',
  scheduled_time: '00:10:00',
  status: 'pending',
  priority: 'medium',
  recurrence: null,
};
describe('Home feeds and background reminders', () => {
  it('extracts safe attributed RSS headlines and refuses unsafe links and entities', () => {
    const rss =
      '<rss><channel><item><title><![CDATA[Uma <b>notícia</b> &amp; contexto]]></title><link>https://example.com/news</link><pubDate>Wed, 04 Nov 2026 12:00:00 GMT</pubDate></item><item><title>Unsafe</title><link>javascript:alert(1)</link><pubDate>Wed, 04 Nov 2026 12:00:00 GMT</pubDate></item></channel></rss>';
    const rows = parseHeadlines(rss, 'Fonte');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      source: 'Fonte',
      url: 'https://example.com/news',
      title: 'Uma notícia & contexto',
    });
    expect(() =>
      parseHeadlines('<!DOCTYPE rss [<!ENTITY x SYSTEM "file:///secret">]><rss/>', 'Fonte'),
    ).toThrow();
  });
  it('honors advance time across midnight in the user timezone', () => {
    expect(
      buildReminders(owner, settings, [task], [], [], [], new Date('2026-11-05T02:39:00Z')),
    ).toHaveLength(0);
    const rows = buildReminders(
      owner,
      settings,
      [task],
      [],
      [],
      [],
      new Date('2026-11-05T02:40:00Z'),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].type).toBe('task');
    expect(rows[0].message).toContain('05/11');
    expect(
      buildReminders(owner, settings, [task], [], [], [], new Date('2026-11-05T02:41:00Z'))[0]
        .idempotency_key,
    ).toBe(rows[0].idempotency_key);
  });
  it('respects recurrence exceptions, preferences and the morning time for untimed reminders', () => {
    const recurring = {
      ...task,
      scheduled_on: '2026-11-04',
      scheduled_time: null,
      recurrence: { frequency: 'daily', interval: 1 },
    };
    const occurrence = {
      id: 'exception',
      task_id: task.id,
      occurrence_date: '2026-11-05',
      status: 'completed',
      override_data: {},
    };
    expect(
      buildReminders(
        owner,
        settings,
        [recurring],
        [occurrence],
        [],
        [],
        new Date('2026-11-05T12:01:00Z'),
      ),
    ).toHaveLength(0);
    expect(
      buildReminders(owner, settings, [recurring], [], [], [], new Date('2026-11-05T11:59:00Z')),
    ).toHaveLength(0);
    expect(
      buildReminders(owner, settings, [recurring], [], [], [], new Date('2026-11-05T12:00:00Z')),
    ).toHaveLength(1);
    expect(
      buildReminders(
        owner,
        { ...settings, notification_preferences: { tasks: false, finance: false, goals: false } },
        [recurring],
        [],
        [],
        [],
        new Date('2026-11-05T13:00:00Z'),
      ),
    ).toHaveLength(0);
  });
  it('truncates long reminder messages to database limits', () => {
    const rows = buildReminders(
      owner,
      settings,
      [{ ...task, title: 'x'.repeat(300) }],
      [],
      [],
      [],
      new Date('2026-11-05T03:00:00Z'),
    );
    expect(rows[0].message.length).toBeLessThanOrEqual(300);
  });
  it('accepts known push providers and rejects arbitrary, credentialed and local endpoints', () => {
    for (const url of [
      'http://fcm.googleapis.com/send',
      'https://localhost/push',
      'https://127.0.0.1/push',
      'https://fcm.googleapis.com.attacker.test/push',
      'https://user@fcm.googleapis.com/push',
      'https://fcm.googleapis.com:444/push',
    ])
      expect(allowedPushEndpoint(url)).toBe(false);
    expect(allowedPushEndpoint('https://web.push.apple.com/token')).toBe(true);
    expect(
      pushSubscriptionSchema.safeParse({
        endpoint: 'https://fcm.googleapis.com/wp/token',
        keys: { p256dh: 'a'.repeat(87), auth: 'b'.repeat(22) },
      }).success,
    ).toBe(true);
  });
});
