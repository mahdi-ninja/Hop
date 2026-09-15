import type { GeoLookup } from '../../core/ports';
import type { Geo } from '../../core/types';

export class CloudflareGeoLookup implements GeoLookup {
  async lookup(req: Request): Promise<Geo> {
    const cf = (req as Request<unknown, IncomingRequestCfProperties>).cf;
    return {
      continent: cf?.continent ?? null,
      country: cf?.country ?? null,
      region: cf?.region ?? null,
      city: cf?.city ?? null,
    };
  }
}
