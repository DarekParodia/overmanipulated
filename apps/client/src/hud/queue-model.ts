// How many folder cards fit in the queue (design-rules §1.3/§5): at most three, fewer when the
// band between the HUD pill and the menu button is too narrow (phones), the rest summed up on a
// "+N" chip; a free slot may hold the dashed ghost card for the next folder. Pure, so the rules
// are unit-tested; `useQueueCapacity` measures the real sizes.
import type { Folder } from '@redakcja/shared';
import { type RefObject, useLayoutEffect, useState } from 'react';

/** design-rules §1.3: the HUD shows at most three folders. */
export const QUEUE_SHOWN = 3;

/** The ghost card: the next scheduled folder, or the belt holding one back. */
export type QueueGhost = 'next' | 'full';

export type QueueView = {
  shown: Folder[];
  /** Folders summed up on the "+N" chip. */
  hidden: number;
  ghost: QueueGhost | null;
};

/** Measured sizes of the queue band and its parts, in CSS pixels. */
export type QueueCapacity = {
  widthPx: number;
  cardPx: number;
  gapPx: number;
  chipPx: number;
};

export type QueueViewInput = QueueCapacity & {
  /** Folders, most urgent first (`sortQueue`). */
  sorted: readonly Folder[];
  /** A scheduled folder is still to come. */
  next: boolean;
  /** A scheduled folder is due but waits for a free conveyor tile (wins over `next`). */
  full: boolean;
};

/** `n` cards side by side, plus the "+N" chip after them, fit in `widthPx`. */
function fits(input: QueueCapacity, n: number, chip: boolean): boolean {
  const { widthPx, cardPx, gapPx, chipPx } = input;
  const cards = n * cardPx + Math.max(0, n - 1) * gapPx;
  return cards + (chip ? gapPx + chipPx : 0) <= widthPx;
}

export function queueView(input: QueueViewInput): QueueView {
  const { sorted } = input;
  let max = QUEUE_SHOWN;
  // Never below one card: the most urgent folder always shows, even on the narrowest band.
  while (max > 1 && !fits(input, max, sorted.length > max)) {
    max--;
  }
  if (sorted.length > max) {
    return { shown: sorted.slice(0, max), hidden: sorted.length - max, ghost: null };
  }
  const wanted: QueueGhost | null = input.full ? 'full' : input.next ? 'next' : null;
  const ghost =
    wanted !== null && sorted.length < max && fits(input, sorted.length + 1, false) ? wanted : null;
  return { shown: [...sorted], hidden: 0, ghost };
}

/** Phone layout of the queue (sideways cards); mirrors the media query in FolderQueue.module.css. */
const PHONE_QUERY = '(max-height: 500px), (max-width: 760px)';

/** Sizes used before a card or chip has been measured (FolderQueue.module.css). */
const FALLBACK = {
  phone: { cardPx: 92, gapPx: 8, chipPx: 40 },
  desktop: { cardPx: 120, gapPx: 12, chipPx: 48 },
} as const;

function measure(section: HTMLElement): QueueCapacity {
  const phone = window.matchMedia(PHONE_QUERY).matches;
  const fallback = phone ? FALLBACK.phone : FALLBACK.desktop;
  // Layout widths: a card popping in or shaking is scaled or rotated, not resized.
  const card = section.querySelector<HTMLElement>('[data-folder]')?.offsetWidth;
  const chip = section.querySelector<HTMLElement>('[data-more]')?.offsetWidth;
  const list = section.querySelector('ol');
  const gap = list ? Number.parseFloat(getComputedStyle(list).columnGap) : Number.NaN;
  return {
    widthPx: section.clientWidth,
    cardPx: card && card > 0 ? card : fallback.cardPx,
    gapPx: Number.isFinite(gap) ? gap : fallback.gapPx,
    chipPx: chip && chip > 0 ? chip : fallback.chipPx,
  };
}

function sameCapacity(a: QueueCapacity, b: QueueCapacity): boolean {
  return (
    a.widthPx === b.widthPx && a.cardPx === b.cardPx && a.gapPx === b.gapPx && a.chipPx === b.chipPx
  );
}

/**
 * Measures the queue band (`section`), its first folder card, the "+N" chip and the card gap,
 * again whenever the band or the card list resizes and whenever `contentKey` changes (cards came
 * or went). The first measurement runs before the first paint.
 */
export function useQueueCapacity(
  sectionRef: RefObject<HTMLElement | null>,
  contentKey: unknown,
): QueueCapacity {
  const [capacity, setCapacity] = useState<QueueCapacity>({
    widthPx: Number.POSITIVE_INFINITY,
    ...FALLBACK.desktop,
  });
  // biome-ignore lint/correctness/useExhaustiveDependencies: contentKey re-measures new cards
  useLayoutEffect(() => {
    const section = sectionRef.current;
    if (!section) {
      return;
    }
    const update = () => {
      const measured = measure(section);
      setCapacity((previous) => (sameCapacity(previous, measured) ? previous : measured));
    };
    update();
    if (typeof ResizeObserver === 'undefined') {
      return;
    }
    const observer = new ResizeObserver(update);
    observer.observe(section);
    const list = section.querySelector('ol');
    if (list) {
      observer.observe(list);
    }
    return () => observer.disconnect();
  }, [sectionRef, contentKey]);
  return capacity;
}
