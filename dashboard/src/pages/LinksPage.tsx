import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { api, errorMessage } from '../api/client';
import type { ApiLink } from '../api/types';
import { CreateLinkForm } from '../components/CreateLinkForm';
import { Modal } from '../components/Modal';
import { Button, CopyButton, EmptyState, ErrorBanner, Spinner, inputClass } from '../components/ui';
import { displayUrl, formatDate, formatNumber } from '../lib/format';
import { useDebounced } from '../lib/useApi';

function SlugLink({ link }: { link: ApiLink }) {
  return (
    <Link
      to={`/links/${encodeURIComponent(link.slug)}`}
      className="font-mono font-medium text-indigo-600 hover:underline dark:text-indigo-400"
    >
      {link.slug}
    </Link>
  );
}

function LinksTable({ links }: { links: ApiLink[] }) {
  return (
    <div className="hidden overflow-x-auto rounded-lg border border-slate-200 bg-white md:block dark:border-slate-800 dark:bg-slate-900">
      <table className="w-full text-left text-sm">
        <thead className="border-b border-slate-200 text-xs tracking-wide text-slate-500 uppercase dark:border-slate-800 dark:text-slate-400">
          <tr>
            <th className="px-3 py-2 font-medium">Short link</th>
            <th className="px-3 py-2 font-medium">Destination</th>
            <th className="px-3 py-2 text-right font-medium">Visits</th>
            <th className="px-3 py-2 font-medium">Created</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
          {links.map((link) => (
            <tr key={link.slug} className="align-top hover:bg-slate-50 dark:hover:bg-slate-800/50">
              <td className="px-3 py-2.5">
                <div className="flex items-center gap-2">
                  <SlugLink link={link} />
                  <CopyButton text={link.shortUrl} />
                </div>
                <div className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{displayUrl(link.shortUrl)}</div>
              </td>
              <td className="max-w-md px-3 py-2.5">
                {link.title && <div className="truncate font-medium">{link.title}</div>}
                <a
                  href={link.url}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="block truncate text-slate-500 hover:underline dark:text-slate-400"
                  title={link.url}
                >
                  {displayUrl(link.url)}
                </a>
              </td>
              <td className="px-3 py-2.5 text-right tabular-nums">{formatNumber(link.visitCount)}</td>
              <td className="px-3 py-2.5 whitespace-nowrap">
                <div>{formatDate(link.createdAt)}</div>
                {link.createdBy && (
                  <div className="max-w-44 truncate text-xs text-slate-500 dark:text-slate-400" title={link.createdBy}>
                    {link.createdBy}
                  </div>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function LinkCards({ links }: { links: ApiLink[] }) {
  return (
    <ul className="space-y-2 md:hidden">
      {links.map((link) => (
        <li key={link.slug} className="rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between gap-2">
            <SlugLink link={link} />
            <CopyButton text={link.shortUrl} />
          </div>
          {link.title && <div className="mt-1 truncate font-medium">{link.title}</div>}
          <div className="truncate text-sm text-slate-500 dark:text-slate-400" title={link.url}>
            {displayUrl(link.url)}
          </div>
          <div className="mt-2 flex flex-wrap gap-x-3 text-xs text-slate-500 dark:text-slate-400">
            <span>{formatNumber(link.visitCount)} visits</span>
            <span>{formatDate(link.createdAt)}</span>
            {link.createdBy && <span className="truncate">{link.createdBy}</span>}
          </div>
        </li>
      ))}
    </ul>
  );
}

export function LinksPage() {
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounced(search.trim(), 250);
  const [links, setLinks] = useState<ApiLink[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState<ApiLink | null>(null);
  const requestId = useRef(0);

  const loadFirstPage = useCallback(async (searchTerm: string) => {
    const id = ++requestId.current;
    setLoading(true);
    setError(null);
    try {
      const page = await api.listLinks({ search: searchTerm || undefined });
      if (id !== requestId.current) return;
      setLinks(page.items);
      setNextCursor(page.nextCursor);
    } catch (err) {
      if (id === requestId.current) setError(errorMessage(err));
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadFirstPage(debouncedSearch);
  }, [debouncedSearch, loadFirstPage]);

  const loadMore = async () => {
    if (!nextCursor) return;
    const id = requestId.current;
    setLoadingMore(true);
    try {
      const page = await api.listLinks({ search: debouncedSearch || undefined, cursor: nextCursor });
      if (id !== requestId.current) return;
      setLinks((current) => [...current, ...page.items]);
      setNextCursor(page.nextCursor);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoadingMore(false);
    }
  };

  const closeCreate = useCallback(() => setCreating(false), []);

  const onCreated = (link: ApiLink) => {
    setCreating(false);
    setCreated(link);
    setSearch('');
    if (debouncedSearch) void loadFirstPage('');
    else setLinks((current) => [link, ...current.filter((l) => l.slug !== link.slug)]);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="mr-auto text-2xl font-semibold">Links</h1>
        <Button variant="primary" onClick={() => setCreating(true)}>
          + New link
        </Button>
      </div>

      {created && (
        <div
          role="status"
          className="flex flex-wrap items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-100"
        >
          <span>
            Created <span className="font-mono font-medium">{displayUrl(created.shortUrl)}</span>
          </span>
          <CopyButton text={created.shortUrl} />
          <button
            type="button"
            className="ml-auto text-emerald-700 hover:underline dark:text-emerald-300"
            onClick={() => setCreated(null)}
          >
            Dismiss
          </button>
        </div>
      )}

      <input
        type="search"
        placeholder="Search by slug, URL, or title…"
        aria-label="Search links"
        className={inputClass}
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      {error && <ErrorBanner message={error} onRetry={() => void loadFirstPage(debouncedSearch)} />}

      {loading ? (
        <Spinner />
      ) : links.length === 0 && !error ? (
        debouncedSearch ? (
          <EmptyState title="No matching links">Nothing matches “{debouncedSearch}”.</EmptyState>
        ) : (
          <EmptyState title="No links yet">
            <Button variant="primary" className="mt-3" onClick={() => setCreating(true)}>
              Create your first link
            </Button>
          </EmptyState>
        )
      ) : (
        <>
          <LinksTable links={links} />
          <LinkCards links={links} />
          {nextCursor && (
            <div className="flex justify-center">
              <Button onClick={loadMore} disabled={loadingMore}>
                {loadingMore ? 'Loading…' : 'Load more'}
              </Button>
            </div>
          )}
        </>
      )}

      {creating && (
        <Modal title="New link" onClose={closeCreate}>
          <CreateLinkForm onCreated={onCreated} onCancel={closeCreate} />
        </Modal>
      )}
    </div>
  );
}
