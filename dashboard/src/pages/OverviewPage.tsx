import { useState } from 'react';
import { Link } from 'react-router';
import { api } from '../api/client';
import type { RangeName } from '../api/types';
import { StatsControls, StatTile, VisitsChart, rangeLabel } from '../components/stats';
import { Card, EmptyState, ErrorBanner, Spinner } from '../components/ui';
import { fillDays } from '../lib/days';
import { formatNumber } from '../lib/format';
import { useApi } from '../lib/useApi';

export function OverviewPage() {
  const [range, setRange] = useState<RangeName>('30d');
  const [bots, setBots] = useState(false);
  const overview = useApi(() => api.overview(range, bots), [range, bots]);
  const data = overview.data;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Overview</h1>
        <StatsControls range={range} onRange={setRange} bots={bots} onBots={setBots} />
      </div>

      {overview.error && <ErrorBanner message={overview.error} onRetry={overview.reload} />}
      {overview.loading && !data ? (
        <Spinner />
      ) : (
        data && (
          <div className={`space-y-4 transition-opacity ${overview.loading ? 'opacity-60' : ''}`}>
            <div className="grid gap-4 sm:grid-cols-2">
              <StatTile label="Total links" value={data.totalLinks} />
              <StatTile label={`Visits (${rangeLabel(range)})`} value={data.totalVisits} />
            </div>
            {data.totalLinks === 0 ? (
              <EmptyState title="No links yet">
                <Link to="/links" className="text-indigo-600 hover:underline dark:text-indigo-400">
                  Create your first link
                </Link>
              </EmptyState>
            ) : (
              <>
                <VisitsChart days={fillDays(data.perDay, data.range)} />
                <Card>
                  <h2 className="mb-3 text-sm font-medium">Top links</h2>
                  {data.topLinks.length === 0 ? (
                    <p className="text-sm text-slate-500 dark:text-slate-400">No visits in this range.</p>
                  ) : (
                    <ol className="divide-y divide-slate-100 dark:divide-slate-800">
                      {data.topLinks.map((link) => (
                        <li key={link.slug} className="flex items-center justify-between gap-3 py-2 text-sm">
                          <div className="min-w-0">
                            <Link
                              to={`/links/${encodeURIComponent(link.slug)}`}
                              className="font-mono font-medium text-indigo-600 hover:underline dark:text-indigo-400"
                            >
                              {link.slug}
                            </Link>
                            {link.title && (
                              <div className="truncate text-slate-500 dark:text-slate-400">{link.title}</div>
                            )}
                          </div>
                          <span className="shrink-0 tabular-nums">{formatNumber(link.visits)} visits</span>
                        </li>
                      ))}
                    </ol>
                  )}
                </Card>
              </>
            )}
          </div>
        )
      )}
    </div>
  );
}
