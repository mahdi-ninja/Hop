import { describe, expect, it } from 'vitest';
import { fillDays } from '../dashboard/src/lib/days';

const DAY = 86_400_000;

describe('dashboard fillDays', () => {
  it('fills gaps with zeros across the range', () => {
    const from = Date.UTC(2026, 8, 1);
    const to = Date.UTC(2026, 8, 4, 13);
    expect(fillDays([{ day: '2026-09-02', visits: 5 }], { from, to })).toEqual([
      { day: '2026-09-01', visits: 0 },
      { day: '2026-09-02', visits: 5 },
      { day: '2026-09-03', visits: 0 },
      { day: '2026-09-04', visits: 0 },
    ]);
  });

  it('starts at the day containing a mid-day "from"', () => {
    const from = Date.UTC(2026, 8, 1, 18);
    expect(fillDays([], { from, to: from + DAY }).map((d) => d.day)).toEqual(['2026-09-01', '2026-09-02']);
  });

  it('starts all-time ranges (from = 0) at the first day with data', () => {
    const to = Date.UTC(2026, 8, 3, 1);
    expect(fillDays([{ day: '2026-09-02', visits: 1 }], { from: 0, to }).map((d) => d.day)).toEqual([
      '2026-09-02',
      '2026-09-03',
    ]);
    expect(fillDays([], { from: 0, to })).toEqual([{ day: '2026-09-03', visits: 0 }]);
  });
});
