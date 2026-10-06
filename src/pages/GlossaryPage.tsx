import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { BookOpen, Search } from 'lucide-react';
import { GLOSSARY } from '../components/glossary';
import { cx, PageHeader } from '../components/ui';
import { FASTER_CLAIM_TIPS } from '../features/intake/TipsPanel';

export default function GlossaryPage() {
  const { hash } = useLocation();
  const [q, setQ] = useState('');
  const active = hash.slice(1);
  useEffect(() => {
    if (active) document.getElementById(active)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [active]);
  const entries = Object.entries(GLOSSARY)
    .filter(([, e]) => !q || `${e.term} ${e.short} ${e.long}`.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => a[1].term.localeCompare(b[1].term));

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Help & glossary" subtitle="Plain-language explanations of common insurance terms. Look for dotted underlines across the app." />
      <div className="relative mb-6">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
        <label htmlFor="glossary-search" className="sr-only">
          Search glossary
        </label>
        <input id="glossary-search" className="input pl-9" placeholder="Search terms…" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <dl className="space-y-3">
        {entries.map(([id, e]) => (
          <div key={id} id={id} className={cx('card scroll-mt-24 p-4', active === id && 'ring-2 ring-brand-500')}>
            <dt className="flex items-center gap-2 text-base font-semibold text-slate-900">
              <BookOpen className="h-4 w-4 text-brand-600" aria-hidden /> {e.term}
            </dt>
            <dd className="mt-1 text-sm font-medium text-slate-700">{e.short}</dd>
            <dd className="mt-1 text-sm text-slate-600">{e.long}</dd>
          </div>
        ))}
        {!entries.length && <p className="text-sm text-slate-500">No terms match “{q}”.</p>}
      </dl>

      <section className="card mt-8 p-5" aria-labelledby="tips-title">
        <h2 id="tips-title" className="text-base font-semibold text-slate-900">
          Tips for a faster claim
        </h2>
        <ol className="mt-3 grid gap-3 sm:grid-cols-2">
          {FASTER_CLAIM_TIPS.map((t, i) => (
            <li key={t.title} className="text-sm">
              <span className="font-semibold text-slate-800">
                {i + 1}. {t.title}
              </span>
              <span className="block text-slate-600">{t.body}</span>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
