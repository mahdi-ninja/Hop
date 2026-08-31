# Hop — API Contract

Base path: `/api`. All endpoints require Cloudflare Access (see ARCHITECTURE.md).
JSON in, JSON out. Timestamps are UTC milliseconds.

## Error shape
```json
{ "error": { "code": "SLUG_TAKEN", "message": "That slug is already in use." } }
```
| HTTP | code |
|---|---|
| 400 | `INVALID_URL`, `INVALID_SLUG`, `RESERVED_SLUG`, `INVALID_INPUT` |
| 401 | `UNAUTHORIZED` |
| 403 | `BAD_ORIGIN` |
| 404 | `NOT_FOUND` |
| 409 | `SLUG_TAKEN` |
| 500 | `INTERNAL` |

## Link object
```json
{
  "slug": "abc123x",
  "shortUrl": "https://go.example.com/abc123x",
  "url": "https://example.com/some/long/path",
  "title": "Example page",
  "visitCount": 42,
  "createdAt": 1790000000000,
  "createdBy": "alice@example.com",
  "updatedAt": 1790000000000,
  "updatedBy": "alice@example.com"
}
```

## Endpoints

### `GET /api/me`
→ `200 { "email": "alice@example.com" }`

### `GET /api/links?search=&cursor=&limit=`
- `search` optional, case-insensitive substring match on slug, url, title.
- `limit` default 50, max 100. Ordered by `createdAt` desc, then slug.
- `cursor` is opaque (encode `createdAt` + `slug` of the last item).

→ `200 { "items": [Link, ...], "nextCursor": "..." | null }`

### `POST /api/links`
Body: `{ "url": string, "slug"?: string, "title"?: string }`
→ `201 Link` · errors: `INVALID_URL`, `INVALID_SLUG`, `RESERVED_SLUG`, `SLUG_TAKEN`

### `GET /api/links/:slug`
→ `200 Link` · `404 NOT_FOUND`

### `PATCH /api/links/:slug`
Body: `{ "url"?: string, "title"?: string | null }` — at least one field.
→ `200 Link` · errors: `INVALID_URL`, `INVALID_INPUT`, `NOT_FOUND`

### `DELETE /api/links/:slug`
Deletes the link and all its visits. → `204` · `404 NOT_FOUND`

### `GET /api/links/:slug/stats?range=7d|30d|90d|all&bots=0|1`
Defaults: `range=30d`, `bots=0`.
```json
{
  "range": { "from": 1790000000000, "to": 1792592000000 },
  "total": 128,
  "perDay": [{ "day": "2026-09-01", "visits": 5 }],
  "countries": [{ "key": "AU", "visits": 60 }],
  "referrers": [{ "key": "Direct", "visits": 40 }],
  "devices":   [{ "key": "mobile", "visits": 70 }],
  "browsers":  [{ "key": "Chrome", "visits": 50 }],
  "os":        [{ "key": "iOS", "visits": 30 }]
}
```
For `range=all`, `from` is the link's `createdAt`. `perDay` only includes days with visits.

### `GET /api/links/:slug/visits?limit=50`
Most recent visits, newest first (respects `bots` param like stats).
→ `200 { "items": [{ "ts": 0, "country": "AU", "city": "Melbourne", "referrerHost": null, "device": "mobile", "browser": "Safari", "os": "iOS", "isBot": false }] }`

### `GET /api/stats/overview?range=7d|30d|90d|all&bots=0|1`
```json
{
  "range": { "from": 0, "to": 0 },
  "totalLinks": 57,
  "totalVisits": 1830,
  "perDay": [{ "day": "2026-09-01", "visits": 70 }],
  "topLinks": [{ "slug": "abc123x", "title": "Example page", "visits": 400 }]
}
```
