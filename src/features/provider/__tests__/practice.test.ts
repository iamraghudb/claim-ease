import { describe, expect, it } from 'vitest';
import { buildSeed } from '../../../services/seed';
import { PERSONAS } from '../../../services';
import { selectVisibleClaims } from '../../../store/appStore';
import { PROCEDURES } from '../../../domain/catalog';
import { practiceStats, recentPatients, stageOf, templateLines, VISIT_TEMPLATES } from '../practice';

const seed = buildSeed(new Date('2026-10-06T12:00:00Z'));
const mine = selectVisibleClaims({ role: 'PROVIDER', claims: seed.claims, policies: seed.policies });

describe('practice stats', () => {
  it('adds up what was billed, what is approved but unpaid, and what has been paid', () => {
    const s = practiceStats(mine);
    expect(s.claims).toBe(mine.length);
    expect(s.billed).toBe(mine.reduce((n, c) => n + c.estimatedAmount, 0));
    expect(s.paid).toBe(mine.filter((c) => stageOf(c) === 'PAID').reduce((n, c) => n + (c.payment?.amount ?? c.decision?.approvedAmount ?? 0), 0));
    expect(s.byStage.reduce((n, x) => n + x.count, 0)).toBe(mine.length);
  });

  it('sees the practice\'s own claims only', () => {
    expect(mine.length).toBeGreaterThan(0);
    for (const c of mine) expect(c.details.kind === 'HEALTH' && c.details.provider.name === PERSONAS.PROVIDER.providerName).toBe(true);
  });

  it('puts claims the insurer is waiting on into needsInfo', () => {
    const waiting = { ...mine[0], status: 'INFORMATION_REQUIRED' as const };
    expect(practiceStats([waiting]).needsInfo).toHaveLength(1);
    expect(stageOf(waiting)).toBe('NEEDS_INFO');
  });
});

describe('recent patients', () => {
  it('lists each member once, newest visit first', () => {
    const list = recentPatients(mine, 10);
    const ids = list.map((p) => p.memberId);
    expect(new Set(ids).size).toBe(ids.length);
    expect(list.every((p) => p.memberId && p.policyNumber)).toBe(true);
    const dates = list.map((p) => p.lastVisit);
    expect([...dates].sort().reverse()).toEqual(dates);
  });
});

describe('visit templates', () => {
  it('only use procedures that exist, and price them from the fee schedule', () => {
    for (const t of VISIT_TEMPLATES) {
      for (const l of templateLines(t)) {
        const p = PROCEDURES.find((x) => x.code === l.procedureCode);
        expect(p, `${t.id} ${l.procedureCode}`).toBeDefined();
        expect(l.billedAmount).toBe(p!.allowed * l.units);
      }
    }
  });
});
