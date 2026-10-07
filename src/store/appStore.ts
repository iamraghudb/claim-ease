import { create } from 'zustand';
import type { Actor, AppNotification, Claim, Customer, Policy, Role, RulesConfig } from '../domain/types';
import { DEFAULT_RULES_CONFIG } from '../domain/config';
import { claimService, configService, notificationService, PERSONAS, policyService } from '../services';

const ROLE_KEY = 'claimease.role';

function initialRole(): Role {
  try {
    const r = localStorage.getItem(ROLE_KEY) as Role | null;
    if (r && r in PERSONAS) return r;
  } catch {
    /* ignore */
  }
  return 'CLAIMANT';
}

interface AppState {
  role: Role;
  actor: Actor;
  claims: Claim[];
  policies: Policy[];
  customers: Customer[];
  notifications: AppNotification[];
  config: RulesConfig;
  loaded: boolean;
  setRole: (role: Role) => void;
  init: () => Promise<void>;
  refreshClaims: () => Promise<void>;
  refreshNotifications: () => Promise<void>;
  upsertClaim: (claim: Claim) => void;
  setConfig: (config: RulesConfig) => void;
}

const actorFor = (role: Role): Actor => ({ name: PERSONAS[role].name, role });

export const useAppStore = create<AppState>((set, get) => ({
  role: initialRole(),
  actor: actorFor(initialRole()),
  claims: [],
  policies: [],
  customers: [],
  notifications: [],
  config: DEFAULT_RULES_CONFIG,
  loaded: false,

  setRole: (role) => {
    try {
      localStorage.setItem(ROLE_KEY, role);
    } catch {
      /* ignore */
    }
    set({ role, actor: actorFor(role) });
    void get().refreshNotifications();
  },

  init: async () => {
    const [claims, policies, customers, config, notifications] = await Promise.all([
      claimService.list(),
      policyService.list(),
      policyService.customers(),
      configService.get(),
      notificationService.list(get().role),
    ]);
    set({ claims, policies, customers, config, notifications, loaded: true });
  },

  refreshClaims: async () => {
    const claims = await claimService.list();
    set({ claims });
  },

  refreshNotifications: async () => {
    const notifications = await notificationService.list(get().role);
    set({ notifications });
  },

  upsertClaim: (claim) => {
    const claims = get().claims;
    const idx = claims.findIndex((c) => c.claimNumber === claim.claimNumber);
    set({ claims: idx === -1 ? [claim, ...claims] : claims.map((c, i) => (i === idx ? claim : c)) });
    void get().refreshNotifications();
  },

  setConfig: (config) => set({ config }),
}));

/** Claims visible to the current role in the portal ("My Claims"). */
export function selectVisibleClaims(state: Pick<AppState, 'role' | 'claims' | 'policies'>): Claim[] {
  const persona = PERSONAS[state.role];
  if (state.role === 'CLAIMANT') {
    const mine = new Set(state.policies.filter((p) => p.customerId === persona.customerId).map((p) => p.policyNumber));
    return state.claims.filter((c) => mine.has(c.policyNumber));
  }
  if (state.role === 'PROVIDER')
    return state.claims.filter((c) => c.initiatorRole === 'PROVIDER' || (c.details.kind === 'HEALTH' && c.details.provider.name === persona.providerName));
  return state.claims;
}
