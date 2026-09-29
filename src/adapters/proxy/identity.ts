import { createHash, timingSafeEqual } from 'node:crypto';
import type { IdentityProvider } from '../../core/ports';
import type { Identity } from '../../core/types';

export const PROXY_SECRET_HEADER = 'X-Hop-Proxy-Secret';
export const PROXY_EMAIL_HEADER = 'X-Hop-Email';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+$/;
// A wrong secret usually means mismatched settings, but it can also be someone probing an
// exposed port, so it's logged at most once a minute rather than per request.
const WRONG_SECRET_LOG_INTERVAL_MS = 60_000;

const digest = (value: string) => createHash('sha256').update(value).digest();

/**
 * Trusts the email Caddy forwards after the auth proxy approved the request. The shared secret
 * is what makes the header trustworthy: without it, anyone who can reach Hop's port directly
 * could claim any email.
 */
export class TrustedHeaderIdentityProvider implements IdentityProvider {
  private readonly secret: Buffer;
  private lastWrongSecretLog = -Infinity;

  constructor(secret: string) {
    this.secret = digest(secret);
  }

  async identify(req: Request): Promise<Identity | null> {
    const presented = req.headers.get(PROXY_SECRET_HEADER);
    if (presented === null) return null;
    // Comparing digests keeps the check constant-time whatever length was presented.
    if (!timingSafeEqual(digest(presented), this.secret)) {
      const now = Date.now();
      if (now - this.lastWrongSecretLog >= WRONG_SECRET_LOG_INTERVAL_MS) {
        this.lastWrongSecretLog = now;
        console.warn(`Request with a wrong ${PROXY_SECRET_HEADER}; check PROXY_SECRET matches in .env for Caddy and Hop`);
      }
      return null;
    }
    const email = req.headers.get(PROXY_EMAIL_HEADER)?.trim().toLowerCase();
    return email && EMAIL_PATTERN.test(email) ? { email } : null;
  }
}
