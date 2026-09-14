import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { api, errorMessage } from '../api/client';
import type { ApiLink } from '../api/types';
import { CreateLinkForm } from '../components/CreateLinkForm';
import { Modal } from '../components/Modal';
import { PlusIcon, SearchIcon } from '../components/icons';
import { useToast } from '../components/toast';
import { Button, CopyButton, EmptyState, ErrorBanner, LinkTile, Skeleton } from '../components/ui';
import { displayUrl, formatNumber, formatShortDate } from '../lib/format';
import { useDebounced } from '../lib/useApi';

const TITLE_FETCH_GRACE_MS = 60_000;

function LinkCard({ link }: { link: ApiLink }) {
  const pendingTitle = !link.title && Date.now() - link.createdAt < TITLE_FETCH_GRACE_MS;
  return (
    <article className="group relative flex min-w-0 items-center gap-3.5 rounded-[18px] bg-surface p-4 shadow-soft transition-shadow hover:shadow-md sm:gap-4 sm:px-5">
      <LinkTile url={link.url} />
      <div className="min-w-0 flex-1">
        <Link
          to={`/links/${encodeURIComponent(link.slug)}`}
          className="block truncate font-mono text-[15px] font-medium text-accent-ink after:absolute after:inset-0 after:rounded-[18px] after:content-['']"
        >
          <span className="sm:hidden">/{link.slug}</span>
          <span className="hidden sm:inline">{displayUrl(link.shortUrl)}</span>
        </Link>
        <p className={`truncate font-semibold ${link.title ? '' : 'font-medium text-faint'}`}>
          {link.title ?? (pendingTitle ? 'Fetching title…' : 'No title')}
        </p>
        <p className="truncate text-[13px] text-faint">
          <span title={link.url}>{displayUrl(link.url)}</span> · {formatShortDate(link.createdAt)}
          {link.createdBy && (
            <span className="hidden sm:inline" title={`Created by ${link.createdBy}`}>
              {' '}
              · {link.createdBy}
            </span>
          )}
        </p>
      </div>
      <div className="flex shrink-0 flex-col items-end">
        <span className="font-display text-[22px] leading-tight font-bold tabular-nums">{formatNumber(link.visitCount)}</span>
        <span className="text-xs text-faint">{link.visitCount === 1 ? 'visit' : 'visits'}</span>
      </div>
      <CopyButton text={link.shortUrl} className="relative z-10" />
    </article>
  );
}

function LinkCardsSkeleton() {
  return (
    <div className="grid gap-3.5 lg:grid-cols-2" aria-hidden="true">
      {Array.from({ length: 6 }, (_, i) => (
        <div key={i} className="flex items-center gap-4 rounded-[18px] bg-surface p-4 shadow-soft">
          <Skeleton className="h-11 w-11 rounded-[14px]" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-2/5" />
            <Skeleton className="h-4 w-3/5" />
            <Skeleton className="h-3 w-4/5" />
          </div>
          <Skeleton className="h-8 w-10" />
        </div>
      ))}
    </div>
  );
}

export function LinksPage() {
  const toast = useToast();
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounced(search.trim(), 250);
  const [links, setLinks] = useState<ApiLink[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const requestId = useRef(0);
  const searchInput = useRef<HTMLInputElement>(null);

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

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (e.key === '/' && !['INPUT', 'TEXTAREA'].includes(target.tagName) && !creating) {
        e.preventDefault();
        searchInput.current?.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [creating]);

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
      toast(errorMessage(err), 'error');
    } finally {
      setLoadingMore(false);
    }
  };

  const closeCreate = useCallback(() => setCreating(false), []);

  const onCreated = (link: ApiLink) => {
    setCreating(false);
    toast(`Created ${displayUrl(link.shortUrl)}`);
    setSearch('');
    if (debouncedSearch) void loadFirstPage('');
    else setLinks((current) => [link, ...current.filter((l) => l.slug !== link.slug)]);
  };

  const shortHost = links[0] ? new URL(links[0].shortUrl).host : window.location.host;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3 sm:gap-4">
        <h1 className="font-display text-[32px] leading-tight font-bold tracking-tight">Your links</h1>
        {!loading && !debouncedSearch && (
          <span className="rounded-full bg-accent-soft px-2.5 py-0.5 text-[13px] font-semibold text-accent-ink tabular-nums">
            {links.length}
            {nextCursor ? '+' : ''}
          </span>
        )}
        <Button variant="primary" size="lg" className="ml-auto" onClick={() => setCreating(true)}>
          <PlusIcon /> Shorten a link
        </Button>
      </div>

      <label className="flex h-12 items-center gap-3 rounded-full bg-surface px-5 text-faint shadow-soft focus-within:ring-2 focus-within:ring-accent">
        <SearchIcon />
        <span className="sr-only">Search links</span>
        <input
          ref={searchInput}
          id="link-search"
          type="search"
          placeholder="Find a link by slug, URL or title"
          className="h-full min-w-0 flex-1 bg-transparent text-[15px] text-ink placeholder:text-faint focus:outline-none"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <kbd className="hidden rounded-md bg-sunken px-1.5 py-0.5 font-mono text-xs text-muted sm:block">/</kbd>
      </label>

      {error && <ErrorBanner message={error} onRetry={() => void loadFirstPage(debouncedSearch)} />}

      {loading ? (
        <LinkCardsSkeleton />
      ) : links.length === 0 && !error ? (
        debouncedSearch ? (
          <EmptyState title="No matching links" icon={<SearchIcon size={24} />}>
            Nothing matches “{debouncedSearch}”. Try part of the slug, the destination, or the title.
          </EmptyState>
        ) : (
          <EmptyState title="No links yet" icon={<PlusIcon size={24} />}>
            <p>Shorten your first link and share it anywhere.</p>
            <Button variant="primary" className="mt-4" onClick={() => setCreating(true)}>
              <PlusIcon /> Shorten a link
            </Button>
          </EmptyState>
        )
      ) : (
        <>
          <div className="grid gap-3.5 lg:grid-cols-2">
            {links.map((link) => (
              <LinkCard key={link.slug} link={link} />
            ))}
          </div>
          {nextCursor && (
            <div className="flex justify-center pt-2">
              <Button onClick={loadMore} disabled={loadingMore}>
                {loadingMore ? 'Loading…' : 'Show more links'}
              </Button>
            </div>
          )}
        </>
      )}

      {creating && (
        <Modal title="Shorten a link" onClose={closeCreate}>
          <CreateLinkForm shortHost={shortHost} onCreated={onCreated} onCancel={closeCreate} />
        </Modal>
      )}
    </div>
  );
}
