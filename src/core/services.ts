import type { Services } from './ports';

export type { Services };

export interface AppEnv {
  Bindings: { services: Services };
  Variables: { services: Services; userEmail: string };
}
