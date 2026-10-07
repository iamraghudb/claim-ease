import { create } from 'zustand';
import { isAllowedPath } from '../../domain/aiRoutes';
import type { AiSource, CopilotAction, CopilotPage } from '../../domain/aiTypes';
import { aiService } from '../../services';
import { useAppStore } from '../../store/appStore';

export interface CopilotTurn {
  id: number;
  role: 'user' | 'assistant';
  text: string;
  source?: AiSource;
  followUps?: string[];
  actions?: CopilotAction[];
  /** True once an assistant answer has finished "typing", so it is not replayed. */
  shown?: boolean;
}

interface CopilotState {
  open: boolean;
  turns: CopilotTurn[];
  busy: boolean;
  error: string;
  /** What the current screen says about itself (set by the screen)... */
  specific: CopilotPage | null;
  /** ...or, failing that, what we can tell from the route alone. */
  fallback: CopilotPage | null;
  setOpen: (open: boolean) => void;
  setSpecific: (page: CopilotPage | null) => void;
  setFallback: (page: CopilotPage | null) => void;
  markShown: (id: number) => void;
  reset: () => void;
  /** Ask a question about the current screen. Opens the panel. */
  ask: (question: string) => Promise<void>;
}

let nextId = 1;

export const useCopilotStore = create<CopilotState>((set, get) => ({
  open: false,
  turns: [],
  busy: false,
  error: '',
  specific: null,
  fallback: null,

  setOpen: (open) => set({ open }),
  setSpecific: (specific) => set({ specific }),
  setFallback: (fallback) => set({ fallback }),
  markShown: (id) => set((s) => ({ turns: s.turns.map((t) => (t.id === id ? { ...t, shown: true } : t)) })),
  reset: () => set({ turns: [], error: '', busy: false }),

  ask: async (question) => {
    const q = question.trim();
    const page = get().specific ?? get().fallback;
    if (!q || !page || get().busy) return;
    const role = useAppStore.getState().role;
    const history = get().turns.map((t) => ({ role: t.role, text: t.text }));
    set((s) => ({ open: true, busy: true, error: '', turns: [...s.turns, { id: nextId++, role: 'user', text: q, shown: true }] }));
    try {
      const res = await aiService.chat({ role, page, question: q, history });
      // The server already filters these; checking again means a bad link can never be rendered.
      const actions = res.actions.filter((a) => isAllowedPath(role, a.to));
      set((s) => ({ busy: false, turns: [...s.turns, { id: nextId++, role: 'assistant', text: res.answer, source: res.source, followUps: res.followUps, actions }] }));
    } catch (e) {
      set({ busy: false, error: e instanceof Error ? e.message : 'Something went wrong.' });
    }
  },
}));

// Switching persona starts a fresh conversation: a claimant's chat must not carry over to an adjuster's.
useAppStore.subscribe((state, prev) => {
  if (state.role !== prev.role) useCopilotStore.getState().reset();
});
