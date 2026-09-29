# Hop — API Contract

Base path: `/api`. All endpoints require sign-in: Cloudflare Access, or the Docker preset's auth
proxy (see ARCHITECTURE.md). When the proxy rejects a request it answers 401 itself, without
the JSON error body.
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
| 503 | `NOT_CONFIGURED` (Workers only: Access team domain / AUD not set for this deployment; Docker refuses to start instead) |

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
  "updatedBy": "alice@example.com",
  "rules": []
}
```
`rules` is the link's ordered routing rules (see below); `[]` when it has none.

## Routing rule object
```json
{
  "conditions": [
    { "field": "country", "op": "in", "values": ["AU", "NZ"] },
    { "field": "device", "op": "not_in", "values": ["desktop"] }
  ],
  "window": { "start": 1790000000000, "end": 1790600000000 },
  "destinations": [
    { "url": "https://example.com/au-a", "weight": 50 },
    { "url": "https://example.com/au-b", "weight": 50 }
  ]
}
```
- `field`: `continent` | `country` | `device` | `browser` | `os` | `language` | `visitor`
- `op`: `in` | `not_in`
- `window` is optional; `start` and `end` are each optional (UTC ms).
- Validation rules are in SPEC.md. Errors: `INVALID_URL` for a bad destination URL, otherwise
  `INVALID_INPUT`; the message says which rule (1-based) is wrong.

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

### `PUT /api/links/:slug/rules`
Body: `{ "rules": [Rule, ...] }` — replaces the whole ordered list (`[]` removes all rules).
Updates `updatedAt` / `updatedBy`.
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
  "topLinks": [{ "slug": "abc123x", "shortUrl": "https://go.example.com/abc123x", "title": "Example page", "visits": 400 }]
}
```
