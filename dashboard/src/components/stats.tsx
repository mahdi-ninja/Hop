import type { ReactNode } from 'react';
import { Bar, BarChart, Cell, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { DayCount, KeyCount, RangeName } from '../api/types';
import { formatNumber } from '../lib/format';
import { Card, CardTitle, Segmented, Switch } from './ui';

export const RANGE_OPTIONS: { value: RangeName; label: string }[] = [
  { value: '7d', label: '7d' },
  { value: '30d', label: '30d' },
  { value: '90d', label: '90d' },
  { value: 'all', label: 'All' },
];

const RANGE_PHRASE: Record<RangeName, string> = {
  '7d': 'in the last 7 days',
  '30d': 'in the last 30 days',
  '90d': 'in the last 90 days',
  all: 'all time',
};

export const rangePhrase = (range: RangeName) => RANGE_PHRASE[range];

export function RangePicker({ range, onRange }: { range: RangeName; onRange: (range: RangeName) => void }) {
  return <Segmented label="Date range" value={range} options={RANGE_OPTIONS} onChange={onRange} />;
}

export function BotsSwitch({ bots, onBots }: { bots: boolean; onBots: (bots: boolean) => void }) {
  return <Switch checked={bots} onChange={onBots} label="Include bots" />;
}

export function busiestDay(days: DayCount[]): DayCount | null {
  return days.reduce<DayCount | null>((best, d) => (d.visits > 0 && (!best || d.visits > best.visits) ? d : best), null);
}

export const shortDay = (day: string) =>
  new Date(`${day}T00:00:00Z`).toLocaleDateString(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' });

export function HeroStat({
  label,
  value,
  footer,
  className = '',
}: {
  label: string;
  value: number;
  footer?: ReactNode;
  className?: string;
}) {
  return (
    <section className={`flex flex-col gap-1.5 rounded-[22px] bg-hero p-6 text-on-hero shadow-soft ${className}`}>
      <span className="font-medium text-on-hero-muted">{label}</span>
      <span className="font-display text-[56px] leading-none font-bold tracking-tight tabular-nums">{formatNumber(value)}</span>
      {footer && (
        <span className="mt-auto self-start rounded-full bg-white/12 px-3 py-1 text-[13px] font-medium">{footer}</span>
      )}
    </section>
  );
}

export function StatTile({ label, value, sub }: { label: string; value: ReactNode; sub?: ReactNode }) {
  return (
    <section className="flex min-w-0 flex-col gap-1 rounded-[22px] bg-surface p-5 shadow-soft">
      <span className="text-sm font-medium text-muted">{label}</span>
      <span className="truncate font-display text-2xl leading-tight sm:text-[28px] font-bold tracking-tight tabular-nums">{value}</span>
      {sub && <span className="truncate text-[13px] text-faint">{sub}</span>}
    </section>
  );
}

function ChartTooltip({ active, payload, label }: { active?: boolean; payload?: { value?: number }[]; label?: string }) {
  if (!active || !payload?.length || !label) return null;
  return (
    <div className="rounded-xl bg-hero px-3 py-2 text-sm text-on-hero shadow-lg">
      <div className="text-on-hero-muted">{shortDay(label)}</div>
      <div className="font-semibold tabular-nums">{formatNumber(Number(payload[0]?.value ?? 0))} visits</div>
    </div>
  );
}

export function VisitsChart({ days, action }: { days: DayCount[]; action?: ReactNode }) {
  const peak = busiestDay(days);
  return (
    <Card>
      <CardTitle action={action}>Visits per day</CardTitle>
      <div className="h-60 text-faint lg:h-72">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={days} margin={{ top: 4, right: 0, bottom: 0, left: -24 }} barCategoryGap="18%">
            <CartesianGrid vertical={false} stroke="var(--hop-line)" />
            <XAxis
              dataKey="day"
              tickFormatter={shortDay}
              tick={{ fill: 'currentColor', fontSize: 12 }}
              tickLine={false}
              axisLine={false}
              minTickGap={28}
            />
            <YAxis allowDecimals={false} tick={{ fill: 'currentColor', fontSize: 12 }} tickLine={false} axisLine={false} />
            <Tooltip cursor={{ fill: 'var(--hop-sunken)' }} content={<ChartTooltip />} />
            <Bar dataKey="visits" radius={[6, 6, 6, 6]} maxBarSize={36} minPointSize={2} isAnimationActive={false}>
              {days.map((d) => (
                <Cell key={d.day} fill={d.day === peak?.day ? 'var(--hop-apricot)' : 'var(--hop-accent-fill)'} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <p className="mt-3 text-xs text-faint">
        UTC days{peak ? ` · busiest: ${shortDay(peak.day)} with ${formatNumber(peak.visits)}` : ''}
      </p>
    </Card>
  );
}

export function TopList({
  title,
  items,
  renderKey = (key) => key,
}: {
  title: string;
  items: KeyCount[];
  renderKey?: (key: string) => ReactNode;
}) {
  const max = Math.max(1, ...items.map((i) => i.visits));
  const total = items.reduce((sum, i) => sum + i.visits, 0);
  return (
    <Card>
      <CardTitle>{title}</CardTitle>
      {items.length === 0 ? (
        <p className="text-sm text-faint">No visits in this range.</p>
      ) : (
        <ul className="space-y-3">
          {items.map((item) => (
            <li key={item.key}>
              <div className="mb-1.5 flex items-baseline justify-between gap-3 text-sm">
                <span className="min-w-0 truncate font-medium">{renderKey(item.key)}</span>
                <span className="shrink-0 tabular-nums">
                  <span className="font-semibold">{formatNumber(item.visits)}</span>
                  <span className="ml-1.5 text-xs text-faint">{Math.round((item.visits / total) * 100)}%</span>
                </span>
              </div>
              <div className="h-2 rounded-full bg-sunken">
                <div className="h-2 rounded-full bg-accent" style={{ width: `${(item.visits / max) * 100}%` }} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
