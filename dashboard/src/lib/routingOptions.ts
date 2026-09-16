import type { RuleField } from '../api/types';
import { CONTINENTS, DEVICES } from '../../../src/lib/routing';

export interface Option {
  value: string;
  label: string;
}

export const FIELD_LABEL: Record<RuleField, string> = {
  continent: 'Continent',
  country: 'Country',
  device: 'Device',
  browser: 'Browser',
  os: 'Operating system',
  language: 'Language',
  visitor: 'Visitor',
};

const CONTINENT_NAMES: Record<(typeof CONTINENTS)[number], string> = {
  AF: 'Africa',
  AN: 'Antarctica',
  AS: 'Asia',
  EU: 'Europe',
  NA: 'North America',
  OC: 'Oceania',
  SA: 'South America',
};

function displayNames(type: 'region' | 'language'): Intl.DisplayNames | null {
  try {
    return new Intl.DisplayNames(undefined, { type, fallback: 'none' });
  } catch {
    return null;
  }
}

const regionNames = displayNames('region');
const languageNames = displayNames('language');

// Region codes Intl knows that aren't countries (or that Cloudflare never reports).
const NOT_COUNTRIES = new Set(['EU', 'EZ', 'UN', 'ZZ', 'QO', 'XA', 'XB', 'AC', 'CP', 'DG', 'EA', 'IC', 'TA', 'CQ']);

function buildCountries(): Option[] {
  if (!regionNames) return [];
  const byName = new Map<string, Option>();
  const A = 'A'.charCodeAt(0);
  for (let i = 0; i < 26; i++) {
    for (let j = 0; j < 26; j++) {
      const code = String.fromCharCode(A + i, A + j);
      const name = regionNames.of(code);
      if (!name || name === code || NOT_COUNTRIES.has(code) || byName.has(name)) continue;
      byName.set(name, { value: code, label: name });
    }
  }
  return [...byName.values()].sort((a, b) => a.label.localeCompare(b.label));
}

let countries: Option[] | null = null;

const COMMON_LANGUAGES = ['en', 'es', 'fr', 'de', 'pt', 'pt-br', 'it', 'nl', 'ja', 'zh', 'ko', 'ar', 'hi', 'ru', 'tr', 'pl', 'sv', 'id', 'vi', 'th', 'he', 'uk'];
const COMMON_BROWSERS = ['Chrome', 'Mobile Safari', 'Safari', 'Firefox', 'Edge', 'Samsung Browser', 'Opera', 'Chrome WebView', 'Instagram', 'Facebook'];
const COMMON_OS = ['iOS', 'Android', 'Windows', 'macOS', 'Linux', 'Chromium OS', 'HarmonyOS'];

export function languageLabel(tag: string): string {
  const name = languageNames?.of(tag);
  return name ? `${name} (${tag})` : tag;
}

export function valueLabel(field: RuleField, value: string): string {
  switch (field) {
    case 'continent':
      return CONTINENT_NAMES[value as keyof typeof CONTINENT_NAMES] ?? value;
    case 'country':
      return regionNames?.of(value) ?? value;
    case 'device':
      return value.charAt(0).toUpperCase() + value.slice(1);
    case 'visitor':
      return value === 'bot' ? 'Bot or link preview' : 'Person';
    case 'language':
      return languageLabel(value);
    default:
      return value;
  }
}

export function fieldOptions(field: RuleField): Option[] {
  switch (field) {
    case 'continent':
      return CONTINENTS.map((c) => ({ value: c, label: CONTINENT_NAMES[c] }));
    case 'country':
      countries ??= buildCountries();
      return countries;
    case 'device':
      return DEVICES.map((d) => ({ value: d, label: valueLabel('device', d) }));
    case 'visitor':
      return [
        { value: 'human', label: valueLabel('visitor', 'human') },
        { value: 'bot', label: valueLabel('visitor', 'bot') },
      ];
    case 'language':
      return COMMON_LANGUAGES.map((l) => ({ value: l, label: languageLabel(l) }));
    case 'browser':
      return COMMON_BROWSERS.map((b) => ({ value: b, label: b }));
    case 'os':
      return COMMON_OS.map((o) => ({ value: o, label: o }));
  }
}

/** Fields whose values aren't a closed list, so a typed value can be added as-is. */
export const ALLOWS_CUSTOM: Record<RuleField, boolean> = {
  continent: false,
  country: false,
  device: false,
  visitor: false,
  language: true,
  browser: true,
  os: true,
};
