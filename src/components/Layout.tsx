import { useEffect, useRef, useState } from 'react';
import { Link, Navigate, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  Bell,
  Check,
  ChevronDown,
  ClipboardList,
  Compass,
  FilePlus,
  Gauge,
  House,
  Inbox,
  LifeBuoy,
  Menu,
  Play,
  Settings,
  ShieldCheck,
  X,
  type LucideIcon,
} from 'lucide-react';
import type { Role } from '../domain/types';
import { PERSONAS } from '../services';
import { useAppStore } from '../store/appStore';
import { Toaster } from './Toaster';
import { Avatar, cx } from './ui';
import { NotificationList } from '../features/claims/NotificationList';
import { CopilotHost } from '../features/copilot/CopilotHost';
import { TourHost } from '../features/tour/TourHost';
import { startTour } from '../features/tour/tourStore';
import { shouldRedirectToWelcome } from '../features/welcome/flags';
import { HOME_FOR_ROLE } from '../features/welcome/roleHome';

const ROLE_LABELS: Record<Role, string> = {
  CLAIMANT: 'Claimant',
  PROVIDER: 'Healthcare provider',
  ADJUSTER: 'Claims adjuster',
  ADMIN: 'Operations admin',
};

const ROLE_TONES = { CLAIMANT: 'teal', PROVIDER: 'sky', ADJUSTER: 'indigo', ADMIN: 'amber' } as const;

// Few places to go, on purpose. Filing a claim is the header button, and Help is the footer link and Ease.
const NAV: Record<Role, { to: string; label: string; icon: LucideIcon; end?: boolean }[]> = {
  CLAIMANT: [
    { to: '/', label: 'Home', icon: House, end: true },
    { to: '/claims', label: 'My claims', icon: ClipboardList },
  ],
  PROVIDER: [
    { to: '/', label: 'Home', icon: House, end: true },
    { to: '/claims', label: 'My claims', icon: ClipboardList },
  ],
  ADJUSTER: [{ to: '/queue', label: 'Work queue', icon: Inbox }],
  ADMIN: [
    { to: '/admin', label: 'Dashboard', icon: Gauge, end: true },
    { to: '/queue', label: 'Work queue', icon: Inbox },
    { to: '/admin/config', label: 'Rules & SLA', icon: Settings },
  ],
};

/** The one main thing a claimant or provider does, always a click away. */
const FILE_ACTION: Partial<Record<Role, string>> = { CLAIMANT: 'File a claim', PROVIDER: 'Submit a claim' };

export { HOME_FOR_ROLE };

/** Closes a popover on outside click or Escape. */
function useDismiss(open: boolean, close: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && close();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close();
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, close]);
  return ref;
}

/** Lets a judge flip between the four people in the demo. Lives in the profile menu, like a real account switcher. */
function PersonaMenu() {
  const { role, setRole } = useAppStore();
  const navigate = useNavigate();
  const { pathname, search, hash } = useLocation();
  const [open, setOpen] = useState(false);
  const ref = useDismiss(open, () => setOpen(false));
  const persona = PERSONAS[role];
  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2.5 rounded-xl py-1 pl-1 pr-2 transition hover:bg-slate-100"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Account menu, signed in as ${persona.name}`}
        data-tour="persona-menu"
      >
        <Avatar name={persona.name} tone={ROLE_TONES[role]} />
        <span className="hidden text-left leading-tight lg:block">
          <span className="block text-sm font-semibold text-slate-900">{persona.name}</span>
          <span className="block text-xs text-slate-500">{ROLE_LABELS[role]}</span>
        </span>
        <ChevronDown className={cx('h-4 w-4 text-slate-400 transition', open && 'rotate-180')} aria-hidden />
      </button>
      {open && (
        <div role="menu" aria-label="Switch persona" className="rise absolute right-0 z-50 mt-2 w-[min(92vw,320px)] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-pop">
          <div className="border-b border-slate-100 px-4 py-3">
            <p className="text-sm font-semibold text-slate-900">Switch persona</p>
            <p className="text-xs text-slate-500">See ClaimEase through each person&apos;s eyes.</p>
          </div>
          <ul className="p-1.5">
            {(Object.keys(ROLE_LABELS) as Role[]).map((r) => (
              <li key={r}>
                <button
                  type="button"
                  role="menuitemradio"
                  aria-checked={r === role}
                  onClick={() => {
                    setRole(r);
                    setOpen(false);
                    navigate(HOME_FOR_ROLE[r]);
                  }}
                  className={cx('flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left transition', r === role ? 'bg-brand-50' : 'hover:bg-slate-50')}
                >
                  <Avatar name={PERSONAS[r].name} tone={ROLE_TONES[r]} />
                  <span className="min-w-0 flex-1 leading-tight">
                    <span className="block text-sm font-semibold text-slate-900">{PERSONAS[r].name}</span>
                    <span className="block truncate text-xs text-slate-500">
                      {ROLE_LABELS[r]} · {PERSONAS[r].title}
                    </span>
                  </span>
                  {r === role && <Check className="h-4 w-4 text-brand-600" aria-hidden />}
                </button>
              </li>
            ))}
          </ul>
          <div className="border-t border-slate-100 p-1.5">
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                navigate('/welcome', { state: { from: `${pathname}${search}${hash}` } });
              }}
              className="flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              <Compass className="h-4 w-4 text-slate-500" aria-hidden /> Welcome screen
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                startTour(role);
              }}
              className="flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              <Play className="h-4 w-4 text-slate-500" aria-hidden /> Take the tour
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function NotificationBell() {
  const notifications = useAppStore((s) => s.notifications);
  const unread = notifications.filter((n) => !n.read).length;
  const [open, setOpen] = useState(false);
  const ref = useDismiss(open, () => setOpen(false));
  const location = useLocation();
  useEffect(() => setOpen(false), [location.pathname]);
  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="relative rounded-xl p-2.5 text-slate-600 transition hover:bg-slate-100 hover:text-slate-900"
        aria-label={`Notifications${unread ? `, ${unread} unread` : ''}`}
        aria-expanded={open}
        aria-haspopup="true"
      >
        <Bell className="h-5 w-5" />
        {unread > 0 && (
          <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-brand-600 px-1 text-[10px] font-bold text-white ring-2 ring-white">{unread}</span>
        )}
      </button>
      {open && (
        <div className="rise absolute right-0 z-50 mt-2 w-[min(92vw,400px)] overflow-hidden rounded-2xl border border-slate-200 bg-white text-slate-900 shadow-pop">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <p className="text-sm font-semibold">Notifications</p>
            <Link to="/notifications" className="text-xs font-semibold text-brand-700 hover:underline">
              View all
            </Link>
          </div>
          <div className="max-h-96 overflow-y-auto">
            <NotificationList limit={6} compact />
          </div>
        </div>
      )}
    </div>
  );
}

export function Layout() {
  const { role, loaded } = useAppStore();
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();
  useEffect(() => setMobileOpen(false), [location.pathname]);
  // A first-time visitor lands on the welcome screen once. Decided on first render so there is no flash of the app.
  const [sendToWelcome] = useState(() => shouldRedirectToWelcome(location.pathname));
  const persona = PERSONAS[role];
  const nav = NAV[role];
  const fileLabel = FILE_ACTION[role];
  const onFilePage = location.pathname === '/file' || location.pathname.startsWith('/file/');

  if (sendToWelcome) return <Navigate to="/welcome" replace state={{ from: `${location.pathname}${location.search}${location.hash}` }} />;

  return (
    <div className="flex min-h-screen flex-col">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-2 focus:top-2 focus:z-[70] focus:rounded-lg focus:bg-white focus:px-3 focus:py-2 focus:text-sm focus:shadow">
        Skip to content
      </a>
      <header className="no-print sticky top-0 z-40 border-b border-slate-200/70 bg-white/85 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-2 px-4 sm:gap-3 sm:px-6">
          <button type="button" className="rounded-xl p-2 text-slate-600 hover:bg-slate-100 md:hidden" onClick={() => setMobileOpen((o) => !o)} aria-label="Toggle navigation menu" aria-expanded={mobileOpen} data-tour="claims-nav">
            {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
          <Link to={HOME_FOR_ROLE[role]} className="flex items-center gap-2.5">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-brand-400 to-brand-700 text-white shadow-sm">
              <ShieldCheck className="h-5 w-5" aria-hidden />
            </span>
            <span className="hidden text-lg font-extrabold tracking-tight text-slate-900 min-[460px]:inline">ClaimEase</span>
          </Link>
          <nav aria-label="Main" className="ml-6 hidden items-center gap-1 md:flex">
            {nav.map((n) => (
              <NavLink
                key={n.to}
                to={n.to}
                end={n.end}
                data-tour={n.to === '/claims' ? 'claims-nav' : undefined}
                className={({ isActive }) => cx('rounded-xl px-3.5 py-2 text-sm font-semibold transition', isActive ? 'bg-brand-50 text-brand-800' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900')}
              >
                {n.label}
              </NavLink>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-1 sm:gap-2">
            {fileLabel && !onFilePage && (
              <Link
                to="/file"
                aria-label={fileLabel}
                className="inline-flex items-center gap-2 rounded-xl bg-brand-600 p-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-brand-700 active:bg-brand-800 sm:px-4"
              >
                <FilePlus className="h-5 w-5 sm:h-4 sm:w-4" aria-hidden />
                <span className="hidden sm:inline">{fileLabel}</span>
              </Link>
            )}
            <Link
              to="/glossary"
              aria-label="Help and glossary"
              className="inline-flex items-center gap-2 rounded-xl p-2.5 text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900"
            >
              <LifeBuoy className="h-5 w-5" aria-hidden />
              <span className="hidden lg:inline">Help</span>
            </Link>
            <NotificationBell />
            <PersonaMenu />
          </div>
        </div>
        {mobileOpen && (
          <nav aria-label="Mobile" className="border-t border-slate-100 bg-white px-4 pb-3 pt-2 md:hidden">
            <p className="py-2 text-xs text-slate-500">
              Signed in as <span className="font-semibold text-slate-800">{persona.name}</span> · {ROLE_LABELS[role]}
            </p>
            {nav.map((n) => (
              <NavLink
                key={n.to}
                to={n.to}
                end={n.end}
                className={({ isActive }) => cx('flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-semibold', isActive ? 'bg-brand-50 text-brand-800' : 'text-slate-700 hover:bg-slate-50')}
              >
                <n.icon className="h-4 w-4" aria-hidden /> {n.label}
              </NavLink>
            ))}
            <NavLink to="/notifications" className="flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50">
              <Bell className="h-4 w-4" aria-hidden /> Notifications
            </NavLink>
            <NavLink to="/glossary" className="flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50">
              <LifeBuoy className="h-4 w-4" aria-hidden /> Help and glossary
            </NavLink>
          </nav>
        )}
      </header>
      <main id="main" className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-6 sm:py-10">
        {loaded ? (
          <div key={location.pathname} className="rise">
            <Outlet />
          </div>
        ) : (
          <LoadingShell />
        )}
      </main>
      <footer className="no-print px-4 py-6 text-center text-xs text-slate-500">
        <Link to="/glossary" className="font-semibold text-slate-600 underline-offset-2 hover:text-slate-900 hover:underline">
          Help and glossary
        </Link>
        <span aria-hidden> · </span>
        ClaimEase uses sample data for demonstration. It is not insurance, legal or medical advice.
      </footer>
      <Toaster />
      <CopilotHost />
      <TourHost />
    </div>
  );
}

function LoadingShell() {
  return (
    <div className="space-y-4" role="status" aria-label="Loading">
      <div className="h-9 w-72 animate-pulse rounded-lg bg-slate-200/80" />
      <div className="grid gap-4 sm:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-28 animate-pulse rounded-2xl bg-slate-200/80" />
        ))}
      </div>
      <div className="h-64 animate-pulse rounded-2xl bg-slate-200/80" />
    </div>
  );
}

export { ROLE_LABELS };
