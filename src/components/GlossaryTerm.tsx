import { useId, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { GLOSSARY } from './glossary';

/** Inline term with an accessible tooltip definition (hover or keyboard focus). */
export function GlossaryTerm({ id, children }: { id: keyof typeof GLOSSARY | string; children?: ReactNode }) {
  const entry = GLOSSARY[id];
  const [open, setOpen] = useState(false);
  const tipId = useId();
  if (!entry) return <>{children}</>;
  return (
    <span className="relative inline-block" onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      <Link
        to={`/glossary#${id}`}
        className="cursor-help border-b border-dotted border-slate-400 text-inherit hover:border-brand-500"
        aria-describedby={tipId}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={(e) => e.key === 'Escape' && setOpen(false)}
      >
        {children ?? entry.term}
      </Link>
      <span
        id={tipId}
        role="tooltip"
        className={`pointer-events-none absolute bottom-full left-1/2 z-40 mb-2 w-64 -translate-x-1/2 rounded-lg bg-slate-900 px-3 py-2 text-xs font-normal normal-case leading-snug tracking-normal text-white shadow-lg transition-opacity ${
          open ? 'opacity-100' : 'sr-only opacity-0'
        }`}
      >
        <strong className="block font-semibold">{entry.term}</strong>
        {entry.short}
      </span>
    </span>
  );
}
