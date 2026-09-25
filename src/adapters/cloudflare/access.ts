import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from 'jose';
import type { IdentityProvider } from '../../core/ports';
import type { Identity } from '../../core/types';

// Module scope so the fetched signing keys are cached across requests in the same isolate.
const jwksByTeamDomain = new Map<string, JWTVerifyGetKey>();

function remoteJwks(teamDomain: string): JWTVerifyGetKey {
  let jwks = jwksByTeamDomain.get(teamDomain);
  if (!jwks) {
    jwks = createRemoteJWKSet(new URL(`${teamDomain}/cdn-cgi/access/certs`));
    jwksByTeamDomain.set(teamDomain, jwks);
  }
  return jwks;
}

function readCookie(req: Request, name: string): string | null {
  const header = req.headers.get('Cookie');
  if (!header) return null;
  for (const part of header.split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key === name) return rest.join('=') || null;
  }
  return null;
}

export interface AccessOptions {
  teamDomain: string;
  audience: string;
  /** Overrides the remote JWKS; used by tests to verify locally signed tokens. */
  keys?: JWTVerifyGetKey;
}

export class AccessIdentityProvider implements IdentityProvider {
  private readonly teamDomain: string;
  private readonly audience: string;
  private readonly keys: JWTVerifyGetKey;

  constructor(options: AccessOptions) {
    this.teamDomain = options.teamDomain.replace(/\/+$/, '');
    this.audience = options.audience;
    this.keys = options.keys ?? remoteJwks(this.teamDomain);
  }

  async identify(req: Request): Promise<Identity | null> {
    const token = req.headers.get('Cf-Access-Jwt-Assertion') ?? readCookie(req, 'CF_Authorization');
    if (!token) return null;

    try {
      const { payload } = await jwtVerify(token, this.keys, {
        issuer: this.teamDomain,
        audience: this.audience,
        algorithms: ['RS256'],
      });
      return typeof payload.email === 'string' && payload.email ? { email: payload.email } : null;
    } catch (err) {
      // Only the error code: a wrong AUD or team domain shows up in logs without leaking the token.
      console.warn('Access token rejected', { code: (err as { code?: string }).code ?? 'unknown' });
      return null;
    }
  }
}
