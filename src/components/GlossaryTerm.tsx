import { useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { cx } from './ui';
import { GLOSSARY } from './glossary';

/** Inline term with an accessible tooltip definition (hover or keyboard focus). */
export function GlossaryTerm({ id, children }: { id: keyof typeof GLOSSARY | string; children?: ReactNode }) {
  const entry = GLOSSARY[id];
  const [open, setOpen] = useState(false);
  // Horizontal nudge (px) that keeps the tooltip inside the viewport when the term sits near a screen edge.
  const [shift, setShift] = useState(0);
  const tip = useRef<HTMLSpanElement>(null);
  const tipId = useId();

  useLayoutEffect(() => {
    if (!open) {
      setShift(0);
      return;
    }
    const el = tip.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const margin = 8;
    const vw = document.documentElement.clientWidth;
    if (r.left < margin) setShift((s) => s + margin - r.left);
    else if (r.right > vw - margin) setShift((s) => s + vw - margin - r.right);
  }, [open]);

  if (!entry) return <>{children}</>;
  return (
    <span className="relative inline-block" onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      <Link
        to={`/glossary#${id}`}
        className="cursor-help rounded-sm border-b border-dotted border-slate-400 text-inherit transition-colors hover:border-brand-500 hover:text-brand-700 focus-visible:border-brand-600"
        aria-describedby={tipId}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={(e) => e.key === 'Escape' && setOpen(false)}
      >
        {children ?? entry.term}
      </Link>
      <span
        ref={tip}
        id={tipId}
        role="tooltip"
        style={open ? { transform: `translateX(calc(-50% + ${shift}px))` } : undefined}
        className={cx(
          'pointer-events-none absolute bottom-full left-1/2 z-40 mb-2.5 w-64 max-w-[calc(100vw-1rem)] whitespace-normal rounded-xl bg-slate-900 px-3.5 py-2.5 text-left text-xs font-normal normal-case leading-relaxed tracking-normal text-slate-200 shadow-pop transition-opacity duration-150',
          // display:none when closed, so a hidden tooltip can never widen the page. aria-describedby still exposes its text.
          open ? 'opacity-100' : 'hidden',
        )}
      >
        <strong className="mb-0.5 block text-[13px] font-semibold text-white">{entry.term}</strong>
        {entry.short}
        {open && <span aria-hidden className="absolute top-full h-0 w-0 -translate-x-1/2 border-x-[6px] border-t-[6px] border-x-transparent border-t-slate-900" style={{ left: `calc(50% - ${shift}px)` }} />}
      </span>
    </span>
  );
}
