import { NavLink, Outlet } from 'react-router';
import { api } from '../api/client';
import { useTheme, type Theme } from '../lib/theme';
import { useApi } from '../lib/useApi';

const THEME_ORDER: Theme[] = ['system', 'light', 'dark'];
const THEME_LABEL: Record<Theme, string> = { system: 'Auto', light: 'Light', dark: 'Dark' };
const THEME_ICON: Record<Theme, string> = { system: '◐', light: '☀', dark: '☾' };

function ThemeToggle() {
  const [theme, setTheme] = useTheme();
  const next = THEME_ORDER[(THEME_ORDER.indexOf(theme) + 1) % THEME_ORDER.length] ?? 'system';
  return (
    <button
      type="button"
      onClick={() => setTheme(next)}
      className="rounded-md px-2 py-1 text-sm text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
      title={`Theme: ${THEME_LABEL[theme]} (click for ${THEME_LABEL[next]})`}
      aria-label={`Theme: ${THEME_LABEL[theme]}. Switch to ${THEME_LABEL[next]}.`}
    >
      <span aria-hidden="true">{THEME_ICON[theme]}</span>
      <span className="ml-1 hidden sm:inline">{THEME_LABEL[theme]}</span>
    </button>
  );
}

const navClass = ({ isActive }: { isActive: boolean }) =>
  `rounded-md px-2.5 py-1 text-sm font-medium ${
    isActive
      ? 'bg-slate-100 text-slate-900 dark:bg-slate-800 dark:text-white'
      : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
  }`;

export function Layout() {
  const me = useApi(() => api.me(), []);

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/90 backdrop-blur dark:border-slate-800 dark:bg-slate-950/90">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-2.5">
          <NavLink to="/" className="text-lg font-bold tracking-tight text-indigo-600 dark:text-indigo-400">
            Hop
          </NavLink>
          <nav className="flex gap-1">
            <NavLink to="/" end className={navClass}>
              Overview
            </NavLink>
            <NavLink to="/links" className={navClass}>
              Links
            </NavLink>
          </nav>
          <div className="ml-auto flex min-w-0 items-center gap-2">
            {me.data && (
              <span className="hidden min-w-0 truncate text-sm text-slate-500 sm:block dark:text-slate-400" title={me.data.email}>
                Signed in as <span className="font-medium text-slate-700 dark:text-slate-200">{me.data.email}</span>
              </span>
            )}
            <ThemeToggle />
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}
