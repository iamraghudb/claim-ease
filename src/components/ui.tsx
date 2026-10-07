import { useEffect, useId, useRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { Info, LoaderCircle, X, type LucideIcon } from 'lucide-react';
import { Link, type LinkProps } from 'react-router-dom';

export function cx(...classes: (string | false | null | undefined)[]) {
  return classes.filter(Boolean).join(' ');
}

// ---------- Button ----------

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'success' | 'ai';

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-gradient-to-b from-brand-500 to-brand-600 text-white shadow-[0_1px_0_0_rgb(255_255_255/0.25)_inset,0_6px_16px_-6px_rgb(13_148_136/0.6)] hover:from-brand-600 hover:to-brand-700 active:from-brand-700 active:to-brand-800 disabled:from-brand-600/40 disabled:to-brand-600/40 disabled:shadow-none',
  secondary: 'bg-white text-slate-800 shadow-sm ring-1 ring-inset ring-slate-300 hover:bg-slate-50 hover:ring-slate-400 disabled:text-slate-400 disabled:shadow-none',
  ghost: 'text-slate-700 hover:bg-slate-100 disabled:text-slate-400',
  danger: 'bg-red-600 text-white shadow-sm hover:bg-red-700 disabled:bg-red-600/40 disabled:shadow-none',
  success: 'bg-emerald-600 text-white shadow-sm hover:bg-emerald-700 disabled:bg-emerald-600/40 disabled:shadow-none',
  ai: 'bg-gradient-to-b from-ai-500 to-ai-600 text-white shadow-[0_1px_0_0_rgb(255_255_255/0.25)_inset,0_6px_16px_-6px_rgb(99_102_241/0.6)] hover:from-ai-600 hover:to-ai-700 active:from-ai-700 active:to-ai-800 disabled:from-ai-600/40 disabled:to-ai-600/40 disabled:shadow-none',
};

const BUTTON_BASE = 'inline-flex items-center justify-center gap-2 font-semibold transition duration-150 active:scale-[0.98] disabled:cursor-not-allowed disabled:active:scale-100';
const SIZES = { sm: 'rounded-lg px-3 py-1.5 text-xs', md: 'rounded-xl px-4 py-2.5 text-sm' } as const;

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: 'sm' | 'md';
  icon?: LucideIcon;
  loading?: boolean;
}

export function Button({ variant = 'primary', size = 'md', icon: Icon, loading, className, children, disabled, ...rest }: ButtonProps) {
  return (
    <button type="button" {...rest} disabled={disabled || loading} className={cx(BUTTON_BASE, SIZES[size], VARIANTS[variant], className)}>
      {loading ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden /> : Icon ? <Icon className="h-4 w-4" aria-hidden /> : null}
      {children}
    </button>
  );
}

export function ButtonLink({ variant = 'primary', size = 'md', icon: Icon, className, children, ...rest }: LinkProps & { variant?: Variant; size?: 'sm' | 'md'; icon?: LucideIcon }) {
  return (
    <Link {...rest} className={cx(BUTTON_BASE, SIZES[size], VARIANTS[variant], className)}>
      {Icon && <Icon className="h-4 w-4" aria-hidden />}
      {children}
    </Link>
  );
}

// ---------- Card ----------

export function Card({ title, icon: Icon, actions, children, className, bodyClassName }: {
  title?: ReactNode;
  icon?: LucideIcon;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section className={cx('card', className)}>
      {(title || actions) && (
        <header className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-5 py-3.5">
          <h2 className="flex items-center gap-2.5 text-sm font-semibold text-slate-900">
            {Icon && (
              <span className="grid h-7 w-7 place-items-center rounded-lg bg-gradient-to-br from-brand-50 to-ai-50 text-brand-600 ring-1 ring-brand-100">
                <Icon className="h-4 w-4" aria-hidden />
              </span>
            )}
            {title}
          </h2>
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className={cx('p-5', bodyClassName)}>{children}</div>
    </section>
  );
}

// ---------- Form fields ----------

export function Field({ label, hint, error, children, required, htmlFor }: {
  label: ReactNode;
  hint?: ReactNode;
  error?: string;
  children: ReactNode;
  required?: boolean;
  htmlFor?: string;
}) {
  return (
    <div>
      <label className="label" htmlFor={htmlFor}>
        {label}
        {required && <span className="text-red-600" aria-hidden> *</span>}
      </label>
      {children}
      {hint && !error && <p className="mt-1.5 text-xs text-slate-500">{hint}</p>}
      {error && (
        <p className="mt-1.5 text-xs font-medium text-red-600" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

/** Checkbox that lets the filer flag a value as estimated instead of guessing. */
export function EstimatedToggle({ checked, onChange, id }: { checked: boolean; onChange: (v: boolean) => void; id?: string }) {
  const auto = useId();
  const cid = id ?? auto;
  return (
    <label htmlFor={cid} className="mt-2 inline-flex cursor-pointer items-center gap-2 text-xs text-slate-600">
      <input id={cid} type="checkbox" className="h-4 w-4 rounded border-slate-300 accent-amber-500" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className={checked ? 'font-semibold text-amber-700' : ''}>I&apos;m not sure of this value</span>
    </label>
  );
}

// ---------- Feedback ----------

export function Spinner({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-10 text-sm text-slate-500" role="status" aria-live="polite">
      <LoaderCircle className="h-5 w-5 animate-spin text-brand-600" aria-hidden />
      {label}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cx('animate-pulse rounded-lg bg-slate-200/80', className)} aria-hidden />;
}

export function EmptyState({ icon: Icon, title, message, action }: { icon: LucideIcon; title: string; message?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white/60 px-6 py-14 text-center">
      <div className="mb-4 grid h-12 w-12 place-items-center rounded-2xl bg-brand-50 text-brand-600">
        <Icon className="h-6 w-6" aria-hidden />
      </div>
      <h3 className="text-base font-semibold text-slate-900">{title}</h3>
      {message && <p className="mt-1.5 max-w-sm text-sm text-slate-500">{message}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function Alert({ tone = 'info', title, children, icon: Icon }: { tone?: 'info' | 'warn' | 'error' | 'success'; title?: ReactNode; children?: ReactNode; icon?: LucideIcon }) {
  const tones = {
    info: 'border-brand-200 bg-brand-50/70 text-brand-900',
    warn: 'border-amber-200 bg-amber-50/80 text-amber-950',
    error: 'border-red-200 bg-red-50/80 text-red-900',
    success: 'border-emerald-200 bg-emerald-50/80 text-emerald-950',
  };
  return (
    <div className={cx('flex gap-3 rounded-xl border p-3.5 text-sm', tones[tone])} role={tone === 'error' ? 'alert' : undefined}>
      {Icon && <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />}
      <div className="min-w-0">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className={title ? 'mt-0.5' : ''}>{children}</div>}
      </div>
    </div>
  );
}

export function Pill({ children, tone = 'slate', title }: { children: ReactNode; tone?: 'slate' | 'blue' | 'green' | 'amber' | 'red' | 'purple'; title?: string }) {
  const tones = {
    slate: 'bg-slate-100 text-slate-700 ring-slate-200',
    blue: 'bg-brand-50 text-brand-700 ring-brand-200',
    green: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
    amber: 'bg-amber-50 text-amber-800 ring-amber-200',
    red: 'bg-red-50 text-red-700 ring-red-200',
    purple: 'bg-ai-50 text-ai-700 ring-ai-200',
  };
  return (
    <span title={title} className={cx('inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset', tones[tone])}>
      {children}
    </span>
  );
}

/** A small (i) that explains something on hover or keyboard focus. Replaces repeated disclaimer paragraphs. */
export function InfoTip({ children, label = 'More information' }: { children: ReactNode; label?: string }) {
  const tipId = useId();
  return (
    <span className="group relative inline-flex align-middle">
      <button type="button" aria-label={label} aria-describedby={tipId} className="rounded-full p-0.5 text-slate-400 transition hover:text-slate-700 focus-visible:text-slate-700">
        <Info className="h-3.5 w-3.5" aria-hidden />
      </button>
      <span
        id={tipId}
        role="tooltip"
        className="pointer-events-none absolute bottom-full left-1/2 z-30 mb-2 hidden w-60 max-w-[calc(100vw-1.5rem)] -translate-x-1/2 rounded-xl bg-slate-900 px-3 py-2 text-left text-xs font-normal leading-snug text-white shadow-pop group-focus-within:block group-hover:block"
      >
        {children}
      </span>
    </span>
  );
}

// ---------- People & numbers ----------

const AVATAR_TONES = {
  teal: 'from-brand-400 to-brand-600',
  sky: 'from-sky-400 to-sky-600',
  indigo: 'from-ai-400 to-ai-600',
  amber: 'from-amber-400 to-orange-500',
  slate: 'from-slate-400 to-slate-600',
} as const;

export function Avatar({ name, tone = 'teal', size = 'md' }: { name: string; tone?: keyof typeof AVATAR_TONES; size?: 'sm' | 'md' | 'lg' }) {
  const initials = name
    .replace(/^Dr\.?\s+/i, '')
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('');
  return (
    <span
      aria-hidden
      className={cx(
        'grid shrink-0 place-items-center rounded-full bg-gradient-to-br font-bold text-white',
        AVATAR_TONES[tone],
        size === 'sm' ? 'h-7 w-7 text-[11px]' : size === 'lg' ? 'h-11 w-11 text-base' : 'h-9 w-9 text-xs',
      )}
    >
      {initials}
    </span>
  );
}

/** A headline number with a label: used for dashboards and "at a glance" rows. */
export function StatCard({ label, value, hint, icon: Icon, tone = 'brand' }: { label: string; value: ReactNode; hint?: ReactNode; icon?: LucideIcon; tone?: 'brand' | 'amber' | 'emerald' | 'ai' | 'red' }) {
  const tones = {
    brand: 'bg-gradient-to-br from-brand-400 to-brand-600 text-white shadow-glow',
    amber: 'bg-gradient-to-br from-amber-400 to-orange-500 text-white shadow-[0_10px_30px_-10px_rgb(245_158_11/0.6)]',
    emerald: 'bg-gradient-to-br from-emerald-400 to-emerald-600 text-white shadow-[0_10px_30px_-10px_rgb(16_185_129/0.6)]',
    ai: 'bg-gradient-to-br from-ai-400 to-ai-600 text-white shadow-glow-ai',
    red: 'bg-gradient-to-br from-rose-400 to-red-600 text-white shadow-[0_10px_30px_-10px_rgb(225_29_72/0.6)]',
  };
  return (
    <div className="card card-hover p-5">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-medium text-slate-500">{label}</p>
        {Icon && (
          <span className={cx('grid h-10 w-10 place-items-center rounded-xl', tones[tone])}>
            <Icon className="h-5 w-5" aria-hidden />
          </span>
        )}
      </div>
      <p className="mt-3 text-3xl font-extrabold tabular-nums tracking-tight text-slate-900">{value}</p>
      {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
    </div>
  );
}

// ---------- Modal ----------

export function Modal({ open, onClose, title, children, footer, size = 'md' }: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'md' | 'lg';
}) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'Tab' && ref.current) {
        const f = ref.current.querySelectorAll<HTMLElement>('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
        if (!f.length) return;
        const first = f[0];
        const last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', onKey);
    const t = setTimeout(() => (ref.current?.querySelector<HTMLElement>('input:not([type=file]):not(.sr-only), select, textarea') ?? ref.current?.querySelector<HTMLElement>('button'))?.focus(), 10);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      clearTimeout(t);
      document.body.style.overflow = '';
      prev?.focus();
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 p-0 backdrop-blur-sm sm:items-center sm:p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={cx('rise flex max-h-[92vh] w-full flex-col rounded-t-3xl bg-white shadow-pop sm:rounded-2xl', size === 'lg' ? 'sm:max-w-2xl' : 'sm:max-w-lg')}
      >
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <h2 id={titleId} className="text-base font-bold text-slate-900">
            {title}
          </h2>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100" aria-label="Close dialog">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="overflow-y-auto px-6 py-5">{children}</div>
        {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-slate-100 px-6 py-4">{footer}</div>}
      </div>
    </div>
  );
}

// ---------- Tabs ----------

export function Tabs<T extends string>({ tabs, value, onChange, label }: { tabs: { value: T; label: ReactNode }[]; value: T; onChange: (v: T) => void; label: string }) {
  return (
    <div className="relative min-w-0 max-w-full overflow-x-auto">
      <div role="tablist" aria-label={label} className="inline-flex gap-1 rounded-xl bg-slate-100 p-1">
        {tabs.map((t) => (
          <button
            key={t.value}
            role="tab"
            type="button"
            aria-selected={value === t.value}
            onClick={() => onChange(t.value)}
            onKeyDown={(e) => {
              const i = tabs.findIndex((x) => x.value === value);
              if (e.key === 'ArrowRight') onChange(tabs[(i + 1) % tabs.length].value);
              if (e.key === 'ArrowLeft') onChange(tabs[(i - 1 + tabs.length) % tabs.length].value);
            }}
            className={cx(
              'whitespace-nowrap rounded-lg px-3.5 py-1.5 text-sm font-semibold transition',
              value === t.value ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800',
            )}
          >
            {t.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function PageHeader({ title, subtitle, actions, back }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; back?: ReactNode }) {
  return (
    <div className="mb-7">
      {back && <div className="mb-3">{back}</div>}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 sm:text-3xl">{title}</h1>
          {subtitle && <div className="mt-1.5 text-sm text-slate-600 sm:text-base">{subtitle}</div>}
        </div>
        {actions && <div className="no-print flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </div>
  );
}

export function DescriptionList({ items, cols = 2 }: { items: { label: ReactNode; value: ReactNode }[]; cols?: 1 | 2 | 3 }) {
  return (
    <dl className={cx('grid gap-x-8 gap-y-4', cols === 3 ? 'sm:grid-cols-3' : cols === 2 ? 'sm:grid-cols-2' : '')}>
      {items.map((it, i) => (
        <div key={i} className="min-w-0">
          <dt className="eyebrow">{it.label}</dt>
          <dd className="mt-1 break-words text-sm font-medium text-slate-900">{it.value ?? '—'}</dd>
        </div>
      ))}
    </dl>
  );
}
