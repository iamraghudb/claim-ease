import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { BookOpen, Lightbulb, Search, X } from 'lucide-react';
import { GLOSSARY } from '../components/glossary';
import { Button, Card, cx, EmptyState, PageHeader } from '../components/ui';
import { FASTER_CLAIM_TIPS } from '../features/intake/TipsPanel';

export default function GlossaryPage() {
  const { hash } = useLocation();
  const [q, setQ] = useState('');
  const active = hash.slice(1);
  useEffect(() => {
    if (active) document.getElementById(active)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [active]);

  const total = Object.keys(GLOSSARY).length;
  const needle = q.trim().toLowerCase();
  const entries = Object.entries(GLOSSARY)
    .filter(([, e]) => !needle || `${e.term} ${e.short} ${e.long}`.toLowerCase().includes(needle))
    .sort((a, b) => a[1].term.localeCompare(b[1].term));

  return (
    <div>
      <PageHeader title="Help & glossary" subtitle="Clear explanations of common insurance terms. Look for dotted underlines throughout the app." />

      <div className="mb-6 flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
        <div className="relative w-full sm:max-w-md">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
          <label htmlFor="glossary-search" className="sr-only">
            Search glossary
          </label>
          <input
            id="glossary-search"
            type="search"
            autoComplete="off"
            className="input pl-10 pr-10 [&::-webkit-search-cancel-button]:hidden"
            placeholder="Search terms, e.g. deductible"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === 'Escape' && setQ('')}
          />
          {q && (
            <button type="button" onClick={() => setQ('')} aria-label="Clear search" className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700">
              <X className="h-4 w-4" aria-hidden />
            </button>
          )}
        </div>
        <p className="text-sm text-slate-500" role="status" aria-live="polite">
          {needle ? `${entries.length} of ${total} terms` : `${total} terms`}
        </p>
      </div>

      {entries.length ? (
        <dl className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {entries.map(([id, e]) => (
            <div key={id} id={id} className={cx('card scroll-mt-24 p-5 transition-shadow', active === id && 'border-brand-300 bg-brand-50/40 ring-2 ring-brand-500')}>
              <dt className="flex items-center gap-3">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-600">
                  <BookOpen className="h-[18px] w-[18px]" aria-hidden />
                </span>
                <span className="text-base font-semibold text-slate-900">{e.term}</span>
              </dt>
              <dd className="mt-3 text-sm font-medium leading-relaxed text-slate-800">{e.short}</dd>
              <dd className="mt-3 border-t border-slate-100 pt-3 text-sm leading-relaxed text-slate-600">{e.long}</dd>
            </div>
          ))}
        </dl>
      ) : (
        <EmptyState
          icon={Search}
          title={`No terms match “${q.trim()}”`}
          message="Try a shorter word, or clear the search to see every term."
          action={
            <Button variant="secondary" onClick={() => setQ('')}>
              Clear search
            </Button>
          }
        />
      )}

      <Card className="mt-8" title="Tips for a faster claim" icon={Lightbulb}>
        <ol className="grid gap-x-8 gap-y-4 sm:grid-cols-2">
          {FASTER_CLAIM_TIPS.map((t, i) => (
            <li key={t.title} className="flex gap-3 text-sm">
              <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-brand-50 text-xs font-bold text-brand-700">{i + 1}</span>
              <span>
                <span className="block font-semibold text-slate-900">{t.title}</span>
                <span className="block text-slate-600">{t.body}</span>
              </span>
            </li>
          ))}
        </ol>
      </Card>
    </div>
  );
}
