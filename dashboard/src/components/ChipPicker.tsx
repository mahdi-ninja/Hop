import { useId, useMemo, useState, type KeyboardEvent } from 'react';
import type { Option } from '../lib/routingOptions';
import { CloseIcon, PlusIcon } from './icons';

const MAX_SUGGESTIONS = 8;

export function ChipPicker({
  values,
  options,
  onChange,
  labelFor,
  allowCustom,
  placeholder,
  ariaLabel,
}: {
  values: string[];
  options: Option[];
  onChange: (values: string[]) => void;
  labelFor: (value: string) => string;
  allowCustom: boolean;
  placeholder: string;
  ariaLabel: string;
}) {
  const [query, setQuery] = useState('');
  const [focused, setFocused] = useState(false);
  const listId = useId();
  const smallList = options.length <= 7;

  const suggestions = useMemo(() => {
    const q = query.trim().toLowerCase();
    return options
      .filter((o) => !values.includes(o.value))
      .filter((o) => !q || o.label.toLowerCase().includes(q) || o.value.toLowerCase().startsWith(q))
      .slice(0, MAX_SUGGESTIONS);
  }, [options, values, query]);

  const add = (value: string) => {
    if (!values.some((v) => v.toLowerCase() === value.toLowerCase())) onChange([...values, value]);
    setQuery('');
  };
  const remove = (value: string) => onChange(values.filter((v) => v !== value));

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const typed = query.trim();
      if (suggestions[0] && (!allowCustom || suggestions[0].label.toLowerCase().includes(typed.toLowerCase()))) add(suggestions[0].value);
      else if (allowCustom && typed) add(typed);
    } else if (e.key === 'Backspace' && !query && values.length) {
      remove(values[values.length - 1]!);
    }
  };

  if (smallList) {
    return (
      <div className="flex flex-wrap gap-2" role="group" aria-label={ariaLabel}>
        {options.map((o) => {
          const on = values.includes(o.value);
          return (
            <button
              key={o.value}
              type="button"
              aria-pressed={on}
              onClick={() => (on ? remove(o.value) : add(o.value))}
              className={`h-9 rounded-full px-3.5 text-sm font-medium transition-colors ${
                on ? 'bg-accent text-on-accent' : 'bg-surface text-muted ring-1 ring-line hover:text-ink'
              }`}
            >
              {o.label}
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <div className="relative">
      <div className="flex min-h-11 flex-wrap items-center gap-1.5 rounded-xl bg-surface p-1.5 ring-1 ring-line focus-within:ring-2 focus-within:ring-accent">
        {values.map((v) => (
          <span key={v} className="inline-flex h-8 items-center gap-1 rounded-full bg-accent-soft pr-1 pl-3 text-sm font-medium text-accent-ink">
            {labelFor(v)}
            <button type="button" onClick={() => remove(v)} aria-label={`Remove ${labelFor(v)}`} className="rounded-full p-1 hover:bg-accent hover:text-on-accent">
              <CloseIcon size={12} />
            </button>
          </span>
        ))}
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onKeyDown}
          onFocus={() => setFocused(true)}
          onBlur={() => setTimeout(() => setFocused(false), 120)}
          placeholder={values.length ? 'Add more…' : placeholder}
          aria-label={ariaLabel}
          aria-controls={listId}
          className="h-8 min-w-32 flex-1 bg-transparent px-2 text-sm text-ink placeholder:text-faint focus:outline-none"
        />
      </div>
      {focused && (suggestions.length > 0 || (allowCustom && query.trim())) && (
        <ul id={listId} role="listbox" className="absolute inset-x-0 top-full z-10 mt-1.5 max-h-64 overflow-y-auto rounded-xl bg-surface p-1 shadow-lg ring-1 ring-line">
          {suggestions.map((o) => (
            <li key={o.value}>
              <button
                type="button"
                role="option"
                aria-selected="false"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => add(o.value)}
                className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm hover:bg-sunken"
              >
                {o.label}
                {o.label !== o.value && <span className="font-mono text-xs text-faint">{o.value}</span>}
              </button>
            </li>
          ))}
          {allowCustom && query.trim() && !options.some((o) => o.value.toLowerCase() === query.trim().toLowerCase()) && (
            <li>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => add(query.trim())}
                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-accent-ink hover:bg-sunken"
              >
                <PlusIcon size={14} /> Add “{query.trim()}”
              </button>
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
