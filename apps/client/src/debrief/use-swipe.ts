// Horizontal swipe on a Kolegium page (phones): left turns to the next page, right to the
// previous one. Mostly-vertical drags are left to scrolling.
import { type PointerEvent, useRef } from 'react';

/** Horizontal swipe distance that turns a page on phones. */
const SWIPE_PX = 56;
/** The drag must be this much more horizontal than vertical. */
const SWIPE_SLOPE = 1.5;

/** The page step for a drag of (dx, dy) pixels, or null when it is not a swipe. */
export function swipeDirection(dx: number, dy: number): -1 | 1 | null {
  if (Math.abs(dx) > SWIPE_PX && Math.abs(dx) > Math.abs(dy) * SWIPE_SLOPE) {
    return dx < 0 ? 1 : -1;
  }
  return null;
}

/** Pointer handlers that call `onSwipe` with the page step of a finished swipe. */
export function useSwipe(onSwipe: ((direction: -1 | 1) => void) | undefined) {
  const start = useRef<{ x: number; y: number } | null>(null);
  return {
    onPointerDown(event: PointerEvent) {
      start.current = { x: event.clientX, y: event.clientY };
    },
    onPointerUp(event: PointerEvent) {
      const from = start.current;
      start.current = null;
      if (!from || !onSwipe) {
        return;
      }
      const direction = swipeDirection(event.clientX - from.x, event.clientY - from.y);
      if (direction !== null) {
        onSwipe(direction);
      }
    },
    onPointerCancel() {
      start.current = null;
    },
  };
}
