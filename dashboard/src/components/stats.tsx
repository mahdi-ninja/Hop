import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { DayCount, KeyCount, RangeName } from '../api/types';
import { formatNumber } from '../lib/format';
import { Card } from './ui';

export const RANGE_OPTIONS: { value: RangeName; label: string }[] = [
  { value: '7d', label: '7 days' },
  { value: '30d', label: '30 days' },
  { value: '90d', label: '90 days' },
  { value: 'all', label: 'All time' },
];

export const rangeLabel = (range: RangeName) =>
  range === 'all' ? 'all time' : `last ${RANGE_OPTIONS.find((o) => o.value === range)?.label ?? range}`;

export function StatsControls({
  range,
  onRange,
  bots,
  onBots,
}: {
  range: RangeName;
  onRange: (range: RangeName) => void;
  bots: boolean;
  onBots: (bots: boolean) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <div role="radiogroup" aria-label="Date range" className="inline-flex rounded-md border border-slate-300 p-0.5 dark:border-slate-700">
        {RANGE_OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={range === option.value}
            onClick={() => onRange(option.value)}
            className={`rounded px-2.5 py-1 text-sm ${
              range === option.value
                ? 'bg-indigo-600 text-white'
                : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>
      <label className="inline-flex cursor-pointer items-center gap-2 text-sm">
        <input
          type="checkbox"
          className="h-4 w-4 rounded border-slate-300 accent-indigo-600"
          checked={bots}
          onChange={(e) => onBots(e.target.checked)}
        />
        Include bots
      </label>
    </div>
  );
}

export function StatTile({ label, value }: { label: string; value: number }) {
  return (
    <Card>
      <div className="text-sm text-slate-500 dark:text-slate-400">{label}</div>
      <div className="mt-1 text-3xl font-semibold tabular-nums">{formatNumber(value)}</div>
    </Card>
  );
}

const shortDay = (day: string) =>
  new Date(`${day}T00:00:00Z`).toLocaleDateString(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' });

export function VisitsChart({ days }: { days: DayCount[] }) {
  return (
    <Card>
      <h2 className="mb-3 text-sm font-medium">Visits per day (UTC)</h2>
      <div className="h-56 text-slate-500 dark:text-slate-400">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={days} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
            <CartesianGrid vertical={false} stroke="currentColor" strokeOpacity={0.15} />
            <XAxis
              dataKey="day"
              tickFormatter={shortDay}
              tick={{ fill: 'currentColor', fontSize: 12 }}
              tickLine={false}
              axisLine={false}
              minTickGap={24}
            />
            <YAxis allowDecimals={false} tick={{ fill: 'currentColor', fontSize: 12 }} tickLine={false} axisLine={false} />
            <Tooltip
              cursor={{ fill: 'currentColor', fillOpacity: 0.08 }}
              labelFormatter={(day) => shortDay(String(day))}
              formatter={(value) => [formatNumber(Number(value)), 'Visits']}
              contentStyle={{ borderRadius: 6, fontSize: 13, color: '#0f172a' }}
            />
            <Bar dataKey="visits" fill="#6366f1" radius={[3, 3, 0, 0]} maxBarSize={32} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}

export function TopList({ title, items }: { title: string; items: KeyCount[] }) {
  const max = Math.max(1, ...items.map((i) => i.visits));
  return (
    <Card>
      <h2 className="mb-3 text-sm font-medium">{title}</h2>
      {items.length === 0 ? (
        <p className="text-sm text-slate-500 dark:text-slate-400">No data</p>
      ) : (
        <ul className="space-y-1.5">
          {items.map((item) => (
            <li key={item.key} className="relative overflow-hidden rounded px-2 py-1 text-sm">
              <div
                className="absolute inset-y-0 left-0 rounded bg-indigo-100 dark:bg-indigo-950"
                style={{ width: `${(item.visits / max) * 100}%` }}
                aria-hidden="true"
              />
              <div className="relative flex justify-between gap-2">
                <span className="truncate" title={item.key}>
                  {item.key}
                </span>
                <span className="tabular-nums text-slate-600 dark:text-slate-300">{formatNumber(item.visits)}</span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
