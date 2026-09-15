import { describe, expect, it } from 'vitest';
import type { RoutingRule, Visitor } from '../src/core/types';
import { pickDestination, preferredLanguage, resolveTarget, ruleMatches, validateRules } from '../src/lib/routing';

const SHORT = 'go.example.com';
const DEFAULT = 'https://example.com/default';

const visitor: Visitor = {
  continent: 'OC',
  country: 'AU',
  device: 'mobile',
  browser: 'Mobile Safari',
  os: 'iOS',
  language: 'en-au',
  isBot: false,
};

const to = (url: string): RoutingRule['destinations'] => [{ url, weight: 100 }];

describe('ruleMatches', () => {
  it('matches every field with "in"', () => {
    const cases: RoutingRule['conditions'][] = [
      [{ field: 'continent', op: 'in', values: ['OC'] }],
      [{ field: 'country', op: 'in', values: ['NZ', 'AU'] }],
      [{ field: 'device', op: 'in', values: ['mobile'] }],
      [{ field: 'browser', op: 'in', values: ['mobile safari'] }],
      [{ field: 'os', op: 'in', values: ['IOS'] }],
      [{ field: 'language', op: 'in', values: ['en'] }],
      [{ field: 'visitor', op: 'in', values: ['human'] }],
    ];
    for (const conditions of cases) {
      expect(ruleMatches({ conditions, destinations: to('https://x.test/') }, visitor, 0), JSON.stringify(conditions)).toBe(true);
    }
  });

  it('negates with "not_in"', () => {
    const rule: RoutingRule = { conditions: [{ field: 'country', op: 'not_in', values: ['AU'] }], destinations: to('https://x.test/') };
    expect(ruleMatches(rule, visitor, 0)).toBe(false);
    expect(ruleMatches(rule, { ...visitor, country: 'US' }, 0)).toBe(true);
  });

  it('requires all conditions (AND) and any value (OR)', () => {
    const rule: RoutingRule = {
      conditions: [
        { field: 'country', op: 'in', values: ['AU', 'NZ'] },
        { field: 'device', op: 'in', values: ['desktop'] },
      ],
      destinations: to('https://x.test/'),
    };
    expect(ruleMatches(rule, visitor, 0)).toBe(false);
    expect(ruleMatches(rule, { ...visitor, device: 'desktop', country: 'NZ' }, 0)).toBe(true);
  });

  it('treats unknown visitor values as not matching "in" and matching "not_in"', () => {
    const unknown = { ...visitor, country: null };
    expect(ruleMatches({ conditions: [{ field: 'country', op: 'in', values: ['AU'] }], destinations: to('https://x.test/') }, unknown, 0)).toBe(false);
    expect(ruleMatches({ conditions: [{ field: 'country', op: 'not_in', values: ['AU'] }], destinations: to('https://x.test/') }, unknown, 0)).toBe(true);
  });

  it('matches language prefixes but not the other way round', () => {
    const rule = (values: string[]): RoutingRule => ({ conditions: [{ field: 'language', op: 'in', values }], destinations: to('https://x.test/') });
    expect(ruleMatches(rule(['pt']), { ...visitor, language: 'pt-br' }, 0)).toBe(true);
    expect(ruleMatches(rule(['pt-br']), { ...visitor, language: 'pt-br' }, 0)).toBe(true);
    expect(ruleMatches(rule(['pt-br']), { ...visitor, language: 'pt' }, 0)).toBe(false);
    expect(ruleMatches(rule(['p']), { ...visitor, language: 'pt' }, 0)).toBe(false);
  });

  it('matches bots with the visitor field', () => {
    const rule: RoutingRule = { conditions: [{ field: 'visitor', op: 'in', values: ['bot'] }], destinations: to('https://x.test/') };
    expect(ruleMatches(rule, visitor, 0)).toBe(false);
    expect(ruleMatches(rule, { ...visitor, isBot: true }, 0)).toBe(true);
  });

  it('respects the time window: start inclusive, end exclusive', () => {
    const rule: RoutingRule = { conditions: [], window: { start: 100, end: 200 }, destinations: to('https://x.test/') };
    expect(ruleMatches(rule, visitor, 99)).toBe(false);
    expect(ruleMatches(rule, visitor, 100)).toBe(true);
    expect(ruleMatches(rule, visitor, 199)).toBe(true);
    expect(ruleMatches(rule, visitor, 200)).toBe(false);
    expect(ruleMatches({ conditions: [], window: { end: 50 }, destinations: to('https://x.test/') }, visitor, 10)).toBe(true);
  });

  it('matches everyone when a rule has no conditions', () => {
    expect(ruleMatches({ conditions: [], destinations: to('https://x.test/') }, visitor, 0)).toBe(true);
  });
});

describe('resolveTarget', () => {
  const rules: RoutingRule[] = [
    { conditions: [{ field: 'country', op: 'in', values: ['US'] }], destinations: to('https://x.test/us') },
    { conditions: [{ field: 'os', op: 'in', values: ['iOS'] }], destinations: to('https://x.test/ios') },
    { conditions: [{ field: 'device', op: 'in', values: ['mobile'] }], destinations: to('https://x.test/mobile') },
  ];

  it('uses the first matching rule', () => {
    expect(resolveTarget(DEFAULT, rules, visitor, 0, Math.random)).toEqual({ url: 'https://x.test/ios', ruleIndex: 1 });
  });

  it('falls back to the default URL', () => {
    expect(resolveTarget(DEFAULT, rules, { ...visitor, os: 'Windows', device: 'desktop' }, 0, Math.random)).toEqual({
      url: DEFAULT,
      ruleIndex: null,
    });
    expect(resolveTarget(DEFAULT, [], visitor, 0, Math.random)).toEqual({ url: DEFAULT, ruleIndex: null });
  });
});

describe('pickDestination', () => {
  const split = [
    { url: 'https://x.test/a', weight: 20 },
    { url: 'https://x.test/b', weight: 30 },
    { url: 'https://x.test/c', weight: 50 },
  ];

  it('maps the random roll onto cumulative weights', () => {
    expect(pickDestination(split, () => 0)).toBe('https://x.test/a');
    expect(pickDestination(split, () => 0.1999)).toBe('https://x.test/a');
    expect(pickDestination(split, () => 0.2)).toBe('https://x.test/b');
    expect(pickDestination(split, () => 0.4999)).toBe('https://x.test/b');
    expect(pickDestination(split, () => 0.5)).toBe('https://x.test/c');
    expect(pickDestination(split, () => 0.99999999)).toBe('https://x.test/c');
  });

  it('splits roughly by weight over many visits', () => {
    const counts: Record<string, number> = {};
    for (let i = 0; i < 10_000; i++) {
      const url = pickDestination(split, Math.random);
      counts[url] = (counts[url] ?? 0) + 1;
    }
    expect(counts['https://x.test/a']! / 10_000).toBeCloseTo(0.2, 1);
    expect(counts['https://x.test/c']! / 10_000).toBeCloseTo(0.5, 1);
  });
});

describe('preferredLanguage', () => {
  it('picks the highest-weighted tag', () => {
    expect(preferredLanguage('fr-CH, fr;q=0.9, en;q=0.8, de;q=0.7, *;q=0.5')).toBe('fr-ch');
    expect(preferredLanguage('en;q=0.5, ja;q=0.9')).toBe('ja');
    expect(preferredLanguage('pt-BR')).toBe('pt-br');
  });

  it('ignores wildcards, zero weights and junk', () => {
    expect(preferredLanguage('*')).toBeNull();
    expect(preferredLanguage('de;q=0, en;q=0.1')).toBe('en');
    expect(preferredLanguage('not a tag!!, es')).toBe('es');
    expect(preferredLanguage(null)).toBeNull();
    expect(preferredLanguage('')).toBeNull();
  });
});

describe('validateRules', () => {
  const ok = (rules: unknown) => {
    const result = validateRules(rules, SHORT);
    if (!result.ok) throw new Error(result.message);
    return result.rules;
  };
  const fails = (rules: unknown) => {
    const result = validateRules(rules, SHORT);
    if (result.ok) throw new Error('expected failure');
    return result;
  };

  it('normalizes values and defaults a single destination to weight 100', () => {
    expect(
      ok([
        {
          conditions: [
            { field: 'country', op: 'in', values: ['au', 'NZ', 'AU'] },
            { field: 'language', op: 'not_in', values: ['PT-br'] },
            { field: 'continent', op: 'in', values: ['oc'] },
            { field: 'visitor', op: 'in', values: ['Bot'] },
          ],
          destinations: [{ url: 'https://example.com/au' }],
        },
      ]),
    ).toEqual([
      {
        conditions: [
          { field: 'country', op: 'in', values: ['AU', 'NZ'] },
          { field: 'language', op: 'not_in', values: ['pt-br'] },
          { field: 'continent', op: 'in', values: ['OC'] },
          { field: 'visitor', op: 'in', values: ['bot'] },
        ],
        destinations: [{ url: 'https://example.com/au', weight: 100 }],
      },
    ]);
  });

  it('keeps windows and splits', () => {
    const [rule] = ok([
      {
        conditions: [],
        window: { start: 1, end: 2 },
        destinations: [
          { url: 'https://a.example/', weight: 40 },
          { url: 'https://b.example/', weight: 60 },
        ],
      },
    ]);
    expect(rule).toMatchObject({ window: { start: 1, end: 2 } });
    expect(ok([{ conditions: [], window: {}, destinations: [{ url: 'https://a.example/' }] }])[0]).not.toHaveProperty('window');
    expect(ok([])).toEqual([]);
  });

  it.each([
    ['not a list', {}],
    ['too many rules', Array.from({ length: 21 }, () => ({ destinations: [{ url: 'https://a.example/' }] }))],
    ['unknown field', [{ conditions: [{ field: 'city', op: 'in', values: ['x'] }], destinations: [{ url: 'https://a.example/' }] }]],
    ['duplicate field', [{ conditions: [{ field: 'os', op: 'in', values: ['iOS'] }, { field: 'os', op: 'in', values: ['Android'] }], destinations: [{ url: 'https://a.example/' }] }]],
    ['bad op', [{ conditions: [{ field: 'os', op: 'eq', values: ['iOS'] }], destinations: [{ url: 'https://a.example/' }] }]],
    ['no values', [{ conditions: [{ field: 'os', op: 'in', values: [] }], destinations: [{ url: 'https://a.example/' }] }]],
    ['bad continent', [{ conditions: [{ field: 'continent', op: 'in', values: ['XX'] }], destinations: [{ url: 'https://a.example/' }] }]],
    ['bad country', [{ conditions: [{ field: 'country', op: 'in', values: ['AUS'] }], destinations: [{ url: 'https://a.example/' }] }]],
    ['bad device', [{ conditions: [{ field: 'device', op: 'in', values: ['watch'] }], destinations: [{ url: 'https://a.example/' }] }]],
    ['bad language', [{ conditions: [{ field: 'language', op: 'in', values: ['english!'] }], destinations: [{ url: 'https://a.example/' }] }]],
    ['long browser', [{ conditions: [{ field: 'browser', op: 'in', values: ['x'.repeat(41)] }], destinations: [{ url: 'https://a.example/' }] }]],
    ['window order', [{ window: { start: 5, end: 5 }, destinations: [{ url: 'https://a.example/' }] }]],
    ['window type', [{ window: { start: 'soon' }, destinations: [{ url: 'https://a.example/' }] }]],
    ['no destinations', [{ conditions: [], destinations: [] }]],
    ['too many destinations', [{ destinations: Array.from({ length: 6 }, () => ({ url: 'https://a.example/', weight: 1 })) }]],
    ['weights not 100', [{ destinations: [{ url: 'https://a.example/', weight: 50 }, { url: 'https://b.example/', weight: 40 }] }]],
    ['fractional weight', [{ destinations: [{ url: 'https://a.example/', weight: 50.5 }, { url: 'https://b.example/', weight: 49.5 }] }]],
  ])('rejects %s with INVALID_INPUT', (_name, rules) => {
    expect(fails(rules).code).toBe('INVALID_INPUT');
  });

  it('rejects bad destination URLs with INVALID_URL and names the rule', () => {
    const result = fails([
      { destinations: [{ url: 'https://ok.example/' }] },
      { destinations: [{ url: 'https://go.example.com/loop' }] },
    ]);
    expect(result.code).toBe('INVALID_URL');
    expect(result.message).toMatch(/^Rule 2: destination 1/);
  });
});
