import { Link, useParams } from 'react-router-dom';
import { Bell, CircleCheck, ClipboardList, FileText, MessageSquare, Upload, Zap } from 'lucide-react';
import { useClaim, useRules } from '../../store/hooks';
import { SlaBadge, StatusBadge } from '../../components/badges';
import { formatDateTime } from '../../components/format';
import { Alert, ButtonLink, EmptyState } from '../../components/ui';
import { SLA_DISCLAIMER } from '../../domain/sla';

export default function Confirmation() {
  const { claimNumber } = useParams();
  const claim = useClaim(claimNumber);
  const rules = useRules(claim);
  if (!claim || !rules) return <EmptyState icon={FileText} title="Claim not found" action={<Link to="/claims">Back to claims</Link>} />;

  const missing = rules.triggers.filter((t) => t.code === 'MISSING_DATA');
  const steps = [
    { icon: ClipboardList, title: 'An adjuster is assigned', body: 'Usually within one business day. You’ll get a notification.' },
    {
      icon: Upload,
      title: missing.length ? 'Upload anything still missing' : 'Keep documents handy',
      body: missing.length ? missing.map((m) => m.explanation).join(' ') : 'We may still ask for originals or more photos.',
    },
    { icon: MessageSquare, title: 'Log every contact', body: 'Use the communication log on your claim to record calls and emails.' },
    { icon: Bell, title: 'Watch for updates', body: 'Status changes, information requests, decisions and payments appear in your notification center.' },
  ];

  return (
    <div className="mx-auto max-w-2xl">
      <div className="card p-6 text-center sm:p-8">
        <CircleCheck className="mx-auto h-14 w-14 text-emerald-600" aria-hidden />
        <h1 className="mt-3 text-2xl font-bold text-slate-900">Claim submitted</h1>
        <p className="mt-1 text-sm text-slate-600">Received {formatDateTime(claim.createdAt)}. Save this number for your records.</p>
        <p className="mt-4 inline-block rounded-xl bg-brand-50 px-5 py-3 font-mono text-2xl font-bold tracking-wider text-brand-800" aria-label={`Claim number ${claim.claimNumber}`}>
          {claim.claimNumber}
        </p>
        <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
          <StatusBadge status={claim.status} />
          <SlaBadge claim={claim} />
          {rules.fastTrackEligible && (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-600 px-2 py-0.5 text-xs font-semibold text-white">
              <Zap className="h-3 w-3" aria-hidden /> Fast-track eligible
            </span>
          )}
        </div>
      </div>

      <section className="card mt-6 p-6" aria-labelledby="next-steps">
        <h2 id="next-steps" className="text-base font-semibold text-slate-900">
          What happens next
        </h2>
        <ol className="mt-4 space-y-4">
          {steps.map((s, i) => (
            <li key={s.title} className="flex gap-3">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-100 text-sm font-semibold text-brand-700">{i + 1}</span>
              <div>
                <p className="flex items-center gap-2 text-sm font-medium text-slate-900">
                  <s.icon className="h-4 w-4 text-brand-600" aria-hidden /> {s.title}
                </p>
                <p className="text-sm text-slate-600">{s.body}</p>
              </div>
            </li>
          ))}
        </ol>
        <div className="mt-5">
          <Alert tone="info">{SLA_DISCLAIMER}</Alert>
        </div>
      </section>

      <div className="mt-6 flex flex-wrap justify-center gap-3">
        <ButtonLink to={`/claims/${claim.claimNumber}`}>View claim</ButtonLink>
        <ButtonLink to="/claims" variant="secondary">
          All my claims
        </ButtonLink>
      </div>
    </div>
  );
}
