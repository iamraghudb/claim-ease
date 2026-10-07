import { describe, expect, it } from 'vitest';
import { upgrade } from '../db';
import { buildSeed } from '../seed';

describe('upgrade (data saved by an older version)', () => {
  it('adds Dental and Vision to health plans that lack them, once', () => {
    const db = buildSeed();
    const health = db.policies.find((p) => p.type === 'HEALTH')!;
    health.coverages = health.coverages.filter((c) => c.name !== 'Dental' && c.name !== 'Vision');
    upgrade(db);
    upgrade(db);
    expect(health.coverages.filter((c) => c.name === 'Dental')).toHaveLength(1);
    expect(health.coverages.filter((c) => c.name === 'Vision')).toHaveLength(1);
  });

  it('leaves other plan types alone', () => {
    const db = buildSeed();
    const auto = db.policies.find((p) => p.type === 'AUTO')!;
    const before = auto.coverages.length;
    upgrade(db);
    expect(auto.coverages).toHaveLength(before);
  });
});
