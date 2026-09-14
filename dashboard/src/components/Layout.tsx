import { NavLink, Outlet } from 'react-router';
import { api } from '../api/client';
import { useTheme, type Theme } from '../lib/theme';
import { useApi } from '../lib/useApi';
import { AutoThemeIcon, HopMark, MoonIcon, SunIcon } from './icons';
import { ToastProvider } from './toast';

const THEME_ORDER: Theme[] = ['system', 'light', 'dark'];
const THEME_LABEL: Record<Theme, string> = { system: 'Match system', light: 'Light', dark: 'Dark' };

function ThemeToggle() {
  const [theme, setTheme] = useTheme();
  const next = THEME_ORDER[(THEME_ORDER.indexOf(theme) + 1) % THEME_ORDER.length] ?? 'system';
  const icon = theme === 'light' ? <SunIcon /> : theme === 'dark' ? <MoonIcon /> : <AutoThemeIcon />;
  return (
    <button
      type="button"
      onClick={() => setTheme(next)}
      title={`Theme: ${THEME_LABEL[theme]}`}
      aria-label={`Theme: ${THEME_LABEL[theme]}. Switch to ${THEME_LABEL[next]}.`}
      className="flex h-10 w-10 items-center justify-center rounded-full bg-surface text-ink shadow-soft hover:bg-sunken"
    >
      {icon}
    </button>
  );
}

const navClass = ({ isActive }: { isActive: boolean }) =>
  `flex-1 rounded-full px-4 py-2 text-center text-sm transition-colors sm:flex-none sm:px-[18px] ${
    isActive ? 'bg-ink font-semibold text-ground' : 'font-medium text-muted hover:text-ink'
  }`;

export function Layout() {
  const me = useApi(() => api.me(), []);
  const email = me.data?.email;

  return (
    <ToastProvider>
      <div className="min-h-screen">
        <header className="mx-auto flex max-w-6xl flex-wrap items-center gap-3 px-4 pt-5 pb-2 sm:gap-6 sm:px-8 sm:pt-6">
          <NavLink to="/" className="flex items-center gap-2.5" aria-label="Hop overview">
            <HopMark />
            <span className="font-display text-[22px] font-extrabold tracking-tight">Hop</span>
          </NavLink>
          <nav className="order-last flex w-full gap-1 rounded-full bg-surface p-1 shadow-soft sm:order-none sm:w-auto">
            <NavLink to="/" end className={navClass}>
              Overview
            </NavLink>
            <NavLink to="/links" className={navClass}>
              Links
            </NavLink>
          </nav>
          <div className="ml-auto flex items-center gap-2.5">
            <ThemeToggle />
            {email && (
              <div
                className="flex h-10 items-center gap-2.5 rounded-full bg-surface p-1 shadow-soft sm:pr-4"
                title={`Signed in as ${email}`}
              >
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-apricot-soft font-semibold text-apricot uppercase">
                  {email.charAt(0)}
                </span>
                <span className="hidden max-w-52 truncate text-sm font-medium sm:block">{email}</span>
              </div>
            )}
          </div>
        </header>
        <main className="mx-auto max-w-6xl px-4 pt-4 pb-16 sm:px-8 sm:pt-6">
          <Outlet />
        </main>
      </div>
    </ToastProvider>
  );
}
