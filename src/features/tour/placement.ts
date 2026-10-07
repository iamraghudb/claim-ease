// Pure geometry for the tour: where the spotlight goes, where the card sits, and how far to scroll.
// No DOM access here so it can be unit tested.

export interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

export interface Viewport {
  width: number;
  height: number;
}

/** Space around the highlighted element. */
export const SPOT_PAD = 6;
export const CARD_WIDTH = 340;
export const CARD_GAP = 14;
/** Minimum distance between the card and the edge of the screen. */
export const EDGE = 12;
/** Below this width the card is pinned to the bottom of the screen like a sheet. */
export const COMPACT_BELOW = 640;
/** The sticky header covers this much of the top of the page. */
export const HEADER_INSET = 76;
/** How much of the bottom of a phone screen the pinned card can cover. */
export const COMPACT_CARD_RESERVE = 250;

export const isCompact = (vp: Viewport) => vp.width < COMPACT_BELOW;

export const clamp = (n: number, min: number, max: number) => Math.min(Math.max(n, min), Math.max(min, max));

export function inflate(r: Rect, pad: number): Rect {
  return { top: r.top - pad, left: r.left - pad, width: r.width + pad * 2, height: r.height + pad * 2 };
}

export type Side = 'bottom' | 'top' | 'right' | 'left' | 'inside' | 'center' | 'sheet';

export interface Placement {
  side: Side;
  top: number;
  left: number;
  width: number;
}

/**
 * Where to put the card.
 * - no target: centred
 * - phone: a sheet along the bottom (or the top, if the target is down there)
 * - otherwise: below the target if it fits, else above, else beside it, else (for a target that fills the screen)
 *   along the bottom edge on top of it.
 * The card never leaves the viewport.
 */
export function placeCard(target: Rect | null, card: { width: number; height: number }, vp: Viewport): Placement {
  if (isCompact(vp)) {
    // A sheet along the bottom, unless the target lives down there (the Ask Ease button): then along the top.
    const bottomTop = vp.height - card.height - EDGE;
    const targetIsLow = !!target && target.top + target.height > bottomTop - EDGE;
    const roomAbove = !!target && target.top > card.height + EDGE * 2;
    return { side: 'sheet', top: targetIsLow && roomAbove ? EDGE : bottomTop, left: EDGE, width: vp.width - EDGE * 2 };
  }
  const width = Math.min(card.width, vp.width - EDGE * 2);
  const height = card.height;
  if (!target) {
    return { side: 'center', top: clamp((vp.height - height) / 2, EDGE, vp.height - height - EDGE), left: clamp((vp.width - width) / 2, EDGE, vp.width - width - EDGE), width };
  }

  const cx = target.left + target.width / 2;
  const cy = target.top + target.height / 2;
  const below = vp.height - (target.top + target.height) - CARD_GAP - EDGE;
  const above = target.top - CARD_GAP - EDGE;
  const right = vp.width - (target.left + target.width) - CARD_GAP - EDGE;
  const left = target.left - CARD_GAP - EDGE;
  const alignX = () => clamp(cx - width / 2, EDGE, vp.width - width - EDGE);
  const alignY = () => clamp(cy - height / 2, EDGE, vp.height - height - EDGE);

  if (below >= height) return { side: 'bottom', top: target.top + target.height + CARD_GAP, left: alignX(), width };
  if (above >= height) return { side: 'top', top: target.top - CARD_GAP - height, left: alignX(), width };
  if (right >= width) return { side: 'right', top: alignY(), left: target.left + target.width + CARD_GAP, width };
  if (left >= width) return { side: 'left', top: alignY(), left: target.left - CARD_GAP - width, width };
  return { side: 'inside', top: vp.height - height - EDGE * 2, left: alignX(), width };
}

/**
 * How many pixels to scroll the page (positive = down) so the target sits comfortably on screen:
 * clear of the sticky header and, on phones, of the bottom sheet. Zero when it is already in view.
 */
export function scrollDelta(target: Rect, vp: Viewport): number {
  const bandTop = HEADER_INSET;
  const bandBottom = vp.height - (isCompact(vp) ? COMPACT_CARD_RESERVE : 24);
  const bandHeight = bandBottom - bandTop;
  const bottom = target.top + target.height;
  if (target.top >= bandTop && bottom <= bandBottom) return 0;
  if (target.height >= bandHeight) return Math.round(target.top - bandTop);
  return Math.round(target.top - (bandTop + (bandHeight - target.height) / 2));
}
