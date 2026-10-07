import { create } from 'zustand';
import type { Role } from '../../domain/types';
import { markTourDone } from '../welcome/flags';
import { TOURS, type TourStep } from './steps';

interface TourState {
  active: boolean;
  /** The persona the running tour belongs to. */
  role: Role | null;
  steps: TourStep[];
  index: number;
  /** Begin (or restart) the tour for a persona, at its first step. */
  start: (role: Role) => void;
  /** Go to the next step. On the last step this finishes the tour and remembers that it was completed. */
  next: () => void;
  back: () => void;
  /** End the tour early. Not remembered as completed, so it can be offered again. */
  skip: () => void;
}

const IDLE = { active: false, role: null, steps: [] as TourStep[], index: 0 };

export const useTourStore = create<TourState>((set, get) => ({
  ...IDLE,

  start: (role) => set({ active: true, role, steps: TOURS[role], index: 0 }),

  next: () => {
    const { active, role, steps, index } = get();
    if (!active) return;
    if (index >= steps.length - 1) {
      if (role) markTourDone(role);
      set({ ...IDLE });
      return;
    }
    set({ index: index + 1 });
  },

  back: () => {
    const { active, index } = get();
    if (active && index > 0) set({ index: index - 1 });
  },

  skip: () => set({ ...IDLE }),
}));

/** Fire-and-forget helper for places that are not React components. */
export const startTour = (role: Role) => useTourStore.getState().start(role);
