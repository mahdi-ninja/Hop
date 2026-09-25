import type { IdentityProvider } from '../../core/ports';
import type { Identity } from '../../core/types';
import { isLocalHostname } from '../../lib/url';

/**
 * Local-development bypass: uses devEmail without verification, but only when devEmail is set
 * AND the request is addressed to localhost or a *.localhost name. Both conditions are required.
 * This relies on the Worker seeing the real Host header, which is why wrangler.jsonc sets no
 * dev.host: a DNS-rebinding page (attacker.example → 127.0.0.1) then arrives as attacker.example.
 */
export class DevIdentityProvider implements IdentityProvider {
  constructor(
    private readonly inner: IdentityProvider,
    private readonly devEmail: string | undefined,
  ) {}

  async identify(req: Request): Promise<Identity | null> {
    if (this.devEmail && isLocalHostname(new URL(req.url).hostname)) {
      return { email: this.devEmail };
    }
    return this.inner.identify(req);
  }
}
