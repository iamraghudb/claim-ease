import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  Bell,
  BookOpen,
  ClipboardList,
  FilePlus,
  Gauge,
  House,
  Inbox,
  Menu,
  Settings,
  ShieldCheck,
  X,
  type LucideIcon,
} from 'lucide-react';
import type { Role } from '../domain/types';
import { PERSONAS } from '../services';
import { useAppStore } from '../store/appStore';
import { Toaster } from './Toaster';
import { cx } from './ui';
import { NotificationList } from '../features/claims/NotificationList';

const ROLE_LABELS: Record<Role, string> = {
  CLAIMANT: 'Claimant',
  PROVIDER: 'Healthcare Provider',
  ADJUSTER: 'Adjuster / Examiner',
  ADMIN: 'Admin',
};

const NAV: Record<Role, { to: string; label: string; icon: LucideIcon; end?: boolean }[]> = {
  CLAIMANT: [
    { to: '/', label: 'Home', icon: House, end: true },
    { to: '/file', label: 'File a claim', icon: FilePlus },
    { to: '/claims', label: 'My claims', icon: ClipboardList },
    { to: '/glossary', label: 'Help', icon: BookOpen },
  ],
  PROVIDER: [
    { to: '/', label: 'Home', icon: House, end: true },
    { to: '/file', label: 'Submit claim', icon: FilePlus },
    { to: '/claims', label: 'Submitted claims', icon: ClipboardList },
    { to: '/glossary', label: 'Help', icon: BookOpen },
  ],
  ADJUSTER: [
    { to: '/queue', label: 'Work queue', icon: Inbox },
    { to: '/glossary', label: 'Help', icon: BookOpen },
  ],
  ADMIN: [
    { to: '/admin', label: 'Dashboard', icon: Gauge, end: true },
    { to: '/queue', label: 'Work queue', icon: Inbox },
    { to: '/admin/config', label: 'Rules & SLA', icon: Settings },
    { to: '/glossary', label: 'Help', icon: BookOpen },
  ],
};

export const HOME_FOR_ROLE: Record<Role, string> = { CLAIMANT: '/', PROVIDER: '/', ADJUSTER: '/queue', ADMIN: '/admin' };

function RoleSwitcher() {
  const { role, setRole } = useAppStore();
  const navigate = useNavigate();
  return (
    <div className="flex items-center gap-2">
      <label htmlFor="role-switcher" className="hidden text-xs font-medium text-brand-100 lg:block">
        Viewing as
      </label>
      <select
        id="role-switcher"
        value={role}
        onChange={(e) => {
          const r = e.target.value as Role;
          setRole(r);
          navigate(HOME_FOR_ROLE[r]);
        }}
        className="w-32 rounded-lg border border-white/20 bg-white/10 py-1.5 pl-2 pr-7 text-xs sm:w-auto sm:text-sm font-medium text-white focus:outline-none focus:ring-2 focus:ring-white/60 [&>option]:text-slate-900"
        aria-label="Switch demo role"
      >
        {(Object.keys(ROLE_LABELS) as Role[]).map((r) => (
          <option key={r} value={r}>
            {ROLE_LABELS[r]}
          </option>
        ))}
      </select>
    </div>
  );
}

function NotificationBell() {
  const notifications = useAppStore((s) => s.notifications);
  const unread = notifications.filter((n) => !n.read).length;
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const location = useLocation();
  useEffect(() => setOpen(false), [location.pathname]);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);
  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="relative rounded-lg p-2 text-white hover:bg-white/10"
        aria-label={`Notifications${unread ? `, ${unread} unread` : ''}`}
        aria-expanded={open}
        aria-haspopup="true"
      >
        <Bell className="h-5 w-5" />
        {unread > 0 && (
          <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-amber-400 px-1 text-[10px] font-bold text-slate-900">{unread}</span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 z-50 mt-2 w-[min(92vw,380px)] overflow-hidden rounded-xl border border-slate-200 bg-white text-slate-900 shadow-xl">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2.5">
            <p className="text-sm font-semibold">Notifications</p>
            <Link to="/notifications" className="text-xs font-medium text-brand-700 hover:underline">
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
  const persona = PERSONAS[role];
  const nav = NAV[role];

  return (
    <div className="flex min-h-screen flex-col">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-2 focus:top-2 focus:z-[70] focus:rounded focus:bg-white focus:px-3 focus:py-2 focus:text-sm focus:shadow">
        Skip to content
      </a>
      <header className="no-print sticky top-0 z-40 bg-brand-900 text-white shadow">
        <div className="mx-auto flex h-14 max-w-7xl items-center gap-2 px-4 sm:gap-3">
          <button type="button" className="rounded-lg p-1.5 hover:bg-white/10 md:hidden" onClick={() => setMobileOpen((o) => !o)} aria-label="Toggle navigation menu" aria-expanded={mobileOpen}>
            {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
          <Link to={HOME_FOR_ROLE[role]} className="flex items-center gap-2 font-bold tracking-tight">
            <span className="rounded-lg bg-white/15 p-1">
              <ShieldCheck className="h-5 w-5" aria-hidden />
            </span>
            <span className="hidden min-[400px]:inline">ClaimEase</span>
          </Link>
          <nav aria-label="Main" className="ml-4 hidden items-center gap-1 md:flex">
            {nav.map((n) => (
              <NavLink
                key={n.to}
                to={n.to}
                end={n.end}
                className={({ isActive }) => cx('rounded-lg px-3 py-1.5 text-sm font-medium', isActive ? 'bg-white/15 text-white' : 'text-brand-100 hover:bg-white/10 hover:text-white')}
              >
                {n.label}
              </NavLink>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-1 sm:gap-3">
            <RoleSwitcher />
            <NotificationBell />
            <div className="hidden text-right leading-tight xl:block">
              <p className="text-sm font-medium">{persona.name}</p>
              <p className="text-xs text-brand-200">{persona.title}</p>
            </div>
          </div>
        </div>
        {mobileOpen && (
          <nav aria-label="Mobile" className="border-t border-white/10 px-4 pb-3 md:hidden">
            <p className="py-2 text-xs text-brand-200">
              Signed in as <span className="font-medium text-white">{persona.name}</span> · {persona.title}
            </p>
            {nav.map((n) => (
              <NavLink key={n.to} to={n.to} end={n.end} className={({ isActive }) => cx('flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium', isActive ? 'bg-white/15' : 'hover:bg-white/10')}>
                <n.icon className="h-4 w-4" aria-hidden /> {n.label}
              </NavLink>
            ))}
            <NavLink to="/notifications" className="flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium hover:bg-white/10">
              <Bell className="h-4 w-4" aria-hidden /> Notifications
            </NavLink>
          </nav>
        )}
        <div className="bg-amber-300 px-4 py-0.5 text-center text-[11px] font-medium text-amber-950">Hackathon demo · mock data · no real policies, payments or PHI</div>
      </header>
      <main id="main" className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:py-8">
        {loaded ? <Outlet /> : <LoadingShell />}
      </main>
      <footer className="no-print border-t border-slate-200 bg-white py-4 text-center text-xs text-slate-500">
        ClaimEase MVP · Illustrative only — not legal, regulatory, or insurance advice.
      </footer>
      <Toaster />
    </div>
  );
}

function LoadingShell() {
  return (
    <div className="space-y-4" role="status" aria-label="Loading">
      <div className="h-8 w-64 animate-pulse rounded bg-slate-200" />
      <div className="grid gap-4 sm:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-28 animate-pulse rounded-xl bg-slate-200" />
        ))}
      </div>
      <div className="h-64 animate-pulse rounded-xl bg-slate-200" />
    </div>
  );
}

export { ROLE_LABELS };
