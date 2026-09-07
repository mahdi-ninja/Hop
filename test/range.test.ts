import { describe, expect, it } from 'vitest';
import { DAY_MS, parseBotsFlag, parseRangeName, resolveRange } from '../src/lib/range';

describe('parseRangeName / parseBotsFlag', () => {
  it('defaults and validates', () => {
    expect(parseRangeName(undefined)).toBe('30d');
    expect(parseRangeName('7d')).toBe('7d');
    expect(parseRangeName('all')).toBe('all');
    expect(parseRangeName('1y')).toBeNull();
    expect(parseRangeName('toString')).toBeNull();
    expect(parseBotsFlag(undefined)).toBe(false);
    expect(parseBotsFlag('1')).toBe(true);
    expect(parseBotsFlag('true')).toBeNull();
  });
});

describe('resolveRange', () => {
  const now = Date.UTC(2026, 8, 28, 15, 30);

  it('starts day ranges at UTC midnight so they cover exactly N days', () => {
    expect(resolveRange('7d', now, 0)).toEqual({ from: Date.UTC(2026, 8, 22), to: now });
    expect(resolveRange('30d', now, 0).from).toBe(Date.UTC(2026, 8, 28) - 29 * DAY_MS);
  });

  it('uses allFrom for "all"', () => {
    expect(resolveRange('all', now, 1234)).toEqual({ from: 1234, to: now });
  });
});
