const numberFormat = new Intl.NumberFormat();
const dateFormat = new Intl.DateTimeFormat(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
const shortDateFormat = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' });
const dateTimeFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });
const relativeFormat = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });

let regionNames: Intl.DisplayNames | null = null;
try {
  regionNames = new Intl.DisplayNames(undefined, { type: 'region' });
} catch {
  regionNames = null;
}

export const formatNumber = (n: number) => numberFormat.format(n);
export const formatDate = (ts: number) => dateFormat.format(ts);
export const formatDateTime = (ts: number) => dateTimeFormat.format(ts);

export function formatShortDate(ts: number): string {
  return new Date(ts).getFullYear() === new Date().getFullYear() ? shortDateFormat.format(ts) : dateFormat.format(ts);
}

const RELATIVE_STEPS: [Intl.RelativeTimeFormatUnit, number][] = [
  ['minute', 60],
  ['hour', 60],
  ['day', 24],
  ['week', 7],
];

export function formatRelative(ts: number, now = Date.now()): string {
  let value = (ts - now) / 1000;
  if (Math.abs(value) < 45) return 'just now';
  value /= 60;
  for (const [unit, size] of RELATIVE_STEPS) {
    if (Math.abs(value) < size || unit === 'week') {
      if (unit === 'week' && Math.abs(value) >= 5) return formatDate(ts);
      return relativeFormat.format(Math.round(value), unit);
    }
    value /= size;
  }
  return formatDate(ts);
}

export function countryName(code: string): string {
  if (!/^[A-Z]{2}$/.test(code)) return code;
  return regionNames?.of(code) ?? code;
}

export function displayUrl(url: string): string {
  return url.replace(/^https?:\/\//, '').replace(/\/$/, '');
}
