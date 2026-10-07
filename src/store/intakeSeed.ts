import { create } from 'zustand';
import type { IntakeDraft } from '../features/intake/draft';

// A one-way hand-off from "Tell Ease what happened" (Smart start) to the step-by-step form.
//
// Smart start puts the claim it built here and navigates to /file/form; the form picks it up once and clears it.
// React StrictMode runs state initialisers twice, so the form only PEEKS in its initialiser and calls clear()
// from an effect after it has mounted.

interface IntakeSeedState {
  /** The claim built so far, or null when the form should start empty. */
  draft: IntakeDraft | null;
  /** Wizard step to open on (0 Policy, 1 Documents, 2 Details, 3 Review). */
  step: number;
  seed: (draft: IntakeDraft, step: number) => void;
  clear: () => void;
}

export const useIntakeSeed = create<IntakeSeedState>((set) => ({
  draft: null,
  step: 0,
  seed: (draft, step) => set({ draft, step }),
  clear: () => set({ draft: null, step: 0 }),
}));
