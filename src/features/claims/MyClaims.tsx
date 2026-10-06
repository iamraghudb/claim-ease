import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight, ClipboardList, FilePlus, Search } from 'lucide-react';
import type { ClaimType } from '../../domain/types';
import { CLAIM_TYPE_LABELS } from '../../domain/catalog';
import { formatUSD } from '../../domain/rulesEngine';
import { selectVisibleClaims, useAppStore } from '../../store/appStore';
import { CLAIM_TYPE_ICONS, SlaBadge, StatusBadge } from '../../components/badges';
import { formatDate } from '../../components/format';
import { ButtonLink, EmptyState, PageHeader } from '../../components/ui';

export default function MyClaims() {
  const state = useAppStore();
  const claims = selectVisibleClaims(state);
  const [q, setQ] = useState('');
  const [type, setType] = useState<ClaimType | ''>('');
  const [open, setOpen] = useState<'open' | 'all' | 'closed'>('all');

  const filtered = useMemo(
    () =>
      claims
        .filter((c) => !type || c.claimType === type)
        .filter((c) => (open === 'all' ? true : open === 'closed' ? c.status === 'CLOSED' || c.status === 'PAID' : !['CLOSED', 'PAID'].includes(c.status)))
        .filter((c) => !q || `${c.claimNumber} ${c.incidentDescription} ${c.claimantName}`.toLowerCase().includes(q.toLowerCase()))
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [claims, q, type, open],
  );
  const needsAction = claims.filter((c) => c.status === 'INFORMATION_REQUIRED');

  return (
    <div>
      <PageHeader
        title={state.role === 'PROVIDER' ? 'Submitted claims' : 'My claims'}
        subtitle={`${claims.length} claim(s)${needsAction.length ? ` · ${needsAction.length} need your attention` : ''}`}
        actions={
          <ButtonLink to="/file" icon={FilePlus}>
            {state.role === 'PROVIDER' ? 'Submit claim' : 'File a claim'}
          </ButtonLink>
        }
      />

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
          <label htmlFor="claim-search" className="sr-only">
            Search claims
          </label>
          <input id="claim-search" className="input pl-9" placeholder="Search by claim number or description" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <label htmlFor="type-filter" className="sr-only">
          Claim type
        </label>
        <select id="type-filter" className="input sm:w-40" value={type} onChange={(e) => setType(e.target.value as ClaimType | '')}>
          <option value="">All types</option>
          {(Object.keys(CLAIM_TYPE_LABELS) as ClaimType[]).map((t) => (
            <option key={t} value={t}>
              {CLAIM_TYPE_LABELS[t]}
            </option>
          ))}
        </select>
        <label htmlFor="open-filter" className="sr-only">
          Open or closed
        </label>
        <select id="open-filter" className="input sm:w-36" value={open} onChange={(e) => setOpen(e.target.value as typeof open)}>
          <option value="all">All</option>
          <option value="open">Open</option>
          <option value="closed">Paid / closed</option>
        </select>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={ClipboardList}
          title={claims.length ? 'No claims match your filters' : 'No claims yet'}
          message={claims.length ? 'Try clearing the search or filters.' : 'When you file a claim, you can track its progress here.'}
          action={!claims.length && <ButtonLink to="/file">File your first claim</ButtonLink>}
        />
      ) : (
        <ul className="space-y-3">
          {filtered.map((c) => {
            const Icon = CLAIM_TYPE_ICONS[c.claimType];
            return (
              <li key={c.claimNumber}>
                <Link
                  to={`/claims/${c.claimNumber}`}
                  className={`card flex items-center gap-4 p-4 transition hover:border-brand-300 hover:shadow-md ${c.status === 'INFORMATION_REQUIRED' ? 'border-amber-300 ring-1 ring-amber-200' : ''}`}
                >
                  <span className="hidden rounded-xl bg-brand-50 p-2.5 text-brand-700 sm:block">
                    <Icon className="h-5 w-5" aria-hidden />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-sm font-semibold text-slate-900">{c.claimNumber}</span>
                      <StatusBadge status={c.status} />
                      {c.status === 'INFORMATION_REQUIRED' && <span className="text-xs font-semibold text-amber-700">Action needed</span>}
                    </div>
                    <p className="mt-1 truncate text-sm text-slate-600">{c.incidentDescription}</p>
                    <p className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-500">
                      <span>{CLAIM_TYPE_LABELS[c.claimType]}</span>
                      <span>{c.claimType === 'HEALTH' ? 'Service' : 'Loss'}: {formatDate(c.dateOfLoss)}</span>
                      <span>{c.decision ? `Approved ${formatUSD(c.decision.approvedAmount)}` : `Est. ${formatUSD(c.estimatedAmount)}`}</span>
                      {state.role === 'PROVIDER' && <span>Patient: {c.claimantName}</span>}
                    </p>
                  </div>
                  <div className="hidden sm:block">
                    <SlaBadge claim={c} compact />
                  </div>
                  <ChevronRight className="h-5 w-5 shrink-0 text-slate-400" aria-hidden />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
