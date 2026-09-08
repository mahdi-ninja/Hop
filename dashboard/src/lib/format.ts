const numberFormat = new Intl.NumberFormat();
const dateFormat = new Intl.DateTimeFormat(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
const dateTimeFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });

export const formatNumber = (n: number) => numberFormat.format(n);
export const formatDate = (ts: number) => dateFormat.format(ts);
export const formatDateTime = (ts: number) => dateTimeFormat.format(ts);

export function displayUrl(url: string): string {
  return url.replace(/^https?:\/\//, '').replace(/\/$/, '');
}
