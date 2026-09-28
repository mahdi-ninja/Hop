export interface AccessApp {
  id?: string;
  name?: string;
  aud?: string;
  domain?: string;
  self_hosted_domains?: string[];
  destinations?: { type?: string; uri: string }[];
}

export class CloudflareApiError extends Error {
  status: number;
}
export function createApi(token: string): {
  getWorkersSubdomain(accountId: string): Promise<string | null>;
  [method: string]: (...args: never[]) => Promise<unknown>;
};
export function teamCanSignIn(identityProviders: { type?: string; name?: string }[]): boolean;
export function protectedPaths(shortDomain: string): [string, string];
export function findHopApp(apps: AccessApp[], shortDomain: string): AccessApp | null;
export function includeRules(entries: string[]): Record<string, unknown>[];
export function accessAppBody(input: { shortDomain: string; allowed: string[]; sessionDuration: string }): Record<string, unknown>;
