import { Link, Navigate } from 'react-router-dom';
import { ArrowRight, ClipboardList, ListChecks, Mic, Paperclip, Zap } from 'lucide-react';
import { useAppStore } from '../../../store/appStore';
import { useAiStatus } from '../../../store/useAiStatus';
import { EaseAvatar } from '../../../components/ai';
import { Alert, PageHeader, Pill, Spinner } from '../../../components/ui';
import { isProvider } from './copy';

/** "File a claim": two ways in. Tell Ease what happened (fastest), or fill in the step-by-step form. */
export default function FileChooser() {
  const role = useAppStore((s) => s.role);
  const status = useAiStatus();

  if (role === 'ADJUSTER' || role === 'ADMIN')
    return (
      <Alert tone="info" title="Switch persona to file a claim">
        Open the profile menu in the top right and choose the claimant or the healthcare provider.
      </Alert>
    );
  if (status === undefined) return <Spinner />;
  // No AI server in this deployment: there is only one way to file, so go straight to it.
  if (status === null) return <Navigate to="/file/form" replace />;

  const provider = isProvider(role);
  return (
    <div>
      <PageHeader title={provider ? 'Submit a claim' : 'File a claim'} subtitle="How would you like to start?" />

      <div data-tour="file-choice" className="grid gap-5 md:grid-cols-2">
        <Link
          to="/file/smart"
          className="ai-surface group relative flex flex-col p-6 shadow-soft transition duration-200 hover:-translate-y-0.5 hover:border-ai-400 hover:shadow-lift sm:p-7"
        >
          <div className="flex items-start justify-between gap-3">
            <EaseAvatar size="lg" pulse />
            <Pill tone="purple">
              <Zap className="h-3 w-3" aria-hidden /> Fastest
            </Pill>
          </div>
          <h2 className="mt-5 text-xl font-bold text-slate-900">{provider ? 'Tell Ease about the visit' : 'Tell Ease what happened'}</h2>
          <p className="mt-2 text-sm leading-relaxed text-slate-600">
            Say it or type it, or drop {provider ? 'the itemized bill' : 'a bill'}. Ease fills in the claim and asks only what&apos;s missing. About a minute.
          </p>
          <ul className="mt-4 flex flex-wrap gap-2 text-xs font-semibold text-ai-800">
            {[
              { icon: Mic, text: 'Talk or type' },
              { icon: Paperclip, text: provider ? 'Drop the bill' : 'Drop a bill or photo' },
              { icon: ListChecks, text: 'Only what is missing' },
            ].map(({ icon: Icon, text }) => (
              <li key={text} className="inline-flex items-center gap-1.5 rounded-full bg-white/80 px-2.5 py-1 ring-1 ring-ai-200">
                <Icon className="h-3.5 w-3.5" aria-hidden /> {text}
              </li>
            ))}
          </ul>
          <div className="mt-auto pt-6">
            <span className="inline-flex items-center gap-2 rounded-xl bg-ai-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition group-hover:bg-ai-700">
              Start with Ease <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" aria-hidden />
            </span>
          </div>
        </Link>

        <Link to="/file/form" className="card card-hover group flex flex-col p-6 sm:p-7">
          <span className="grid h-14 w-14 place-items-center rounded-2xl bg-brand-50 text-brand-600">
            <ClipboardList className="h-7 w-7" aria-hidden />
          </span>
          <h2 className="mt-5 text-xl font-bold text-slate-900">{provider ? 'Submit a claim for a patient' : 'Fill in the form'}</h2>
          <p className="mt-2 text-sm leading-relaxed text-slate-600">Step by step. About three minutes.</p>
          <ol className="mt-4 flex flex-wrap gap-2 text-xs font-semibold text-slate-600">
            {[provider ? 'Plan' : 'Policy', 'Documents', 'Details', 'Review'].map((s, i) => (
              <li key={s} className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1">
                <span className="grid h-4 w-4 place-items-center rounded-full bg-white text-[10px] font-bold text-slate-500">{i + 1}</span> {s}
              </li>
            ))}
          </ol>
          <div className="mt-auto pt-6">
            <span className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 shadow-sm ring-1 ring-inset ring-slate-300 transition group-hover:bg-slate-50 group-hover:ring-slate-400">
              Open the form <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" aria-hidden />
            </span>
          </div>
        </Link>
      </div>
    </div>
  );
}
