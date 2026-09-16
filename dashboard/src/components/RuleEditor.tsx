import { useState, type FormEvent } from 'react';
import { errorMessage } from '../api/client';
import type { Condition, RoutingRule, RuleField } from '../api/types';
import { ALLOWS_CUSTOM, FIELD_LABEL, fieldOptions, valueLabel } from '../lib/routingOptions';
import { MAX_DESTINATIONS, RULE_FIELDS } from '../../../src/lib/routing';
import { ChipPicker } from './ChipPicker';
import { CloseIcon, PlusIcon } from './icons';
import { Button, ErrorBanner, Segmented, Switch, inputClass } from './ui';

interface DraftDestination {
  url: string;
  weight: string;
}

function toLocalInput(ts: number | undefined): string {
  if (ts === undefined) return '';
  const d = new Date(ts);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

function fromLocalInput(value: string): number | undefined {
  return value ? new Date(value).getTime() : undefined;
}

function evenWeights(count: number): string[] {
  const base = Math.floor(100 / count);
  return Array.from({ length: count }, (_, i) => String(i === 0 ? 100 - base * (count - 1) : base));
}

const OP_OPTIONS: { value: Condition['op']; label: string }[] = [
  { value: 'in', label: 'is' },
  { value: 'not_in', label: 'is not' },
];

export function RuleEditor({
  initial,
  onSave,
  onCancel,
}: {
  initial: RoutingRule | null;
  onSave: (rule: RoutingRule) => Promise<void>;
  onCancel: () => void;
}) {
  const [conditions, setConditions] = useState<Condition[]>(initial?.conditions ?? [{ field: 'country', op: 'in', values: [] }]);
  const [useWindow, setUseWindow] = useState(Boolean(initial?.window));
  const [start, setStart] = useState(toLocalInput(initial?.window?.start));
  const [end, setEnd] = useState(toLocalInput(initial?.window?.end));
  const [destinations, setDestinations] = useState<DraftDestination[]>(
    initial?.destinations.map((d) => ({ url: d.url, weight: String(d.weight) })) ?? [{ url: '', weight: '100' }],
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const usedFields = new Set(conditions.map((c) => c.field));
  const freeFields = RULE_FIELDS.filter((f) => !usedFields.has(f));
  const split = destinations.length > 1;
  const weightTotal = destinations.reduce((sum, d) => sum + (Number(d.weight) || 0), 0);

  const updateCondition = (i: number, patch: Partial<Condition>) =>
    setConditions((cs) => cs.map((c, j) => (j === i ? { ...c, ...patch } : c)));

  const setDestinationCount = (next: DraftDestination[]) => {
    const weights = evenWeights(next.length);
    setDestinations(next.map((d, i) => ({ ...d, weight: weights[i]! })));
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    const empty = conditions.find((c) => c.values.length === 0);
    if (empty) return setError(`Pick at least one ${FIELD_LABEL[empty.field].toLowerCase()}, or remove that condition.`);
    if (destinations.some((d) => !d.url.trim())) return setError('Every destination needs a URL.');
    if (split && weightTotal !== 100) return setError(`Split percentages add up to ${weightTotal}%. They need to add up to 100%.`);
    const window = useWindow ? { start: fromLocalInput(start), end: fromLocalInput(end) } : undefined;
    if (window && window.start === undefined && window.end === undefined) return setError('Set a start or an end for the time window, or turn it off.');

    setSaving(true);
    try {
      await onSave({
        conditions,
        ...(window ? { window } : {}),
        destinations: destinations.map((d) => ({ url: d.url.trim(), weight: split ? Number(d.weight) : 100 })),
      });
    } catch (err) {
      setError(errorMessage(err));
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-6" noValidate>
      {error && <ErrorBanner message={error} />}

      <section className="space-y-3">
        <div>
          <h3 className="font-semibold">When the visitor…</h3>
          <p className="text-[13px] text-faint">All conditions must match. With no conditions, the rule matches everyone.</p>
        </div>
        {conditions.map((condition, i) => (
          <div key={condition.field} className="space-y-3 rounded-2xl bg-ground p-3.5">
            <div className="flex flex-wrap items-center gap-2">
              <select
                aria-label="Field"
                value={condition.field}
                onChange={(e) => updateCondition(i, { field: e.target.value as RuleField, values: [] })}
                className="h-9 rounded-full bg-surface px-3 text-sm font-semibold ring-1 ring-line focus:ring-2 focus:ring-accent focus:outline-none"
              >
                {[condition.field, ...freeFields].map((f) => (
                  <option key={f} value={f}>
                    {FIELD_LABEL[f]}
                  </option>
                ))}
              </select>
              <Segmented label="Operator" value={condition.op} options={OP_OPTIONS} onChange={(op) => updateCondition(i, { op })} />
              <button
                type="button"
                onClick={() => setConditions((cs) => cs.filter((_, j) => j !== i))}
                aria-label={`Remove ${FIELD_LABEL[condition.field]} condition`}
                className="ml-auto rounded-full p-2 text-faint hover:bg-surface hover:text-ink"
              >
                <CloseIcon />
              </button>
            </div>
            <ChipPicker
              values={condition.values}
              options={fieldOptions(condition.field)}
              onChange={(values) => updateCondition(i, { values })}
              labelFor={(v) => valueLabel(condition.field, v)}
              allowCustom={ALLOWS_CUSTOM[condition.field]}
              placeholder={`Search ${FIELD_LABEL[condition.field].toLowerCase()}…`}
              ariaLabel={`${FIELD_LABEL[condition.field]} values`}
            />
          </div>
        ))}
        {freeFields.length > 0 && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setConditions((cs) => [...cs, { field: freeFields[0]!, op: 'in', values: [] }])}
          >
            <PlusIcon /> Add condition
          </Button>
        )}
      </section>

      <section className="space-y-3">
        <Switch checked={useWindow} onChange={setUseWindow} label="Only during a time window" />
        {useWindow && (
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm font-semibold">
              Starts
              <input type="datetime-local" className={`${inputClass} mt-1.5`} value={start} onChange={(e) => setStart(e.target.value)} />
            </label>
            <label className="block text-sm font-semibold">
              Ends
              <input type="datetime-local" className={`${inputClass} mt-1.5`} value={end} onChange={(e) => setEnd(e.target.value)} />
            </label>
            <p className="text-[13px] text-faint sm:col-span-2">
              In your local time. Leave one side empty for an open-ended window. Outside the window the rule is skipped.
            </p>
          </div>
        )}
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-baseline gap-2">
          <h3 className="font-semibold">…send them to</h3>
          {split && (
            <span className={`text-[13px] font-medium ${weightTotal === 100 ? 'text-faint' : 'text-danger'}`}>
              Split total: {weightTotal}%
            </span>
          )}
        </div>
        {destinations.map((d, i) => (
          <div key={i} className="flex items-center gap-2">
            <input
              type="url"
              inputMode="url"
              aria-label={`Destination ${i + 1} URL`}
              placeholder="https://example.com/landing"
              className={inputClass}
              value={d.url}
              onChange={(e) => setDestinations((ds) => ds.map((x, j) => (j === i ? { ...x, url: e.target.value } : x)))}
            />
            {split && (
              <>
                <div className="relative w-24 shrink-0">
                  <input
                    type="number"
                    min={1}
                    max={99}
                    aria-label={`Destination ${i + 1} percentage`}
                    className={`${inputClass} pr-7 text-right tabular-nums`}
                    value={d.weight}
                    onChange={(e) => setDestinations((ds) => ds.map((x, j) => (j === i ? { ...x, weight: e.target.value } : x)))}
                  />
                  <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-sm text-faint">%</span>
                </div>
                <button
                  type="button"
                  onClick={() => setDestinationCount(destinations.filter((_, j) => j !== i))}
                  aria-label={`Remove destination ${i + 1}`}
                  className="shrink-0 rounded-full p-2 text-faint hover:bg-sunken hover:text-ink"
                >
                  <CloseIcon />
                </button>
              </>
            )}
          </div>
        ))}
        <div className="flex flex-wrap gap-2">
          {destinations.length < MAX_DESTINATIONS && (
            <Button size="sm" variant="ghost" onClick={() => setDestinationCount([...destinations, { url: '', weight: '0' }])}>
              <PlusIcon /> {split ? 'Add destination' : 'Split traffic (A/B test)'}
            </Button>
          )}
          {split && (
            <Button size="sm" variant="ghost" onClick={() => setDestinationCount(destinations)}>
              Split evenly
            </Button>
          )}
        </div>
        {split && <p className="text-[13px] text-faint">Each visit picks a destination at random by percentage. Repeat visits aren’t kept on the same one.</p>}
      </section>

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button variant="ghost" onClick={onCancel} disabled={saving}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" size="lg" disabled={saving}>
          {saving ? 'Saving…' : initial ? 'Save rule' : 'Add rule'}
        </Button>
      </div>
    </form>
  );
}
