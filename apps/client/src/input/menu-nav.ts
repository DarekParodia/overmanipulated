// Gamepad / d-pad navigation for menus and dialogs (S5-05): the same NavIntents the minigames
// use move a visible focus ring between the real controls of a screen, A clicks, B backs out.
// Keyboard and touch keep working natively (Tab, Enter, taps); this adds the pad.
//
// Screens that handle intents themselves (briefing, results, overlays) subscribe later and win;
// they pass `false` for intents they do not use and the menu navigator takes over.
import { useEffect } from 'react';
import { useApp } from '../store/app.ts';
import { captureInput, type NavIntent, subscribeNav } from './ui-nav.ts';

export type Rect = { left: number; top: number; width: number; height: number };
export type Direction = 'up' | 'down' | 'left' | 'right';

const center = (r: Rect) => ({ x: r.left + r.width / 2, y: r.top + r.height / 2 });

/**
 * Pure spatial navigation: the index of the control to focus when moving `direction` from
 * `current` (null = nothing focused yet: the first in reading order). Candidates must lie in the
 * direction's half-plane; the nearest wins, sideways drift counts double. Returns `current`
 * when nothing lies that way (no wrap, so the edge is felt).
 */
export function pickNext(
  rects: readonly Rect[],
  current: number | null,
  direction: Direction,
): number | null {
  if (rects.length === 0) {
    return null;
  }
  if (current === null || !rects[current]) {
    let first = 0;
    rects.forEach((r, i) => {
      const best = rects[first] as Rect;
      if (r.top < best.top - 4 || (Math.abs(r.top - best.top) <= 4 && r.left < best.left)) {
        first = i;
      }
    });
    return first;
  }
  const current_ = rects[current] as Rect;
  const from = center(current_);
  let best: number | null = null;
  let bestScore = Number.POSITIVE_INFINITY;
  rects.forEach((rect, index) => {
    if (index === current) {
      return;
    }
    const c = center(rect);
    const dx = c.x - from.x;
    const dy = c.y - from.y;
    const along =
      direction === 'right' ? dx : direction === 'left' ? -dx : direction === 'down' ? dy : -dy;
    const across = direction === 'left' || direction === 'right' ? dy : dx;
    if (along <= 1) {
      return;
    }
    // Controls overlapping the current one on the cross axis are "straight ahead"; others pay
    // for the gap between them.
    const horizontal = direction === 'left' || direction === 'right';
    const [aStart, aSize] = horizontal
      ? [current_.top, current_.height]
      : [current_.left, current_.width];
    const [bStart, bSize] = horizontal ? [rect.top, rect.height] : [rect.left, rect.width];
    const gap = Math.max(0, Math.max(aStart, bStart) - Math.min(aStart + aSize, bStart + bSize));
    const score = along + 2 * gap + 0.1 * Math.abs(across);
    if (score < bestScore) {
      bestScore = score;
      best = index;
    }
  });
  return best ?? current;
}

const FOCUSABLE =
  'button:not(:disabled), a[href], input:not(:disabled):not([type="hidden"]), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])';

/** The element whose box stands for the control: a 1 px native input is represented by its label. */
function visualBox(element: HTMLElement): HTMLElement {
  const own = element.getBoundingClientRect();
  if (own.width < 8 || own.height < 8) {
    return (element.closest('label') as HTMLElement | null) ?? element;
  }
  return element;
}

function openDialog(): HTMLDialogElement | null {
  const dialogs = document.querySelectorAll<HTMLDialogElement>('dialog[open]');
  return dialogs.length > 0 ? (dialogs[dialogs.length - 1] ?? null) : null;
}

/** The part of the page the pad drives: the open modal dialog, else the whole document. */
function scopeRoot(): ParentNode {
  return openDialog() ?? document;
}

type Control = { element: HTMLElement; rect: Rect };

function collectControls(root: ParentNode): Control[] {
  const controls: Control[] = [];
  for (const element of root.querySelectorAll<HTMLElement>(FOCUSABLE)) {
    if (element.closest('[inert], [aria-hidden="true"]')) {
      continue;
    }
    const box = visualBox(element).getBoundingClientRect();
    if (box.width === 0 || box.height === 0) {
      continue;
    }
    // Only controls on screen (a scrolled-away one is reached by scrolling it into view first).
    controls.push({
      element,
      rect: { left: box.left, top: box.top, width: box.width, height: box.height },
    });
  }
  return controls;
}

function isTextField(element: Element | null): element is HTMLInputElement | HTMLTextAreaElement {
  return (
    element instanceof HTMLTextAreaElement ||
    (element instanceof HTMLInputElement &&
      !['checkbox', 'radio', 'range', 'button', 'submit'].includes(element.type))
  );
}

/** Sets a range input the way a user would, so React's onChange sees it. */
function stepRange(input: HTMLInputElement, direction: 1 | -1): void {
  const step = Number(input.step) || 1;
  const next = Math.min(
    Number(input.max || 100),
    Math.max(Number(input.min || 0), Number(input.value) + direction * step),
  );
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  setter?.call(input, String(next));
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

/** Makes the pad's focus visible even though the last pointer was a mouse. */
function focusVisibly(element: HTMLElement): void {
  document.documentElement.dataset.padNav = 'true';
  (
    element as HTMLElement & {
      focus(o?: { focusVisible?: boolean; preventScroll?: boolean }): void;
    }
  ).focus({
    focusVisible: true,
  });
  element.scrollIntoView({ block: 'nearest', inline: 'nearest' });
}

/** Handles one intent against the DOM. Returns false when nothing was done (pass it on). */
export function handleMenuIntent(intent: NavIntent): boolean {
  const root = scopeRoot();
  if (intent === 'back') {
    const dialog = openDialog();
    if (dialog) {
      dialog.close();
      return true;
    }
    const back = document.querySelector<HTMLElement>('[data-nav-back]:not(:disabled)');
    if (back) {
      back.click();
      return true;
    }
    return false;
  }
  if (intent === 'alt') {
    return false;
  }
  const controls = collectControls(root);
  const active = document.activeElement as HTMLElement | null;
  const currentIndex = controls.findIndex((c) => c.element === active);

  if (intent === 'confirm') {
    if (currentIndex < 0) {
      const first = pickNext(
        controls.map((c) => c.rect),
        null,
        'down',
      );
      const target = first === null ? undefined : controls[first];
      if (target) {
        focusVisibly(target.element);
        return true;
      }
      return false;
    }
    const element = (controls[currentIndex] as Control).element;
    if (isTextField(element)) {
      return true;
    }
    element.click();
    return true;
  }

  // Sliders use left / right for their value.
  if (
    active instanceof HTMLInputElement &&
    active.type === 'range' &&
    (intent === 'left' || intent === 'right')
  ) {
    stepRange(active, intent === 'right' ? 1 : -1);
    return true;
  }
  const next = pickNext(
    controls.map((c) => c.rect),
    currentIndex < 0 ? null : currentIndex,
    intent,
  );
  let pick = next;
  // Nothing lies above / below (a wide row next to the main button): fall back to document
  // order, like Tab, so no control is ever out of reach.
  if (pick === currentIndex && currentIndex >= 0 && (intent === 'up' || intent === 'down')) {
    const step = intent === 'down' ? 1 : -1;
    const ordered = currentIndex + step;
    if (ordered >= 0 && ordered < controls.length) {
      pick = ordered;
    }
  }
  const target = pick === null ? undefined : controls[pick];
  if (target) {
    focusVisibly(target.element);
    return true;
  }
  return false;
}

/** Screens that are menus: the pad navigates them without any per-screen code. */
const MENU_SCREENS = new Set(['mainMenu', 'lobby', 'briefing', 'styleguide']);

/**
 * Mount once (App). Captures the input and routes pad intents to `handleMenuIntent` while a
 * menu screen or a modal dialog is up. Lowest priority: screens with their own handlers win.
 */
export function useMenuNavigation(): void {
  useEffect(() => {
    const unsubscribe = subscribeNav((intent) => {
      const screen = useApp.getState().screen;
      if (!MENU_SCREENS.has(screen) && !openDialog()) {
        return false;
      }
      return handleMenuIntent(intent) ? true : false;
    });
    let release: (() => void) | null = null;
    const sync = () => {
      const wanted = MENU_SCREENS.has(useApp.getState().screen) || openDialog() !== null;
      if (wanted && !release) {
        release = captureInput();
      } else if (!wanted && release) {
        release();
        release = null;
      }
    };
    sync();
    const stopApp = useApp.subscribe(sync);
    // Dialogs open and close outside React state we can read here.
    const observer = new MutationObserver(sync);
    observer.observe(document.body, {
      subtree: true,
      attributes: true,
      attributeFilter: ['open'],
    });
    const onPointer = () => {
      delete document.documentElement.dataset.padNav;
    };
    window.addEventListener('pointerdown', onPointer, { passive: true });
    return () => {
      unsubscribe();
      stopApp();
      observer.disconnect();
      window.removeEventListener('pointerdown', onPointer);
      release?.();
    };
  }, []);
}
