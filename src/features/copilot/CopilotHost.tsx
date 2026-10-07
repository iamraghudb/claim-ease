import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { X } from 'lucide-react';
import { useAppStore } from '../../store/appStore';
import { useAiStatus } from '../../store/useAiStatus';
import { EaseAvatar } from '../../components/ai';
import { useCopilotStore } from './copilotStore';
import { CopilotPanel } from './CopilotPanel';
import { defaultPage } from './pages';

const NUDGE_KEY = 'claimease.ease.nudged';

/** The floating "Ask Ease" button. After a few quiet seconds it offers help once per visit. */
function Launcher() {
  const open = useCopilotStore((s) => s.open);
  const setOpen = useCopilotStore((s) => s.setOpen);
  const { pathname } = useLocation();
  const [nudge, setNudge] = useState(false);

  useEffect(() => {
    let seen = false;
    try {
      seen = sessionStorage.getItem(NUDGE_KEY) === '1';
    } catch {
      /* ignore */
    }
    if (seen) return;
    const t = setTimeout(() => setNudge(true), 7000);
    return () => clearTimeout(t);
  }, []);

  const dismiss = () => {
    setNudge(false);
    try {
      sessionStorage.setItem(NUDGE_KEY, '1');
    } catch {
      /* ignore */
    }
  };

  // Smart start is already a conversation with Ease, so a second chat button would only confuse.
  if (open || pathname === '/file/smart') return null;
  return (
    <div className="no-print fixed bottom-5 right-4 z-40 flex flex-col items-end gap-2.5 sm:bottom-6 sm:right-6">
      {nudge && (
        <div className="pop-in flex max-w-[230px] items-start gap-2 rounded-2xl bg-white p-3 text-sm text-slate-700 shadow-lift ring-1 ring-ai-100">
          <p>
            Stuck on anything? <strong className="text-ai-700">Ask me.</strong>
          </p>
          <button type="button" onClick={dismiss} className="rounded p-0.5 text-slate-400 hover:text-slate-700" aria-label="Dismiss">
            <X className="h-3.5 w-3.5" aria-hidden />
          </button>
        </div>
      )}
      <button
        type="button"
        onClick={() => {
          dismiss();
          setOpen(true);
        }}
        className="flex items-center gap-2.5 rounded-full bg-white py-2 pl-2 pr-2 shadow-lift ring-1 ring-ai-200 transition hover:-translate-y-0.5 hover:ring-ai-400 sm:pr-4"
        aria-label="Ask Ease, your AI guide"
        data-tour="ease-launcher"
      >
        <EaseAvatar size="md" pulse />
        <span className="hidden text-sm font-bold text-slate-900 sm:inline">Ask Ease</span>
      </button>
    </div>
  );
}

/** Mounted once in the app shell: tracks the route, offers the launcher, and renders the panel. */
export function CopilotHost() {
  const status = useAiStatus();
  const role = useAppStore((s) => s.role);
  const { pathname } = useLocation();
  const setFallback = useCopilotStore((s) => s.setFallback);
  const setOpen = useCopilotStore((s) => s.setOpen);

  useEffect(() => {
    setFallback(defaultPage(pathname, role));
  }, [pathname, role, setFallback]);

  // Ctrl/Cmd+K opens Ease from anywhere.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen(!useCopilotStore.getState().open);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [setOpen]);

  if (!status) return null; // no AI server in this deployment: nothing to offer
  return (
    <>
      <Launcher />
      <CopilotPanel />
    </>
  );
}
