import type { DockerEnv } from './docker-config.mjs';

export const DEFAULT_IMAGE: string;
export const EXPORT_DIR: string;
export interface PresetFiles {
  caddyfile: string;
  authSnippet: string;
  geoSnippet: string;
  autheliaConfig?: string;
  autheliaUsers?: string;
  emails?: string;
}
export function renderCaddyfile(input: { caddyfile: string; authSnippet: string; geoSnippet: string; shortDomain: string }): string;
export function renderAutheliaConfig(config: string, shortDomain: string): string;
export function deploySteps(env: DockerEnv, files?: Partial<PresetFiles>): string[];
export function stackEnvKeys(provider: string): string[];
export function stackEnv(env: DockerEnv): string;
export function quotedKeys(env: DockerEnv): string[];
export function renderStack(input: { env: DockerEnv; files: PresetFiles; images: Record<string, string>; image?: string }): string;
