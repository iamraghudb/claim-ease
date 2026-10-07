import { CircleAlert, CircleCheck, Info, X } from 'lucide-react';
import { useToastStore } from '../store/toastStore';
import { cx } from './ui';

export function Toaster() {
  const { toasts, dismiss } = useToastStore();
  return (
    <div aria-live="polite" aria-atomic="false" className="no-print pointer-events-none fixed inset-x-0 bottom-0 z-[60] flex flex-col items-center gap-2 p-4 sm:items-start">
      {toasts.map((t) => {
        const Icon = t.kind === 'success' ? CircleCheck : t.kind === 'error' ? CircleAlert : Info;
        return (
          <div
            key={t.id}
            role={t.kind === 'error' ? 'alert' : 'status'}
            className={cx(
              'pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-2xl border bg-white p-3.5 shadow-pop',
              t.kind === 'success' ? 'border-emerald-200' : t.kind === 'error' ? 'border-red-200' : 'border-brand-200',
            )}
          >
            <Icon className={cx('mt-0.5 h-5 w-5 shrink-0', t.kind === 'success' ? 'text-emerald-600' : t.kind === 'error' ? 'text-red-600' : 'text-brand-600')} aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-slate-900">{t.title}</p>
              {t.message && <p className="mt-0.5 text-sm text-slate-600">{t.message}</p>}
            </div>
            <button type="button" onClick={() => dismiss(t.id)} className="rounded p-0.5 text-slate-400 hover:text-slate-700" aria-label="Dismiss notification">
              <X className="h-4 w-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
