import type { Role } from '../../domain/types';

/** Where each persona lands. Kept in its own module so the shell, the welcome screen and the tour can all use it. */
export const HOME_FOR_ROLE: Record<Role, string> = { CLAIMANT: '/', PROVIDER: '/', ADJUSTER: '/queue', ADMIN: '/admin' };
