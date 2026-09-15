import type { Condition, Destination, RoutingRule, RuleField, Visitor } from '../core/types';
import { validateTargetUrl } from './url';

export const RULE_FIELDS: readonly RuleField[] = ['continent', 'country', 'device', 'browser', 'os', 'language', 'visitor'];

export const CONTINENTS = ['AF', 'AN', 'AS', 'EU', 'NA', 'OC', 'SA'] as const;
export const DEVICES = ['desktop', 'mobile', 'tablet', 'other'] as const;
export const VISITOR_KINDS = ['bot', 'human'] as const;

export const MAX_RULES = 20;
export const MAX_DESTINATIONS = 5;
export const MAX_VALUES = 250;
const MAX_NAME_LENGTH = 40;

function visitorValue(visitor: Visitor, field: RuleField): string | null {
  if (field === 'visitor') return visitor.isBot ? 'bot' : 'human';
  return visitor[field];
}

function valueMatches(field: RuleField, visitorValue: string, ruleValue: string): boolean {
  const actual = visitorValue.toLowerCase();
  const expected = ruleValue.toLowerCase();
  if (field === 'language') return actual === expected || actual.startsWith(`${expected}-`);
  return actual === expected;
}

function conditionMatches(condition: Condition, visitor: Visitor): boolean {
  const actual = visitorValue(visitor, condition.field);
  const found = actual !== null && condition.values.some((v) => valueMatches(condition.field, actual, v));
  return condition.op === 'in' ? found : !found;
}

export function ruleMatches(rule: RoutingRule, visitor: Visitor, now: number): boolean {
  if (rule.window?.start !== undefined && now < rule.window.start) return false;
  if (rule.window?.end !== undefined && now >= rule.window.end) return false;
  return rule.conditions.every((c) => conditionMatches(c, visitor));
}

/** `random` returns a number in [0, 1), like Math.random. */
export function pickDestination(destinations: Destination[], random: () => number): string {
  let roll = random() * 100;
  for (const destination of destinations) {
    roll -= destination.weight;
    if (roll < 0) return destination.url;
  }
  // Only reachable through floating-point rounding at the top of the range.
  return destinations[destinations.length - 1]!.url;
}

export function resolveTarget(
  defaultUrl: string,
  rules: RoutingRule[],
  visitor: Visitor,
  now: number,
  random: () => number,
): { url: string; ruleIndex: number | null } {
  const ruleIndex = rules.findIndex((rule) => ruleMatches(rule, visitor, now));
  if (ruleIndex === -1) return { url: defaultUrl, ruleIndex: null };
  return { url: pickDestination(rules[ruleIndex]!.destinations, random), ruleIndex };
}

/** Returns the visitor's highest-weighted language tag, lowercased (e.g. "pt-br"). */
export function preferredLanguage(acceptLanguage: string | null): string | null {
  if (!acceptLanguage) return null;
  let best: { tag: string; q: number } | null = null;
  for (const part of acceptLanguage.split(',')) {
    const [rawTag, ...params] = part.trim().split(';');
    const tag = rawTag?.trim().toLowerCase();
    if (!tag || tag === '*' || !/^[a-z]{2,3}(-[a-z0-9]{1,8})*$/.test(tag)) continue;
    const qParam = params.map((p) => p.trim()).find((p) => p.startsWith('q='));
    const q = qParam ? Number(qParam.slice(2)) : 1;
    if (!Number.isFinite(q) || q <= 0) continue;
    if (!best || q > best.q) best = { tag, q };
  }
  return best?.tag ?? null;
}

export type RulesValidation =
  | { ok: true; rules: RoutingRule[] }
  | { ok: false; code: 'INVALID_INPUT' | 'INVALID_URL'; message: string };

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

function normalizeValue(field: RuleField, raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const value = raw.trim();
  switch (field) {
    case 'continent':
      return (CONTINENTS as readonly string[]).includes(value.toUpperCase()) ? value.toUpperCase() : null;
    case 'country':
      return /^[A-Za-z]{2}$/.test(value) ? value.toUpperCase() : null;
    case 'device':
      return (DEVICES as readonly string[]).includes(value.toLowerCase()) ? value.toLowerCase() : null;
    case 'visitor':
      return (VISITOR_KINDS as readonly string[]).includes(value.toLowerCase()) ? value.toLowerCase() : null;
    case 'language':
      return /^[A-Za-z]{2,3}(-[A-Za-z0-9]{1,8})*$/.test(value) ? value.toLowerCase() : null;
    case 'browser':
    case 'os':
      return value.length > 0 && value.length <= MAX_NAME_LENGTH ? value : null;
  }
}

function validateRule(raw: unknown, n: number, shortDomain: string): RoutingRule | { code: 'INVALID_INPUT' | 'INVALID_URL'; message: string } {
  const fail = (message: string, code: 'INVALID_INPUT' | 'INVALID_URL' = 'INVALID_INPUT') => ({
    code,
    message: `Rule ${n}: ${message}`,
  });
  if (!isObject(raw)) return fail('must be an object.');

  const rawConditions = raw.conditions ?? [];
  if (!Array.isArray(rawConditions)) return fail('conditions must be a list.');
  const conditions: Condition[] = [];
  const seen = new Set<string>();
  for (const c of rawConditions) {
    if (!isObject(c) || typeof c.field !== 'string' || !(RULE_FIELDS as readonly string[]).includes(c.field)) {
      return fail(`each condition needs a field (one of ${RULE_FIELDS.join(', ')}).`);
    }
    const field = c.field as RuleField;
    if (seen.has(field)) return fail(`${field} is used more than once.`);
    seen.add(field);
    if (c.op !== 'in' && c.op !== 'not_in') return fail(`${field} needs an operator of "in" or "not_in".`);
    if (!Array.isArray(c.values) || c.values.length === 0) return fail(`${field} needs at least one value.`);
    if (c.values.length > MAX_VALUES) return fail(`${field} has more than ${MAX_VALUES} values.`);
    const values: string[] = [];
    for (const v of c.values) {
      const value = normalizeValue(field, v);
      if (value === null) return fail(`"${String(v)}" is not a valid ${field}.`);
      if (!values.includes(value)) values.push(value);
    }
    conditions.push({ field, op: c.op, values });
  }

  let window: RoutingRule['window'];
  if (raw.window !== undefined && raw.window !== null) {
    if (!isObject(raw.window)) return fail('window must be an object.');
    const { start, end } = raw.window;
    for (const [name, ts] of [['start', start], ['end', end]] as const) {
      if (ts !== undefined && ts !== null && !Number.isSafeInteger(ts)) return fail(`window ${name} must be a UTC timestamp in ms.`);
    }
    const w: { start?: number; end?: number } = {};
    if (typeof start === 'number') w.start = start;
    if (typeof end === 'number') w.end = end;
    if (w.start !== undefined && w.end !== undefined && w.start >= w.end) return fail('window start must be before its end.');
    if (w.start !== undefined || w.end !== undefined) window = w;
  }

  if (!Array.isArray(raw.destinations) || raw.destinations.length === 0) return fail('needs at least one destination.');
  if (raw.destinations.length > MAX_DESTINATIONS) return fail(`has more than ${MAX_DESTINATIONS} destinations.`);
  const destinations: Destination[] = [];
  for (const [i, d] of raw.destinations.entries()) {
    if (!isObject(d)) return fail(`destination ${i + 1} must be an object.`);
    const url = validateTargetUrl(d.url, shortDomain);
    if (!url) return fail(`destination ${i + 1} needs a valid http(s) URL that does not point at this shortener.`, 'INVALID_URL');
    const weight = raw.destinations.length === 1 && d.weight === undefined ? 100 : d.weight;
    if (!Number.isInteger(weight) || (weight as number) < 1) return fail(`destination ${i + 1} needs a whole-number weight of at least 1.`);
    destinations.push({ url, weight: weight as number });
  }
  const total = destinations.reduce((sum, d) => sum + d.weight, 0);
  if (total !== 100) return fail(`destination weights add up to ${total}, not 100.`);

  return window ? { conditions, window, destinations } : { conditions, destinations };
}

export function validateRules(input: unknown, shortDomain: string): RulesValidation {
  if (!Array.isArray(input)) return { ok: false, code: 'INVALID_INPUT', message: 'rules must be a list.' };
  if (input.length > MAX_RULES) return { ok: false, code: 'INVALID_INPUT', message: `A link can have at most ${MAX_RULES} rules.` };
  const rules: RoutingRule[] = [];
  for (const [i, raw] of input.entries()) {
    const result = validateRule(raw, i + 1, shortDomain);
    if ('code' in result) return { ok: false, ...result };
    rules.push(result);
  }
  return { ok: true, rules };
}

/** Parses stored rules; anything malformed is treated as "no rules" rather than breaking redirects. */
export function parseStoredRules(json: string | null): RoutingRule[] {
  if (!json) return [];
  try {
    const parsed: unknown = JSON.parse(json);
    return Array.isArray(parsed) ? (parsed as RoutingRule[]) : [];
  } catch {
    return [];
  }
}
