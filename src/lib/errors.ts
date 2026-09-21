import type { Context } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';

const STATUS_BY_CODE = {
  INVALID_URL: 400,
  INVALID_SLUG: 400,
  RESERVED_SLUG: 400,
  INVALID_INPUT: 400,
  UNAUTHORIZED: 401,
  BAD_ORIGIN: 403,
  NOT_FOUND: 404,
  SLUG_TAKEN: 409,
  INTERNAL: 500,
  NOT_CONFIGURED: 503,
} as const satisfies Record<string, ContentfulStatusCode>;

export type ErrorCode = keyof typeof STATUS_BY_CODE;

export function apiError(c: Context, code: ErrorCode, message: string): Response {
  return c.json({ error: { code, message } }, STATUS_BY_CODE[code]);
}
