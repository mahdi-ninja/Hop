import { useState } from 'react';
import { Link } from 'react-router';
import { api } from '../api/client';
import type { RangeName } from '../api/types';
import { PlusIcon } from '../components/icons';
import { BotsSwitch, HeroStat, RangePicker, StatTile, VisitsChart, busiestDay, rangePhrase, shortDay } from '../components/stats';
import { Card, CardTitle, CopyButton, EmptyState, ErrorBanner, Skeleton } from '../components/ui';
import { fillDays } from '../lib/days';
import { formatNumber } from '../lib/format';
import { useApi } from '../lib/useApi';

function OverviewSkeleton() {
  return (
    <div className="space-y-5" aria-hidden="true">
      <div className="grid gap-5 md:grid-cols-3">
        <Skeleton className="h-40 rounded-[22px]" />
        <Skeleton className="h-40 rounded-[22px]" />
        <Skeleton className="h-40 rounded-[22px]" />
      </div>
      <Skeleton className="h-80 rounded-[22px]" />
    </div>
  );
}

export function OverviewPage() {
  const [range, setRange] = useState<RangeName>('30d');
  const [bots, setBots] = useState(false);
  const overview = useApi(() => api.overview(range, bots), [range, bots]);
  const data = overview.data;
  const days = data ? fillDays(data.perDay, data.range) : [];
  const peak = busiestDay(days);
  const topMax = Math.max(1, ...(data?.topLinks.map((l) => l.visits) ?? []));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="mr-auto font-display text-[32px] leading-tight font-bold tracking-tight">Overview</h1>
        <BotsSwitch bots={bots} onBots={setBots} />
        <RangePicker range={range} onRange={setRange} />
      </div>

      {overview.error && <ErrorBanner message={overview.error} onRetry={overview.reload} />}
      {overview.loading && !data ? (
        <OverviewSkeleton />
      ) : (
        data &&
        (data.totalLinks === 0 ? (
          <EmptyState title="Nothing to show yet" icon={<PlusIcon size={24} />}>
            <p>Create a link and its visits will appear here.</p>
            <Link
              to="/links"
              className="mt-4 inline-flex h-10 items-center rounded-full bg-accent px-4 text-sm font-semibold text-on-accent hover:bg-accent-hover"
            >
              Go to links
            </Link>
          </EmptyState>
        ) : (
          <div className={`space-y-5 transition-opacity ${overview.loading ? 'opacity-60' : ''}`}>
            <div className="grid grid-cols-2 gap-4 sm:gap-5 md:grid-cols-[1.1fr_1fr_1fr]">
              <HeroStat
                className="col-span-2 md:col-span-1"
                label={`Visits ${rangePhrase(range)}`}
                value={data.totalVisits}
                footer={peak ? `Busiest day: ${shortDay(peak.day)} · ${formatNumber(peak.visits)}` : 'No visits yet'}
              />
              <StatTile label="Links" value={formatNumber(data.totalLinks)} sub="All time" />
              <StatTile
                label="Daily average"
                value={formatNumber(days.length ? Math.round(data.totalVisits / days.length) : 0)}
                sub={`Over ${days.length} ${days.length === 1 ? 'day' : 'days'}`}
              />
            </div>

            <div className="grid gap-5 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
              <VisitsChart days={days} />
              <Card>
                <CardTitle>Top links</CardTitle>
                {data.topLinks.length === 0 ? (
                  <p className="text-sm text-faint">No visits in this range.</p>
                ) : (
                  <ol className="space-y-4">
                    {data.topLinks.map((link) => (
                      <li key={link.slug} className="flex items-center gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-baseline justify-between gap-2">
                            <Link
                              to={`/links/${encodeURIComponent(link.slug)}`}
                              className="truncate font-mono font-medium text-accent-ink hover:underline"
                            >
                              /{link.slug}
                            </Link>
                            <span className="shrink-0 text-sm font-semibold tabular-nums">{formatNumber(link.visits)}</span>
                          </div>
                          {link.title && <div className="truncate text-[13px] text-faint">{link.title}</div>}
                          <div className="mt-1.5 h-2 rounded-full bg-sunken">
                            <div className="h-2 rounded-full bg-accent" style={{ width: `${(link.visits / topMax) * 100}%` }} />
                          </div>
                        </div>
                        <CopyButton text={link.shortUrl} />
                      </li>
                    ))}
                  </ol>
                )}
              </Card>
            </div>
          </div>
        ))
      )}
    </div>
  );
}
