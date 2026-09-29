import type { GeoLookup } from '../../core/ports';
import type { Geo } from '../../core/types';

const UNKNOWN: Geo = { continent: null, country: null, region: null, city: null };

export const noGeo: GeoLookup = { lookup: async () => UNKNOWN };

/**
 * Reads the headers Cloudflare adds in front of an origin: CF-IPCountry always, the rest with the
 * "Add visitor location headers" managed transform. Only safe when every request reaches Hop
 * through Cloudflare, because a visitor can send these headers too.
 */
export class CloudflareHeaderGeoLookup implements GeoLookup {
  async lookup(req: Request): Promise<Geo> {
    const read = (name: string) => {
      const value = req.headers.get(name)?.trim();
      return value && value !== 'XX' ? value : null;
    };
    return {
      continent: read('CF-IPContinent'),
      country: read('CF-IPCountry'),
      region: read('CF-Region'),
      city: read('CF-IPCity'),
    };
  }
}
