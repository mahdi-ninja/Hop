import { useCallback, useMemo, useState } from 'react';
import { api } from '../api/client';
import type { ApiLink, RoutingRule, Visitor } from '../api/types';
import { FIELD_LABEL, fieldOptions, languageLabel, valueLabel } from '../lib/routingOptions';
import { displayUrl, formatDateTime } from '../lib/format';
import { MAX_RULES, preferredLanguage, ruleMatches } from '../../../src/lib/routing';
import { Modal } from './Modal';
import { RuleEditor } from './RuleEditor';
import { EditIcon, PlusIcon, TrashIcon } from './icons';
import { useToast } from './toast';
import { Button, Card } from './ui';

function joinOr(items: string[]): string {
  if (items.length <= 2) return items.join(' or ');
  return `${items.slice(0, -1).join(', ')} or ${items[items.length - 1]}`;
}

function RuleSummary({ rule }: { rule: RoutingRule }) {
  return (
    <div className="min-w-0 space-y-2">
      <p className="text-[15px] leading-relaxed">
        {rule.conditions.length === 0 ? (
          <span className="font-semibold">Everyone</span>
        ) : (
          rule.conditions.map((c, i) => (
            <span key={c.field}>
              {i === 0 ? 'If ' : ' and '}
              <span className="text-muted">{FIELD_LABEL[c.field].toLowerCase()}</span> {c.op === 'in' ? 'is' : 'is not'}{' '}
              <span className="font-semibold">{joinOr(c.values.map((v) => valueLabel(c.field, v)))}</span>
            </span>
          ))
        )}
      </p>
      {rule.window && (
        <p className="inline-flex rounded-full bg-apricot-soft px-2.5 py-0.5 text-xs font-semibold text-apricot">
          {rule.window.start !== undefined && `From ${formatDateTime(rule.window.start)}`}
          {rule.window.start !== undefined && rule.window.end !== undefined && ' · '}
          {rule.window.end !== undefined && `Until ${formatDateTime(rule.window.end)}`}
        </p>
      )}
      <ul className="space-y-1">
        {rule.destinations.map((d, i) => (
          <li key={i} className="flex min-w-0 items-center gap-2 text-sm">
            <span aria-hidden="true" className="text-accent-ink">→</span>
            {rule.destinations.length > 1 && (
              <span className="rounded-full bg-accent-soft px-2 py-0.5 text-xs font-semibold text-accent-ink tabular-nums">{d.weight}%</span>
            )}
            <span className="truncate text-muted" title={d.url}>
              {displayUrl(d.url)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

const TESTER_DEFAULT: Visitor = {
  continent: 'OC',
  country: 'AU',
  device: 'mobile',
  browser: 'Mobile Safari',
  os: 'iOS',
  language: preferredLanguage(navigator.languages?.join(',') ?? navigator.language) ?? 'en',
  isBot: false,
};

const selectClass =
  'h-10 w-full rounded-xl bg-ground px-3 text-sm text-ink ring-1 ring-line ring-inset focus:bg-surface focus:ring-2 focus:ring-accent focus:outline-none';

function VisitorTester({ link }: { link: ApiLink }) {
  const [visitor, setVisitor] = useState<Visitor>(TESTER_DEFAULT);
  const set = (patch: Partial<Visitor>) => setVisitor((v) => ({ ...v, ...patch }));
  const index = link.rules.findIndex((rule) => ruleMatches(rule, visitor, Date.now()));
  const matched = index === -1 ? null : link.rules[index]!;

  const selects: { label: string; field: 'continent' | 'country' | 'device' | 'browser' | 'os' }[] = [
    { label: 'Country', field: 'country' },
    { label: 'Continent', field: 'continent' },
    { label: 'Device', field: 'device' },
    { label: 'Operating system', field: 'os' },
    { label: 'Browser', field: 'browser' },
  ];

  return (
    <div className="rounded-2xl bg-ground p-4">
      <h3 className="font-semibold">Test a visitor</h3>
      <p className="mb-3 text-[13px] text-faint">Uses the same rules as real redirects, at the current time.</p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {selects.map(({ label, field }) => (
          <label key={field} className="block text-xs font-semibold text-muted">
            {label}
            <select className={`${selectClass} mt-1`} value={visitor[field] ?? ''} onChange={(e) => set({ [field]: e.target.value || null })}>
              <option value="">Unknown</option>
              {fieldOptions(field).map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
        ))}
        <label className="block text-xs font-semibold text-muted">
          Language
          <input
            className={`${selectClass} mt-1`}
            value={visitor.language ?? ''}
            placeholder="e.g. fr or pt-BR"
            onChange={(e) => set({ language: e.target.value.trim().toLowerCase() || null })}
          />
        </label>
        <label className="block text-xs font-semibold text-muted">
          Visitor
          <select className={`${selectClass} mt-1`} value={visitor.isBot ? 'bot' : 'human'} onChange={(e) => set({ isBot: e.target.value === 'bot' })}>
            <option value="human">Person</option>
            <option value="bot">Bot or link preview</option>
          </select>
        </label>
      </div>
      <div className="mt-4 rounded-xl bg-surface p-3.5 text-sm" role="status">
        {matched ? (
          <>
            <p className="font-semibold">
              Rule {index + 1} matches{visitor.language ? ` (${languageLabel(visitor.language)})` : ''}
            </p>
            <ul className="mt-1 space-y-0.5 text-muted">
              {matched.destinations.map((d, i) => (
                <li key={i} className="truncate">
                  → {matched.destinations.length > 1 ? `${d.weight}% ` : ''}
                  {displayUrl(d.url)}
                </li>
              ))}
            </ul>
          </>
        ) : (
          <>
            <p className="font-semibold">No rule matches</p>
            <p className="truncate text-muted">→ {displayUrl(link.url)} (default)</p>
          </>
        )}
      </div>
    </div>
  );
}

export function RoutingSection({ link, onChange }: { link: ApiLink; onChange: (link: ApiLink) => void }) {
  const toast = useToast();
  const [editing, setEditing] = useState<{ index: number | null } | null>(null);
  const [busy, setBusy] = useState(false);
  const closeEditor = useCallback(() => setEditing(null), []);
  const rules = link.rules;

  const save = async (next: RoutingRule[], message: string) => {
    const updated = await api.setRules(link.slug, next);
    onChange(updated);
    toast(message);
  };

  const saveQuietly = async (next: RoutingRule[], message: string) => {
    setBusy(true);
    try {
      await save(next, message);
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Could not save routing.', 'error');
    } finally {
      setBusy(false);
    }
  };

  const move = (i: number, delta: -1 | 1) => {
    const next = [...rules];
    const [rule] = next.splice(i, 1);
    next.splice(i + delta, 0, rule!);
    void saveQuietly(next, 'Rule order saved');
  };

  const editingRule = useMemo(() => (editing?.index != null ? rules[editing.index] ?? null : null), [editing, rules]);

  return (
    <Card>
      <div className="mb-4 flex flex-wrap items-start gap-3">
        <div className="mr-auto">
          <h2 className="font-display text-2xl font-bold tracking-tight">Smart routing</h2>
          <p className="text-sm text-muted">Send visitors to different places. Rules are checked top to bottom; the first match wins.</p>
        </div>
        {rules.length < MAX_RULES && (
          <Button variant="primary" onClick={() => setEditing({ index: null })} disabled={busy}>
            <PlusIcon /> Add rule
          </Button>
        )}
      </div>

      <ol className="space-y-2.5">
        {rules.map((rule, i) => (
          <li key={i} className="flex flex-wrap gap-3 rounded-2xl p-3.5 ring-1 ring-line sm:flex-nowrap sm:gap-4">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent-soft text-sm font-bold text-accent-ink">
              {i + 1}
            </span>
            <div className="min-w-0 flex-1">
              <RuleSummary rule={rule} />
            </div>
            <div className="-my-1 flex w-full shrink-0 justify-end gap-1 border-t border-line pt-2 sm:w-auto sm:items-start sm:border-0 sm:pt-0">
              <button
                type="button"
                onClick={() => move(i, -1)}
                disabled={busy || i === 0}
                aria-label={`Move rule ${i + 1} up`}
                className="rounded-full p-2 text-faint hover:bg-sunken hover:text-ink disabled:opacity-30"
              >
                ↑
              </button>
              <button
                type="button"
                onClick={() => move(i, 1)}
                disabled={busy || i === rules.length - 1}
                aria-label={`Move rule ${i + 1} down`}
                className="rounded-full p-2 text-faint hover:bg-sunken hover:text-ink disabled:opacity-30"
              >
                ↓
              </button>
              <button
                type="button"
                onClick={() => setEditing({ index: i })}
                disabled={busy}
                aria-label={`Edit rule ${i + 1}`}
                className="rounded-full p-2 text-faint hover:bg-sunken hover:text-ink"
              >
                <EditIcon />
              </button>
              <button
                type="button"
                onClick={() => void saveQuietly(rules.filter((_, j) => j !== i), `Rule ${i + 1} deleted`)}
                disabled={busy}
                aria-label={`Delete rule ${i + 1}`}
                className="rounded-full p-2 text-faint hover:bg-danger-soft hover:text-danger"
              >
                <TrashIcon />
              </button>
            </div>
          </li>
        ))}
        <li className="flex items-center gap-3 rounded-2xl bg-ground p-3.5 sm:gap-4">
          <span className="flex h-7 shrink-0 items-center rounded-full bg-surface px-2.5 text-xs font-semibold text-muted">
            {rules.length ? 'Otherwise' : 'Everyone'}
          </span>
          <span className="min-w-0 truncate text-sm text-muted" title={link.url}>
            → {displayUrl(link.url)} <span className="text-faint">(default)</span>
          </span>
        </li>
      </ol>

      {rules.length > 0 && (
        <div className="mt-5">
          <VisitorTester link={link} />
        </div>
      )}

      {editing && (
        <Modal title={editing.index === null ? 'Add a rule' : `Edit rule ${editing.index + 1}`} onClose={closeEditor}>
          <RuleEditor
            initial={editingRule}
            onCancel={closeEditor}
            onSave={async (rule) => {
              const next = editing.index === null ? [...rules, rule] : rules.map((r, j) => (j === editing.index ? rule : r));
              await save(next, editing.index === null ? 'Rule added' : 'Rule saved');
              setEditing(null);
            }}
          />
        </Modal>
      )}
    </Card>
  );
}
