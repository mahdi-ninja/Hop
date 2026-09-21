export interface HopConfig {
  accountId: string;
  shortDomain: string;
  rootRedirectUrl?: string;
  database: { name: string; id: string };
  access: { teamDomain: string; aud: string; appId?: string };
}

export const HOP_CONFIG_FILE: string;
export const DEPLOY_CONFIG_DIR: string;
export const DEPLOY_CONFIG_FILE: string;
export function isPlaceholder(value: unknown): boolean;
export function parseJsonc(text: string): Record<string, unknown>;
export function normalizeHostname(input: unknown): string;
export function isValidHostname(host: string): boolean;
export function normalizeTeamDomain(input: unknown): string;
export function isValidAud(aud: unknown): boolean;
export function validateHopConfig(config: unknown): string[];
export function buildDeployConfig(template: Record<string, unknown>, config: HopConfig): Record<string, unknown>;
