// The in-game menu's keys (S7-10): Esc on the keyboard and Start on a gamepad. Pure rules plus
// one subscription the menu mounts; touch players press the menu button itself.
//
// Esc opens the menu only when nothing captures the input (an overlay, the settings or the open
// menu handle Esc themselves: it closes them) and the tutorial card is not up (there Esc skips
// the tutorial first). Start toggles on its rising edge; the menu decides what a press means.
import { PAD } from './gamepad.ts';
import { firstGamepad } from './gamepad-access.ts';
import { isInputCaptured } from './ui-nav.ts';

export type MenuKeyState = {
  code: string;
  repeat: boolean;
  /** An overlay, a dialog or the menu itself owns the input. */
  captured: boolean;
  /** The first-game tutorial card is up (its skip control owns Esc). */
  tutorialActive: boolean;
};

/** True when this key press should open the in-game menu. */
export function escapeOpensMenu(key: MenuKeyState): boolean {
  return key.code === 'Escape' && !key.repeat && !key.captured && !key.tutorialActive;
}

/** True when the pad's Start button is held down. */
export function startPressed(pad: { buttons: readonly { pressed: boolean }[] } | null): boolean {
  return pad?.buttons[PAD.start]?.pressed ?? false;
}

/** Rising-edge detector: true only on the first sample of a press. */
export function createRisingEdge(initial = false): (pressed: boolean) => boolean {
  let previous = initial;
  return (pressed) => {
    const rose = pressed && !previous;
    previous = pressed;
    return rose;
  };
}

export type MenuButtonSource = 'escape' | 'start';

function isTypingTarget(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && (target.isContentEditable || target.tagName === 'INPUT');
}

/**
 * Calls `onPress` for Esc (only when it may open the menu) and for every Start press. Returns
 * the unsubscribe function. The key listener runs in the capture phase, before the tutorial's
 * own Esc handler, so one press never both skips the tutorial and opens the menu.
 */
export function subscribeMenuButton(
  onPress: (source: MenuButtonSource) => void,
  tutorialActive: () => boolean,
): () => void {
  const onKey = (event: KeyboardEvent) => {
    if (isTypingTarget(event.target)) {
      return;
    }
    const opens = escapeOpensMenu({
      code: event.code,
      repeat: event.repeat,
      captured: isInputCaptured(),
      tutorialActive: tutorialActive(),
    });
    if (opens) {
      // The press is the menu's alone: the sheet opens before the bubble-phase listeners run,
      // and the game's nav keys would read the same Esc as „back” and close it again. Also
      // keeps the browser from treating it as a dialog close request.
      event.preventDefault();
      event.stopPropagation();
      onPress('escape');
    }
  };
  window.addEventListener('keydown', onKey, { capture: true });

  // A Start held while the game screen mounts must be released before it counts.
  const edge = createRisingEdge(startPressed(firstGamepad()));
  let frame = 0;
  const poll = () => {
    if (edge(startPressed(firstGamepad()))) {
      onPress('start');
    }
    frame = requestAnimationFrame(poll);
  };
  frame = requestAnimationFrame(poll);

  return () => {
    window.removeEventListener('keydown', onKey, { capture: true });
    cancelAnimationFrame(frame);
  };
}
