import { useCallback, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { api, ApiError, errorMessage } from '../api/client';
import type { ApiLink, RangeName, Visit } from '../api/types';
import { Modal } from '../components/Modal';
import { QrCode } from '../components/QrCode';
import { StatsControls, StatTile, TopList, VisitsChart, rangeLabel } from '../components/stats';
import { Button, Card, CopyButton, EmptyState, ErrorBanner, Field, Spinner, inputClass } from '../components/ui';
import { fillDays } from '../lib/days';
import { displayUrl, formatDate, formatDateTime } from '../lib/format';
import { useApi } from '../lib/useApi';

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
    <form onSubmit={submit} className="space-y-3" noValidate>
      {formError && <ErrorBanner message={formError} />}
      <Field label="Destination URL" error={urlError}>
        <input
          type="url"
          inputMode="url"
          className={inputClass}
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          aria-invalid={Boolean(urlError)}
        />
      </Field>
      <Field label="Title">
        <input type="text" maxLength={200} className={inputClass} value={title} onChange={(e) => setTitle(e.target.value)} />
      </Field>
      <div className="flex justify-end gap-2">
        <Button onClick={onCancel} disabled={saving}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" disabled={saving || !url.trim()}>
          {saving ? 'Saving…' : 'Save'}
        </Button>
      </div>
    </form>
  );
}

function DeleteDialog({ link, onClose }: { link: ApiLink; onClose: () => void }) {
  const navigate = useNavigate();
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const confirm = async () => {
    setDeleting(true);
    setError(null);
    try {
      await api.deleteLink(link.slug);
      navigate('/links', { replace: true });
    } catch (err) {
      setError(errorMessage(err));
      setDeleting(false);
    }
  };

  return (
    <Modal title="Delete link?" onClose={onClose}>
      <div className="space-y-4">
        {error && <ErrorBanner message={error} />}
        <p className="text-sm">
          <span className="font-mono font-medium">{link.slug}</span> will stop working immediately, and its visit
          history will be permanently deleted. This can’t be undone.
        </p>
        <div className="flex justify-end gap-2">
          <Button onClick={onClose} disabled={deleting}>
            Cancel
          </Button>
          <Button variant="danger" onClick={confirm} disabled={deleting}>
            {deleting ? 'Deleting…' : 'Delete link'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function RecentVisits({ visits }: { visits: Visit[] }) {
  if (visits.length === 0) return <EmptyState title="No visits yet" />;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead className="text-xs tracking-wide text-slate-500 uppercase dark:text-slate-400">
          <tr>
            <th className="py-2 pr-3 font-medium">Time</th>
            <th className="py-2 pr-3 font-medium">Location</th>
            <th className="py-2 pr-3 font-medium">Referrer</th>
            <th className="py-2 pr-3 font-medium">Device</th>
            <th className="py-2 font-medium">Browser / OS</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
          {visits.map((v, i) => (
            <tr key={`${v.ts}-${i}`}>
              <td className="py-2 pr-3 whitespace-nowrap">{formatDateTime(v.ts)}</td>
              <td className="py-2 pr-3">{[v.city, v.country].filter(Boolean).join(', ') || '—'}</td>
              <td className="py-2 pr-3">{v.referrerHost ?? 'Direct'}</td>
              <td className="py-2 pr-3 whitespace-nowrap">
                {v.device ?? '—'}
                {v.isBot && (
                  <span className="ml-1.5 rounded bg-amber-100 px-1 text-xs text-amber-800 dark:bg-amber-950 dark:text-amber-200">
                    bot
                  </span>
                )}
              </td>
              <td className="py-2">{[v.browser, v.os].filter(Boolean).join(' · ') || '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function LinkStatsSection({ slug }: { slug: string }) {
  const [range, setRange] = useState<RangeName>('30d');
  const [bots, setBots] = useState(false);
  const stats = useApi(() => api.linkStats(slug, range, bots), [slug, range, bots]);
  const visits = useApi(() => api.recentVisits(slug, bots), [slug, bots]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">Analytics</h2>
        <StatsControls range={range} onRange={setRange} bots={bots} onBots={setBots} />
      </div>

      {stats.error && <ErrorBanner message={stats.error} onRetry={stats.reload} />}
      {stats.loading && !stats.data ? (
        <Spinner />
      ) : (
        stats.data && (
          <div className={`space-y-4 transition-opacity ${stats.loading ? 'opacity-60' : ''}`}>
            <div className="grid gap-4 sm:grid-cols-3">
              <StatTile label={`Visits (${rangeLabel(range)})`} value={stats.data.total} />
            </div>
            <VisitsChart days={fillDays(stats.data.perDay, stats.data.range)} />
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <TopList title="Countries" items={stats.data.countries} />
              <TopList title="Referrers" items={stats.data.referrers} />
              <TopList title="Devices" items={stats.data.devices} />
              <TopList title="Browsers" items={stats.data.browsers} />
              <TopList title="Operating systems" items={stats.data.os} />
            </div>
          </div>
        )
      )}

      <Card>
        <h2 className="mb-2 text-sm font-medium">Recent visits</h2>
        {visits.error && <ErrorBanner message={visits.error} onRetry={visits.reload} />}
        {visits.loading && !visits.data ? <Spinner /> : visits.data && <RecentVisits visits={visits.data.items} />}
      </Card>
    </div>
  );
}

export function LinkDetailPage() {
  const { slug = '' } = useParams();
  const link = useApi(() => api.getLink(slug), [slug]);
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const closeDelete = useCallback(() => setDeleting(false), []);

  if (link.loading && !link.data) return <Spinner />;
  if (link.error || !link.data) {
    return (
      <div className="space-y-4">
        <Link to="/links" className="text-sm text-indigo-600 hover:underline dark:text-indigo-400">
          ← All links
        </Link>
        {link.errorStatus === 404 ? (
          <EmptyState title="Link not found">It may have been deleted.</EmptyState>
        ) : (
          <ErrorBanner message={link.error ?? 'Link not found.'} onRetry={link.reload} />
        )}
      </div>
    );
  }

  const data = link.data;

  return (
    <div className="space-y-6">
      <Link to="/links" className="text-sm text-indigo-600 hover:underline dark:text-indigo-400">
        ← All links
      </Link>

      <div className="grid gap-4 lg:grid-cols-[1fr_auto]">
        <Card className="min-w-0 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-mono text-2xl font-semibold break-all">{data.slug}</h1>
            <CopyButton text={data.shortUrl} label="Copy short URL" />
          </div>
          <div className="text-sm text-slate-500 dark:text-slate-400">{displayUrl(data.shortUrl)}</div>

          {editing ? (
            <EditForm
              link={data}
              onCancel={() => setEditing(false)}
              onSaved={(updated) => {
                link.setData(updated);
                setEditing(false);
              }}
            />
          ) : (
            <>
              {data.title && <p className="font-medium">{data.title}</p>}
              <a
                href={data.url}
                target="_blank"
                rel="noreferrer noopener"
                className="block text-sm break-all text-indigo-600 hover:underline dark:text-indigo-400"
              >
                {data.url}
              </a>
              <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm text-slate-500 dark:text-slate-400">
                <dt>Created</dt>
                <dd>
                  {formatDate(data.createdAt)}
                  {data.createdBy && ` by ${data.createdBy}`}
                </dd>
                {data.updatedAt !== data.createdAt && (
                  <>
                    <dt>Updated</dt>
                    <dd>
                      {formatDate(data.updatedAt)}
                      {data.updatedBy && ` by ${data.updatedBy}`}
                    </dd>
                  </>
                )}
              </dl>
              <div className="flex gap-2 pt-1">
                <Button onClick={() => setEditing(true)}>Edit</Button>
                <Button variant="danger" onClick={() => setDeleting(true)}>
                  Delete
                </Button>
              </div>
            </>
          )}
        </Card>
        <QrCode url={data.shortUrl} name={`hop-${data.slug}`} />
      </div>

      <LinkStatsSection slug={data.slug} />

      {deleting && <DeleteDialog link={data} onClose={closeDelete} />}
    </div>
  );
}
