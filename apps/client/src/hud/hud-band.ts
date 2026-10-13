// The HUD band (S7-11): how far down the top-of-screen HUD (pill, folder queue, menu button,
// endless tempo chip, each marked `data-hud-band`) reaches. GameScreen publishes it as the
// `--hud-band` CSS variable, so captions, event banners and verdict toasts start under it on any
// screen and text scale, and the follow camera (S7-12) can frame the room below it. The pill's
// right edge goes out as `--hud-pill-right`: the one-row phone pill grows with long numbers and
// the folder queue starts after it.
import { type RefObject, useLayoutEffect } from 'react';
import { create } from 'zustand';

/** The band never claims more than this share of the screen height (client presentation). */
export const HUD_BAND_MAX_SHARE = 0.3;

/** The attribute that marks a HUD element as part of the band. */
export const HUD_BAND_ATTR = 'data-hud-band';
/** The attribute that marks the HUD pill (its right edge is published too). */
export const HUD_PILL_ATTR = 'data-hud-pill';

/** A box's vertical extent in CSS pixels from the top of the game screen. */
export type BandRect = { top: number; bottom: number };

/**
 * The band's bottom edge in whole pixels: the lowest bottom of the boxes that start in the upper
 * half of the screen, capped at `HUD_BAND_MAX_SHARE` of its height. 0 when nothing is measured.
 */
export function bandBottom(rects: readonly BandRect[], viewportH: number): number {
  if (!(viewportH > 0)) {
    return 0;
  }
  let bottom = 0;
  for (const rect of rects) {
    if (rect.top < viewportH / 2 && rect.bottom > bottom) {
      bottom = rect.bottom;
    }
  }
  return Math.min(Math.ceil(bottom), Math.floor(viewportH * HUD_BAND_MAX_SHARE));
}

export type HudBand = {
  /** The band's bottom edge in CSS pixels; 0 until the first measurement. */
  px: number;
  /** The pill's right edge in CSS pixels; 0 until the first measurement. */
  pillRightPx: number;
};

type HudBandState = HudBand & { set: (band: HudBand) => void };

export const useHudBand = create<HudBandState>((set) => ({
  px: 0,
  pillRightPx: 0,
  set: (band) =>
    set((state) => (state.px === band.px && state.pillRightPx === band.pillRightPx ? state : band)),
}));

type LayoutBox = BandRect & { right: number };

/**
 * The element's layout box relative to `root`, from offsets rather than the bounding rect, so a
 * card bump or a pressed button (CSS transforms) never moves the band. Null for a hidden element.
 */
function layoutBox(element: HTMLElement, root: HTMLElement): LayoutBox | null {
  if (element.offsetParent === null) {
    return null;
  }
  let top = 0;
  let left = 0;
  let node: HTMLElement = element;
  while (node !== root) {
    const parent = node.offsetParent;
    if (!(parent instanceof HTMLElement)) {
      // Not laid out inside the root after all: fall back to the screen position.
      const rect = element.getBoundingClientRect();
      const origin = root.getBoundingClientRect();
      return {
        top: rect.top - origin.top,
        bottom: rect.bottom - origin.top,
        right: rect.right - origin.left,
      };
    }
    const border =
      parent === root ? { top: 0, left: 0 } : { top: parent.clientTop, left: parent.clientLeft };
    top += node.offsetTop + border.top;
    left += node.offsetLeft + border.left;
    node = parent;
  }
  return { top, bottom: top + element.offsetHeight, right: left + element.offsetWidth };
}

function touchesBand(nodes: NodeList): boolean {
  for (const node of nodes) {
    if (
      node instanceof Element &&
      (node.hasAttribute(HUD_BAND_ATTR) || node.querySelector(`[${HUD_BAND_ATTR}]`) !== null)
    ) {
      return true;
    }
  }
  return false;
}

/**
 * Measures the band inside `rootRef` (the game screen) into `useHudBand`: before the first
 * paint, whenever a band element or the screen resizes (text scale, fonts, cards coming and
 * going, a longer number in the pill) and whenever a band element mounts or unmounts. Resets
 * the band on unmount.
 */
export function useHudBandMeasure(rootRef: RefObject<HTMLElement | null>): void {
  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) {
      return;
    }
    const store = useHudBand.getState();
    let elements: HTMLElement[] = [];
    let frame = 0;

    const measure = () => {
      frame = 0;
      const rects: BandRect[] = [];
      let pillRightPx = 0;
      for (const element of elements) {
        const box = layoutBox(element, root);
        if (box) {
          rects.push(box);
          if (element.hasAttribute(HUD_PILL_ATTR)) {
            pillRightPx = Math.ceil(box.right);
          }
        }
      }
      store.set({ px: bandBottom(rects, root.clientHeight), pillRightPx });
    };
    const schedule = () => {
      if (frame === 0) {
        frame = requestAnimationFrame(measure);
      }
    };

    const resizes = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(schedule);
    const collect = () => {
      elements = [...root.querySelectorAll<HTMLElement>(`[${HUD_BAND_ATTR}]`)];
      if (resizes) {
        resizes.disconnect();
        resizes.observe(root);
        for (const element of elements) {
          resizes.observe(element);
        }
      }
    };

    collect();
    measure();

    const mutations =
      typeof MutationObserver === 'undefined'
        ? null
        : new MutationObserver((records) => {
            if (records.some((r) => touchesBand(r.addedNodes) || touchesBand(r.removedNodes))) {
              collect();
              schedule();
            }
          });
    mutations?.observe(root, { childList: true, subtree: true });
    window.addEventListener('resize', schedule);

    return () => {
      window.removeEventListener('resize', schedule);
      mutations?.disconnect();
      resizes?.disconnect();
      if (frame !== 0) {
        cancelAnimationFrame(frame);
      }
      store.set({ px: 0, pillRightPx: 0 });
    };
  }, [rootRef]);
}
