import { useCallback, useState, type FormEvent, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { api, ApiError, errorMessage } from '../api/client';
import type { ApiLink, RangeName, Visit } from '../api/types';
import { Modal } from '../components/Modal';
import { QrCode } from '../components/QrCode';
import { RoutingSection } from '../components/RoutingSection';
import {
  ArrowLeftIcon,
  BotIcon,
  DesktopIcon,
  DeviceOtherIcon,
  EditIcon,
  ExternalIcon,
  MobileIcon,
  SearchIcon,
  TabletIcon,
  TrashIcon,
} from '../components/icons';
import { BotsSwitch, HeroStat, RangePicker, StatTile, TopList, VisitsChart, busiestDay, rangePhrase, shortDay } from '../components/stats';
import { useToast } from '../components/toast';
import { Button, Card, CardTitle, CopyTextButton, EmptyState, ErrorBanner, Field, LinkTile, Skeleton, inputClass } from '../components/ui';
import { fillDays } from '../lib/days';
import { countryName, displayUrl, formatDate, formatDateTime, formatNumber, formatRelative } from '../lib/format';
import { useApi } from '../lib/useApi';

const RECENT_PREVIEW = 10;

function DeviceIcon({ device }: { device: string | null }) {
  if (device === 'mobile') return <MobileIcon />;
  if (device === 'tablet') return <TabletIcon />;
  if (device === 'desktop') return <DesktopIcon />;
  return <DeviceOtherIcon />;
}

function EditForm({ link, onSaved, onCancel }: { link: ApiLink; onSaved: (link: ApiLink) => void; onCancel: () => void }) {
  const [url, setUrl] = useState(link.url);
  const [title, setTitle] = useState(link.title ?? '');
  const [saving, setSaving] = useState(false);
  const [urlError, setUrlError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setUrlError(null);
    setFormError(null);
    try {
      onSaved(await api.updateLink(link.slug, { url: url.trim(), title: title.trim() || null }));
    } catch (err) {
      if (err instanceof ApiError && err.code === 'INVALID_URL') setUrlError(err.message);
      else setFormError(errorMessage(err));
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-5" noValidate>
      {formError && <ErrorBanner message={formError} />}
      <Field label="Destination URL" htmlFor="edit-url" error={urlError}>
        <input
          id="edit-url"
          type="url"
          inputMode="url"
          className={inputClass}
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          aria-invalid={Boolean(urlError)}
        />
      </Field>
      <Field label="Title" htmlFor="edit-title">
        <input id="edit-title" type="text" maxLength={200} className={inputClass} value={title} onChange={(e) => setTitle(e.target.value)} />
      </Field>
      <p className="text-[13px] text-faint">The short link stays the same: {displayUrl(link.shortUrl)}</p>
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button variant="ghost" onClick={onCancel} disabled={saving}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" size="lg" disabled={saving || !url.trim()}>
          {saving ? 'Saving…' : 'Save changes'}
        </Button>
      </div>
    </form>
  );
}

function DeleteDialog({ link, onClose }: { link: ApiLink; onClose: () => void }) {
  const navigate = useNavigate();
  const toast = useToast();
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const confirm = async () => {
    setDeleting(true);
    setError(null);
    try {
      await api.deleteLink(link.slug);
      toast(`Deleted ${displayUrl(link.shortUrl)}`);
      navigate('/links', { replace: true });
    } catch (err) {
      setError(errorMessage(err));
      setDeleting(false);
    }
  };

  return (
    <Modal title="Delete this link?" onClose={onClose}>
      <div className="space-y-5">
        {error && <ErrorBanner message={error} />}
        <p className="text-muted">
          <span className="font-mono font-medium text-ink">{displayUrl(link.shortUrl)}</span> will stop working right away and its{' '}
          {formatNumber(link.visitCount)} recorded {link.visitCount === 1 ? 'visit is' : 'visits are'} deleted. This can’t be undone.
        </p>
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="ghost" onClick={onClose} disabled={deleting}>
            Keep link
          </Button>
          <Button
            variant="danger"
            size="lg"
            onClick={confirm}
            disabled={deleting}
            className="!bg-danger !text-white hover:opacity-90"
          >
            {deleting ? 'Deleting…' : 'Delete link'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function RecentVisits({ visits }: { visits: Visit[] }) {
  const [showAll, setShowAll] = useState(false);
  if (visits.length === 0) return <p className="text-sm text-faint">No visits yet.</p>;
  const shown = showAll ? visits : visits.slice(0, RECENT_PREVIEW);
  return (
    <>
      <ul className="divide-y divide-line">
        {shown.map((v, i) => (
          <li key={`${v.ts}-${i}`} className="flex items-center gap-3 py-3 text-sm">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-ground text-muted" title={v.device ?? 'Unknown device'}>
              <DeviceIcon device={v.device} />
            </span>
            <div className="min-w-0 flex-1">
              <div className="truncate font-medium">
                {[v.city, v.country ? countryName(v.country) : null].filter(Boolean).join(', ') || 'Unknown location'}
                {v.isBot && (
                  <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-apricot-soft px-2 py-0.5 align-middle text-xs font-semibold text-apricot">
                    <BotIcon size={12} /> Bot
                  </span>
                )}
              </div>
              <div className="truncate text-[13px] text-faint">
                {[v.browser, v.os].filter(Boolean).join(' on ') || 'Unknown browser'} · {v.referrerHost ?? 'Direct'}
              </div>
            </div>
            <time className="shrink-0 text-[13px] text-faint" dateTime={new Date(v.ts).toISOString()} title={formatDateTime(v.ts)}>
              {formatRelative(v.ts)}
            </time>
          </li>
        ))}
      </ul>
      {visits.length > RECENT_PREVIEW && (
        <div className="mt-3 flex justify-center">
          <Button size="sm" variant="ghost" onClick={() => setShowAll((s) => !s)}>
            {showAll ? 'Show fewer' : `Show all ${visits.length}`}
          </Button>
        </div>
      )}
    </>
  );
}

function LinkStatsSection({ slug }: { slug: string }) {
  const [range, setRange] = useState<RangeName>('30d');
  const [bots, setBots] = useState(false);
  const stats = useApi(() => api.linkStats(slug, range, bots), [slug, range, bots]);
  const visits = useApi(() => api.recentVisits(slug, bots), [slug, bots]);
  const data = stats.data;
  const days = data ? fillDays(data.perDay, data.range) : [];
  const peak = busiestDay(days);
  const topCountry = data?.countries.find((c) => c.key !== 'Unknown');
  const topReferrer = data?.referrers[0];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3 pt-2">
        <h2 className="mr-auto font-display text-2xl font-bold tracking-tight">Analytics</h2>
        <BotsSwitch bots={bots} onBots={setBots} />
        <RangePicker range={range} onRange={setRange} />
      </div>

      {stats.error && <ErrorBanner message={stats.error} onRetry={stats.reload} />}
      {stats.loading && !data ? (
        <div className="grid gap-5 md:grid-cols-3" aria-hidden="true">
          <Skeleton className="h-36 rounded-[22px]" />
          <Skeleton className="h-36 rounded-[22px]" />
          <Skeleton className="h-36 rounded-[22px]" />
        </div>
      ) : (
        data && (
          <div className={`space-y-5 transition-opacity ${stats.loading ? 'opacity-60' : ''}`}>
            <div className="grid grid-cols-2 gap-4 sm:gap-5 md:grid-cols-[1.1fr_1fr_1fr]">
              <HeroStat
                className="col-span-2 md:col-span-1"
                label={`Visits ${rangePhrase(range)}`}
                value={data.total}
                footer={peak ? `Busiest day: ${shortDay(peak.day)} · ${formatNumber(peak.visits)}` : 'No visits yet'}
              />
              <StatTile
                label="Top country"
                value={topCountry ? countryName(topCountry.key) : '—'}
                sub={topCountry ? `${formatNumber(topCountry.visits)} visits` : 'No location data yet'}
              />
              <StatTile
                label="Top referrer"
                value={topReferrer?.key ?? '—'}
                sub={topReferrer ? `${formatNumber(topReferrer.visits)} visits` : 'No visits yet'}
              />
            </div>
            <VisitsChart days={days} />
            <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
              <TopList title="Countries" items={data.countries} renderKey={countryName} />
              <TopList title="Referrers" items={data.referrers} />
              <TopList
                title="Devices"
                items={data.devices}
                renderKey={(key) => (
                  <span className="inline-flex items-center gap-2 capitalize">
                    <DeviceIcon device={key} /> {key}
                  </span>
                )}
              />
              <TopList title="Browsers" items={data.browsers} />
              <TopList title="Operating systems" items={data.os} />
              <Card>
                <CardTitle>Recent visits</CardTitle>
                {visits.error && <ErrorBanner message={visits.error} onRetry={visits.reload} />}
                {visits.loading && !visits.data ? (
                  <div className="space-y-3">
                    <Skeleton className="h-10" />
                    <Skeleton className="h-10" />
                    <Skeleton className="h-10" />
                  </div>
                ) : (
                  visits.data && <RecentVisits visits={visits.data.items} />
                )}
              </Card>
            </div>
          </div>
        )
      )}
    </div>
  );
}

function BackLink() {
  return (
    <Link to="/links" className="inline-flex items-center gap-2 text-sm font-semibold text-muted hover:text-ink">
      <ArrowLeftIcon /> All links
    </Link>
  );
}

function Meta({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs font-medium tracking-wide text-faint uppercase">{label}</dt>
      <dd className="mt-0.5 truncate text-sm">{children}</dd>
    </div>
  );
}

export function LinkDetailPage() {
  const { slug = '' } = useParams();
  const link = useApi(() => api.getLink(slug), [slug]);
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const closeDelete = useCallback(() => setDeleting(false), []);
  const closeEdit = useCallback(() => setEditing(false), []);

  if (link.loading && !link.data) {
    return (
      <div className="space-y-6" aria-hidden="true">
        <Skeleton className="h-5 w-24" />
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_280px]">
          <Skeleton className="h-64 rounded-[22px]" />
          <Skeleton className="h-64 rounded-[22px]" />
        </div>
      </div>
    );
  }
  if (link.error || !link.data) {
    return (
      <div className="space-y-6">
        <BackLink />
        {link.errorStatus === 404 ? (
          <EmptyState title="Link not found" icon={<SearchIcon size={24} />}>
            It may have been deleted, or the address has a typo.
          </EmptyState>
        ) : (
          <ErrorBanner message={link.error ?? 'Could not load this link.'} onRetry={link.reload} />
        )}
      </div>
    );
  }

  const data = link.data;

  return (
    <div className="space-y-6">
      <BackLink />

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_280px]">
        <Card className="flex min-w-0 flex-col gap-5">
          <div className="flex items-start gap-4">
            <LinkTile url={data.url} size="lg" />
            <div className="min-w-0 flex-1">
              <h1 className="font-mono text-xl font-medium break-all text-accent-ink sm:text-[28px]">{displayUrl(data.shortUrl)}</h1>
              <p className={`mt-1 text-lg font-semibold ${data.title ? '' : 'font-medium text-faint'}`}>{data.title ?? 'No title'}</p>
            </div>
          </div>

          <a
            href={data.url}
            target="_blank"
            rel="noreferrer noopener"
            className="flex items-center gap-2.5 rounded-2xl bg-ground px-4 py-3 text-sm break-all text-muted hover:text-ink"
          >
            <ExternalIcon className="shrink-0" />
            {data.url}
          </a>

          <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            <Meta label="Total visits">
              <span className="font-semibold tabular-nums">{formatNumber(data.visitCount)}</span>
            </Meta>
            <Meta label="Created">
              <span title={formatDateTime(data.createdAt)}>{formatDate(data.createdAt)}</span>
              {data.createdBy && <span className="block truncate text-faint">{data.createdBy}</span>}
            </Meta>
            {data.updatedAt !== data.createdAt && (
              <Meta label="Last edited">
                <span title={formatDateTime(data.updatedAt)}>{formatDate(data.updatedAt)}</span>
                {data.updatedBy && <span className="block truncate text-faint">{data.updatedBy}</span>}
              </Meta>
            )}
          </dl>

          <div className="mt-auto flex flex-wrap gap-2">
            <CopyTextButton text={data.shortUrl} />
            <Button size="sm" onClick={() => setEditing(true)}>
              <EditIcon /> Edit
            </Button>
            <Button size="sm" variant="danger" onClick={() => setDeleting(true)} className="sm:ml-auto">
              <TrashIcon /> Delete
            </Button>
          </div>
        </Card>
        <QrCode url={data.shortUrl} name={`hop-${data.slug}`} />
      </div>

      <RoutingSection link={data} onChange={link.setData} />

      <LinkStatsSection slug={data.slug} />

      {editing && (
        <Modal title="Edit link" onClose={closeEdit}>
          <EditForm
            link={data}
            onCancel={closeEdit}
            onSaved={(updated) => {
              link.setData(updated);
              setEditing(false);
              toast('Changes saved');
            }}
          />
        </Modal>
      )}
      {deleting && <DeleteDialog link={data} onClose={closeDelete} />}
    </div>
  );
}
