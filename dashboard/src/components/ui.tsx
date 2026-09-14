import { useEffect, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { copyText } from '../lib/clipboard';
import { CheckIcon, CopyIcon } from './icons';
import { useToast } from './toast';

type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost';
type ButtonSize = 'sm' | 'md' | 'lg';

const buttonVariants: Record<ButtonVariant, string> = {
  primary: 'bg-accent text-on-accent hover:bg-accent-hover disabled:opacity-60',
  secondary: 'bg-surface text-ink shadow-soft ring-1 ring-line hover:bg-sunken disabled:opacity-60',
  danger: 'bg-danger-soft text-danger hover:bg-danger hover:text-white disabled:opacity-60',
  ghost: 'text-muted hover:bg-sunken hover:text-ink disabled:opacity-60',
};

const buttonSizes: Record<ButtonSize, string> = {
  sm: 'h-8 px-3 text-[13px] gap-1.5',
  md: 'h-10 px-4 text-sm gap-2',
  lg: 'h-11 px-5 text-[15px] gap-2',
};

export function Button({
  variant = 'secondary',
  size = 'md',
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; size?: ButtonSize }) {
  return (
    <button
      type="button"
      className={`inline-flex shrink-0 items-center justify-center rounded-full font-semibold whitespace-nowrap transition-colors disabled:cursor-not-allowed ${buttonVariants[variant]} ${buttonSizes[size]} ${className}`}
      {...props}
    />
  );
}

export function IconButton({
  label,
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-ground text-ink transition-colors hover:bg-accent-soft hover:text-accent-ink ${className}`}
      {...props}
    />
  );
}

function useCopy(text: string) {
  const toast = useToast();
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  const copy = async () => {
    try {
      await copyText(text);
      setCopied(true);
      toast(`Copied ${text.replace(/^https?:\/\//, '')}`);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 1500);
    } catch {
      toast('Copy failed. Select the link and copy it manually.', 'error');
    }
  };
  return { copied, copy };
}

export function CopyButton({ text, className = '' }: { text: string; className?: string }) {
  const { copied, copy } = useCopy(text);
  return (
    <IconButton label={`Copy ${text}`} onClick={copy} className={className}>
      {copied ? <CheckIcon className="text-accent-ink" /> : <CopyIcon />}
    </IconButton>
  );
}

export function CopyTextButton({ text, label = 'Copy link' }: { text: string; label?: string }) {
  const { copied, copy } = useCopy(text);
  return (
    <Button variant="secondary" size="sm" onClick={copy}>
      {copied ? <CheckIcon className="text-accent-ink" /> : <CopyIcon />}
      {copied ? 'Copied' : label}
    </Button>
  );
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <section className={`min-w-0 rounded-[22px] bg-surface p-5 shadow-soft sm:p-6 ${className}`}>{children}</section>;
}

export function CardTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-center gap-3">
      <h2 className="font-medium text-muted">{children}</h2>
      {action && <div className="ml-auto">{action}</div>}
    </div>
  );
}

export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded-xl bg-sunken ${className}`} aria-hidden="true" />;
}

export function Spinner({ label = 'Loading…' }: { label?: string }) {
  return (
    <div role="status" className="flex items-center justify-center gap-2 py-10 text-sm text-muted">
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-line border-t-accent" />
      {label}
    </div>
  );
}

export function ErrorBanner({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div
      role="alert"
      className="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-danger-soft px-4 py-3 text-sm font-medium text-danger"
    >
      <span>{message}</span>
      {onRetry && (
        <button type="button" onClick={onRetry} className="rounded-full px-3 py-1 font-semibold underline-offset-2 hover:underline">
          Try again
        </button>
      )}
    </div>
  );
}

export function EmptyState({ title, children, icon }: { title: string; children?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="flex flex-col items-center rounded-[22px] border-2 border-dashed border-line px-6 py-14 text-center">
      {icon && (
        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-accent-soft text-accent-ink">{icon}</div>
      )}
      <p className="font-display text-xl font-bold">{title}</p>
      {children && <div className="mt-1.5 max-w-sm text-muted">{children}</div>}
    </div>
  );
}

export function Field({
  label,
  hint,
  error,
  htmlFor,
  children,
}: {
  label: string;
  hint?: string;
  error?: string | null;
  htmlFor: string;
  children: ReactNode;
}) {
  return (
    <div>
      <label htmlFor={htmlFor} className="flex flex-wrap items-baseline gap-x-2 text-sm font-semibold">
        {label}
        {hint && <span className="text-xs font-normal text-faint">{hint}</span>}
      </label>
      <div className="mt-1.5">{children}</div>
      {error && (
        <p role="alert" className="mt-1.5 text-sm font-medium text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

export const inputClass =
  'block h-11 w-full rounded-xl border-0 bg-ground px-4 text-[15px] text-ink ring-1 ring-line ring-inset placeholder:text-faint focus:bg-surface focus:ring-2 focus:ring-accent focus:outline-none aria-[invalid=true]:ring-2 aria-[invalid=true]:ring-danger';

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
  label: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex gap-1 rounded-full bg-surface p-1 shadow-soft">
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(option.value)}
            className={`h-8 rounded-full px-3.5 text-[13px] font-semibold transition-colors ${
              active ? 'bg-accent-soft text-accent-ink' : 'text-muted hover:text-ink'
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

export function Switch({ checked, onChange, label }: { checked: boolean; onChange: (checked: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="inline-flex items-center gap-2.5 rounded-full py-1 text-sm font-medium text-muted hover:text-ink"
    >
      <span className={`relative h-6 w-10 rounded-full transition-colors ${checked ? 'bg-accent' : 'bg-line'}`}>
        <span
          className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-4' : ''}`}
        />
      </span>
      {label}
    </button>
  );
}

const TILE_COLORS = [
  'bg-accent-soft text-accent-ink',
  'bg-apricot-soft text-apricot',
  'bg-[#e3e6fb] text-[#3440a8] dark:bg-[#232846] dark:text-[#aab3f5]',
  'bg-[#f7dfe6] text-[#8e2a4a] dark:bg-[#3a1f29] dark:text-[#f0a8bf]',
];

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

export function LinkTile({ url, size = 'md' }: { url: string; size?: 'md' | 'lg' }) {
  const host = hostOf(url);
  let hash = 0;
  for (const ch of host) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  const dims = size === 'lg' ? 'h-14 w-14 rounded-2xl text-2xl' : 'h-11 w-11 rounded-[14px] text-lg';
  return (
    <span
      aria-hidden="true"
      className={`flex shrink-0 items-center justify-center font-display font-extrabold ${dims} ${TILE_COLORS[hash % TILE_COLORS.length]}`}
    >
      {host.charAt(0).toUpperCase()}
    </span>
  );
}
