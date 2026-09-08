import type { ApiLink, LinkPage, LinkStats, Overview, RangeName, Visit } from './types';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

const SESSION_EXPIRED = 'Your session may have expired. Reload the page to sign in again.';

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      ...init,
      credentials: 'same-origin',
      headers: init.body ? { 'Content-Type': 'application/json', ...init.headers } : init.headers,
    });
  } catch {
    // An expired Access session redirects to a cross-origin login page, which fetch reports as a network error.
    throw new ApiError(0, 'NETWORK', `Network error. ${SESSION_EXPIRED}`);
  }

  if (res.status === 204) return undefined as T;

  const isJson = res.headers.get('Content-Type')?.includes('application/json') ?? false;
  if (!isJson) throw new ApiError(res.status, 'UNAUTHORIZED', SESSION_EXPIRED);

  const body: unknown = await res.json();
  if (!res.ok) {
    const error = (body as { error?: { code?: string; message?: string } }).error;
    throw new ApiError(res.status, error?.code ?? 'INTERNAL', error?.message ?? `Request failed (${res.status}).`);
  }
  return body as T;
}

function query(params: Record<string, string | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) if (value) search.set(key, value);
  const text = search.toString();
  return text ? `?${text}` : '';
}

const slugPath = (slug: string) => `/links/${encodeURIComponent(slug)}`;

export const api = {
  me: () => request<{ email: string }>('/me'),

  listLinks: (params: { search?: string; cursor?: string }) => request<LinkPage>(`/links${query(params)}`),

  createLink: (input: { url: string; slug?: string; title?: string }) =>
    request<ApiLink>('/links', { method: 'POST', body: JSON.stringify(input) }),

  getLink: (slug: string) => request<ApiLink>(slugPath(slug)),

  updateLink: (slug: string, patch: { url?: string; title?: string | null }) =>
    request<ApiLink>(slugPath(slug), { method: 'PATCH', body: JSON.stringify(patch) }),

  deleteLink: (slug: string) => request<void>(slugPath(slug), { method: 'DELETE' }),

  linkStats: (slug: string, range: RangeName, bots: boolean) =>
    request<LinkStats>(`${slugPath(slug)}/stats${query({ range, bots: bots ? '1' : undefined })}`),

  recentVisits: (slug: string, bots: boolean) =>
    request<{ items: Visit[] }>(`${slugPath(slug)}/visits${query({ limit: '50', bots: bots ? '1' : undefined })}`),

  overview: (range: RangeName, bots: boolean) =>
    request<Overview>(`/stats/overview${query({ range, bots: bots ? '1' : undefined })}`),
};

export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : 'Something went wrong.';
}
