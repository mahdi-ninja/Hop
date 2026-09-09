import type { DayCount, Range } from '../api/types';

const DAY_MS = 86_400_000;

const dayKey = (ts: number) => new Date(ts).toISOString().slice(0, 10);

/**
 * Fills in zero-visit UTC days between range.from and range.to. For all-time ranges
 * starting at the epoch, filling starts at the first day with data instead.
 */
export function fillDays(perDay: DayCount[], range: Range): DayCount[] {
  const counts = new Map(perDay.map((d) => [d.day, d.visits]));
  const firstDataDay = perDay[0] ? Date.parse(`${perDay[0].day}T00:00:00Z`) : range.to;
  const start = range.from === 0 ? firstDataDay : range.from;

  const days: DayCount[] = [];
  for (let ts = start - (start % DAY_MS); ts <= range.to; ts += DAY_MS) {
    const day = dayKey(ts);
    days.push({ day, visits: counts.get(day) ?? 0 });
  }
  return days;
}
