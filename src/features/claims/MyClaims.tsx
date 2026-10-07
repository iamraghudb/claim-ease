import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, ClipboardList, FilePlus, Search } from 'lucide-react';
import type { ClaimType } from '../../domain/types';
import { CLAIM_TYPE_LABELS } from '../../domain/catalog';
import { formatUSD } from '../../domain/rulesEngine';
import { selectVisibleClaims, useAppStore } from '../../store/appStore';
import { ClaimProgressBar } from '../../components/ClaimProgressBar';
import { ClaimTypeIcon, SlaBadge, StatusBadge } from '../../components/badges';
import { formatDate } from '../../components/format';
import { ButtonLink, cx, EmptyState, PageHeader, Tabs } from '../../components/ui';
import { useCopilotPage } from '../copilot/pages';
import { myClaimsPageData } from './easeContext';

type Scope = 'all' | 'open' | 'closed';

export default function MyClaims() {
  const state = useAppStore();
  const claims = selectVisibleClaims(state);
  const [q, setQ] = useState('');
  const [type, setType] = useState<ClaimType | ''>('');
  const [scope, setScope] = useState<Scope>('all');

  const isOpen = (status: string) => !['CLOSED', 'PAID'].includes(status);
  const filtered = useMemo(
    () =>
      claims
        .filter((c) => !type || c.claimType === type)
        .filter((c) => (scope === 'all' ? true : scope === 'closed' ? !isOpen(c.status) : isOpen(c.status)))
        .filter((c) => !q || `${c.claimNumber} ${c.incidentDescription} ${c.claimantName}`.toLowerCase().includes(q.toLowerCase()))
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [claims, q, type, scope],
  );
  const needsAction = claims.filter((c) => c.status === 'INFORMATION_REQUIRED');
  const isProvider = state.role === 'PROVIDER';

  // Tell Ease what this screen shows: a short list of claim numbers, types and statuses (no names).
  const customer = state.role === 'CLAIMANT' || isProvider;
  useCopilotPage(
    customer
      ? {
          path: '/claims',
          title: isProvider ? 'Submitted claims' : 'My claims',
          summary: 'Every claim with its progress, status and anything that needs attention.',
          data: myClaimsPageData(claims),
          suggestions: ['Which claim needs my attention?', 'What do the statuses mean?'],
        }
      : null,
  );

  return (
    <div>
      <PageHeader
        title="My claims"
        subtitle={`${claims.length} claim${claims.length === 1 ? '' : 's'}${isProvider ? ' you have submitted' : ''}${needsAction.length ? ` · ${needsAction.length} need${needsAction.length === 1 ? 's' : ''} your attention` : ''}`}
        actions={
          // From sm up the header already has this button, so only phones (where it is just an icon) get the labelled one.
          <span className="sm:hidden">
            <ButtonLink to="/file" icon={FilePlus}>
              {isProvider ? 'Submit a claim' : 'File a claim'}
            </ButtonLink>
          </span>
        }
      />

      <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-center">
        <Tabs
          label="Show claims"
          value={scope}
          onChange={setScope}
          tabs={[
            { value: 'all', label: `All (${claims.length})` },
            { value: 'open', label: `Open (${claims.filter((c) => isOpen(c.status)).length})` },
            { value: 'closed', label: 'Paid or closed' },
          ]}
        />
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
          <label htmlFor="claim-search" className="sr-only">
            Search claims
          </label>
          <input id="claim-search" className="input pl-10" placeholder="Search by claim number or description" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <label htmlFor="type-filter" className="sr-only">
          Claim type
        </label>
        <select id="type-filter" className="input lg:w-44" value={type} onChange={(e) => setType(e.target.value as ClaimType | '')}>
          <option value="">All types</option>
          {(Object.keys(CLAIM_TYPE_LABELS) as ClaimType[]).map((t) => (
            <option key={t} value={t}>
              {CLAIM_TYPE_LABELS[t]}
            </option>
          ))}
        </select>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={ClipboardList}
          title={claims.length ? 'No claims match your filters' : 'No claims yet'}
          message={claims.length ? 'Try clearing the search or filters.' : 'When you file a claim, you can follow every step of it here.'}
          action={!claims.length && <ButtonLink to="/file">{isProvider ? 'Tell Ease about the visit' : 'Tell Ease what happened'}</ButtonLink>}
        />
      ) : (
        <ul className="space-y-3">
          {filtered.map((c) => {
            const attention = c.status === 'INFORMATION_REQUIRED';
            return (
              <li key={c.claimNumber}>
                <Link
                  to={`/claims/${c.claimNumber}`}
                  className={cx('card card-hover group flex items-center gap-4 p-4 sm:p-5', attention && 'border-amber-300 ring-1 ring-amber-200')}
                >
                  <span className="hidden sm:block">
                    <ClaimTypeIcon type={c.claimType} size="lg" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-sm font-bold text-slate-900">{c.claimNumber}</span>
                      <StatusBadge status={c.status} />
                      {attention && <span className="text-xs font-bold text-amber-700">Action needed</span>}
                    </div>
                    <p className="mt-1.5 truncate text-sm text-slate-700">{c.incidentDescription}</p>
                    <p className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-slate-500">
                      <span>{CLAIM_TYPE_LABELS[c.claimType]}</span>
                      <span>
                        {c.claimType === 'HEALTH' ? 'Visit' : 'Happened'}: {formatDate(c.dateOfLoss)}
                      </span>
                      <span>{c.decision ? (c.decision.outcome === 'DENIED' ? 'Not approved' : `Approved ${formatUSD(c.decision.approvedAmount)}`) : `Estimated ${formatUSD(c.estimatedAmount)}`}</span>
                      {isProvider && <span>Patient: {c.claimantName}</span>}
                    </p>
                    <ClaimProgressBar claim={c} className="mt-3 max-w-md" />
                  </div>
                  <div className="hidden sm:block">
                    <SlaBadge claim={c} compact />
                  </div>
                  <ArrowRight className="h-5 w-5 shrink-0 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-brand-600" aria-hidden />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
