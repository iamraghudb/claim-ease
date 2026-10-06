import type { AppNotification, Role, RulesConfig } from '../domain/types';
import { delay, getDb, persist, resetDb } from './db';

export const notificationService = {
  async list(role: Role): Promise<AppNotification[]> {
    return delay(getDb().notifications.filter((n) => n.audience.includes(role)), 100);
  },
  async markRead(id: string): Promise<void> {
    const n = getDb().notifications.find((x) => x.id === id);
    if (n) n.read = true;
    persist();
    await delay(null, 50);
  },
  async markAllRead(role: Role): Promise<void> {
    for (const n of getDb().notifications) if (n.audience.includes(role)) n.read = true;
    persist();
    await delay(null, 50);
  },
};

export const configService = {
  async get(): Promise<RulesConfig> {
    return delay(getDb().config, 100);
  },
  async update(config: RulesConfig): Promise<RulesConfig> {
    getDb().config = structuredClone(config);
    persist();
    return delay(config);
  },
};

export const adminService = {
  async resetDemoData(): Promise<void> {
    resetDb();
    await delay(null, 300);
  },
  async adjusters(): Promise<string[]> {
    return delay(getDb().adjusters, 50);
  },
};
