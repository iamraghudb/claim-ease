import { describe, expect, it } from 'vitest';
import { CARD_WIDTH, clamp, COMPACT_CARD_RESERVE, EDGE, HEADER_INSET, inflate, isCompact, placeCard, scrollDelta, SPOT_PAD, type Rect, type Viewport } from '../placement';

const desktop: Viewport = { width: 1280, height: 800 };
const phone: Viewport = { width: 375, height: 700 };
const card = { width: CARD_WIDTH, height: 200 };

const within = (p: { top: number; left: number; width: number }, h: number, vp: Viewport) =>
  p.left >= EDGE - 0.001 && p.top >= EDGE - 0.001 && p.left + p.width <= vp.width - EDGE + 0.001 && p.top + h <= vp.height - EDGE + 0.001;

const overlaps = (a: Rect, b: Rect) => a.left < b.left + b.width && a.left + a.width > b.left && a.top < b.top + b.height && a.top + a.height > b.top;

describe('geometry helpers', () => {
  it('inflate grows a rect evenly', () => {
    expect(inflate({ top: 10, left: 20, width: 100, height: 40 }, SPOT_PAD)).toEqual({ top: 4, left: 14, width: 112, height: 52 });
  });

  it('clamp stays inside the range, and prefers the minimum when the range is inverted', () => {
    expect(clamp(5, 0, 10)).toBe(5);
    expect(clamp(-5, 0, 10)).toBe(0);
    expect(clamp(50, 0, 10)).toBe(10);
    expect(clamp(5, 10, 0)).toBe(10);
  });

  it('treats narrow screens as compact', () => {
    expect(isCompact(phone)).toBe(true);
    expect(isCompact({ width: 639, height: 800 })).toBe(true);
    expect(isCompact(desktop)).toBe(false);
  });
});

describe('placeCard', () => {
  it('centres the card when there is no target', () => {
    const p = placeCard(null, card, desktop);
    expect(p.side).toBe('center');
    expect(p.left + p.width / 2).toBeCloseTo(desktop.width / 2);
    expect(p.top + card.height / 2).toBeCloseTo(desktop.height / 2);
  });

  it('puts the card below a target near the top, clear of it', () => {
    const target: Rect = { top: 100, left: 500, width: 200, height: 60 };
    const p = placeCard(target, card, desktop);
    expect(p.side).toBe('bottom');
    expect(p.top).toBeGreaterThanOrEqual(target.top + target.height);
    expect(within(p, card.height, desktop)).toBe(true);
  });

  it('puts the card above a target near the bottom', () => {
    const target: Rect = { top: 700, left: 500, width: 200, height: 60 };
    const p = placeCard(target, card, desktop);
    expect(p.side).toBe('top');
    expect(p.top + card.height).toBeLessThanOrEqual(target.top);
    expect(within(p, card.height, desktop)).toBe(true);
  });

  it('clamps the card inside the screen for a target at the far right', () => {
    const target: Rect = { top: 100, left: 1200, width: 60, height: 40 };
    const p = placeCard(target, card, desktop);
    expect(within(p, card.height, desktop)).toBe(true);
  });

  it('goes beside a tall target when there is no room above or below', () => {
    const target: Rect = { top: 80, left: 100, width: 300, height: 680 };
    const p = placeCard(target, card, desktop);
    expect(['right', 'left']).toContain(p.side);
    expect(overlaps({ top: p.top, left: p.left, width: p.width, height: card.height }, target)).toBe(false);
    expect(within(p, card.height, desktop)).toBe(true);
  });

  it('falls back to the bottom edge, on top of a target that fills the screen', () => {
    const target: Rect = { top: 0, left: 0, width: desktop.width, height: desktop.height };
    const p = placeCard(target, card, desktop);
    expect(p.side).toBe('inside');
    expect(within(p, card.height, desktop)).toBe(true);
  });

  it('is a bottom sheet on phones, whatever the target', () => {
    const p = placeCard({ top: 300, left: 20, width: 100, height: 40 }, { width: CARD_WIDTH, height: 220 }, phone);
    expect(p.side).toBe('sheet');
    expect(p.left).toBe(EDGE);
    expect(p.width).toBe(phone.width - EDGE * 2);
    expect(p.top + 220).toBe(phone.height - EDGE);
  });

  it('moves the phone sheet to the top when the target is down in the bottom corner', () => {
    const askEase: Rect = { top: 620, left: 300, width: 56, height: 56 };
    const p = placeCard(askEase, { width: CARD_WIDTH, height: 220 }, phone);
    expect(p.side).toBe('sheet');
    expect(p.top).toBe(EDGE);
    expect(p.top + 220).toBeLessThan(askEase.top);
  });

  it('keeps the phone sheet at the bottom when there is no room above a low target', () => {
    const p = placeCard({ top: 150, left: 20, width: 300, height: 480 }, { width: CARD_WIDTH, height: 220 }, phone);
    expect(p.top + 220).toBe(phone.height - EDGE);
  });

  it('never makes the card wider than a small window', () => {
    const narrow: Viewport = { width: 700, height: 800 };
    expect(placeCard(null, card, narrow).width).toBeLessThanOrEqual(CARD_WIDTH);
    const tiny: Viewport = { width: 660, height: 800 };
    expect(placeCard({ top: 100, left: 10, width: 50, height: 30 }, { width: 900, height: 200 }, tiny).width).toBe(tiny.width - EDGE * 2);
  });
});

describe('scrollDelta', () => {
  it('is zero for a target already comfortably in view', () => {
    expect(scrollDelta({ top: 300, left: 0, width: 200, height: 100 }, desktop)).toBe(0);
  });

  it('scrolls down to bring a target that is below the fold into the middle band', () => {
    const d = scrollDelta({ top: 1400, left: 0, width: 200, height: 100 }, desktop);
    expect(d).toBeGreaterThan(0);
    const newTop = 1400 - d;
    expect(newTop).toBeGreaterThanOrEqual(HEADER_INSET);
    expect(newTop + 100).toBeLessThanOrEqual(desktop.height);
  });

  it('scrolls up for a target that is hidden behind the header', () => {
    expect(scrollDelta({ top: 20, left: 0, width: 200, height: 100 }, desktop)).toBeLessThan(0);
  });

  it('aligns a very tall target to the top of the band', () => {
    const d = scrollDelta({ top: 500, left: 0, width: 600, height: 2000 }, desktop);
    expect(500 - d).toBe(HEADER_INSET);
  });

  it('leaves room for the bottom sheet on phones', () => {
    const d = scrollDelta({ top: 560, left: 0, width: 200, height: 60 }, phone);
    expect(d).toBeGreaterThan(0);
    expect(560 - d + 60).toBeLessThanOrEqual(phone.height - COMPACT_CARD_RESERVE);
  });
});
