import { fromZonedTime } from 'date-fns-tz';
export function reminderDue(
  date: string,
  time: string | null | undefined,
  timezone: string,
  advanceMinutes: number,
  now = new Date(),
): boolean {
  const when = fromZonedTime(`${date}T${time || '00:00:00'}`, timezone);
  return (
    Number.isFinite(when.getTime()) && when.getTime() - advanceMinutes * 60000 <= now.getTime()
  );
}
