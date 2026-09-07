import type { Range } from '../core/types';

export const DAY_MS = 24 * 60 * 60 * 1000;

const DAYS_BY_RANGE = { '7d': 7, '30d': 30, '90d': 90 } as const;

export type RangeName = keyof typeof DAYS_BY_RANGE | 'all';

export function parseRangeName(raw: string | undefined): RangeName | null {
  if (raw === undefined || raw === '') return '30d';
  return raw === 'all' || Object.hasOwn(DAYS_BY_RANGE, raw) ? (raw as RangeName) : null;
}

export function parseBotsFlag(raw: string | undefined): boolean | null {
  if (raw === undefined || raw === '' || raw === '0') return false;
  return raw === '1' ? true : null;
}

/**
 * Day ranges start at UTC midnight so "7d" is today plus the six previous whole days,
 * i.e. exactly seven buckets on the per-day chart. "all" starts at allFrom.
 */
export function resolveRange(name: RangeName, now: number, allFrom: number): Range {
  if (name === 'all') return { from: Math.min(allFrom, now), to: now };
  const startOfToday = now - (now % DAY_MS);
  return { from: startOfToday - (DAYS_BY_RANGE[name] - 1) * DAY_MS, to: now };
}
