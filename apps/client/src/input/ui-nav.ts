// UI navigation while an overlay (station minigame, desk sheet, ping picker) owns the input.
// Keyboard and gamepad are translated into a small set of intents; touch and mouse use the
// overlay's own buttons. While captured, the world gets neutral input (no movement, no actions).
import { useEffect, useRef } from 'react';
import { useApp } from '../store/app.ts';
import { PAD, radialDeadzone } from './gamepad.ts';
import { firstGamepad } from './gamepad-access.ts';

export type NavIntent = 'up' | 'down' | 'left' | 'right' | 'confirm' | 'back' | 'alt';

/** Physical key → intent. WASD and arrows navigate; Space/Enter/E confirm; Esc/Backspace back. */
export const NAV_KEYS: Readonly<Record<string, NavIntent>> = {
  ArrowUp: 'up',
  KeyW: 'up',
  ArrowDown: 'down',
  KeyS: 'down',
  ArrowLeft: 'left',
  KeyA: 'left',
  ArrowRight: 'right',
  KeyD: 'right',
  Space: 'confirm',
  Enter: 'confirm',
  NumpadEnter: 'confirm',
  KeyE: 'confirm',
  Escape: 'back',
  Backspace: 'back',
  KeyQ: 'alt',
  Tab: 'alt',
};

/** Gamepad: d-pad / left stick navigate, south confirms, east backs out, north is `alt`. */
const PAD_EAST = 1;
const STICK_THRESHOLD = 0.6;

/**
 * Returning `false` passes the intent on to the next-older subscriber, so a frame around a
 * minigame can handle `back` and leave everything else to the minigame inside it.
 */
type Listener = (intent: NavIntent) => unknown;
const listeners: Listener[] = [];
let captureCount = 0;
let pollHandle: number | null = null;
const padPrevious = new Set<NavIntent>();

export function isInputCaptured(): boolean {
  return captureCount > 0;
}

function dispatch(intent: NavIntent): void {
  // Last subscriber wins: the topmost overlay handles navigation unless it passes (`false`).
  for (let i = listeners.length - 1; i >= 0; i--) {
    if (listeners[i]?.(intent) !== false) {
      return;
    }
  }
}

/** Subscribes a navigation listener (newest first); returns the unsubscribe function. */
export function subscribeNav(listener: Listener): () => void {
  listeners.push(listener);
  return () => {
    const index = listeners.indexOf(listener);
    if (index >= 0) {
      listeners.splice(index, 1);
    }
  };
}

/** Called by the keyboard handler while captured; returns true if the key was used. */
export function handleNavKey(event: KeyboardEvent): boolean {
  const intent = NAV_KEYS[event.code];
  if (!intent) {
    return false;
  }
  event.preventDefault();
  if (!event.repeat || intent !== 'confirm') {
    dispatch(intent);
  }
  return true;
}

function padIntents(): Set<NavIntent> {
  const intents = new Set<NavIntent>();
  const pad = firstGamepad();
  if (!pad) {
    return intents;
  }
  const pressed = (i: number) => pad.buttons[i]?.pressed ?? false;
  const stick = radialDeadzone(pad.axes[0] ?? 0, pad.axes[1] ?? 0);
  if (pressed(PAD.dpadUp) || stick.y < -STICK_THRESHOLD) intents.add('up');
  if (pressed(PAD.dpadDown) || stick.y > STICK_THRESHOLD) intents.add('down');
  if (pressed(PAD.dpadLeft) || stick.x < -STICK_THRESHOLD) intents.add('left');
  if (pressed(PAD.dpadRight) || stick.x > STICK_THRESHOLD) intents.add('right');
  if (pressed(PAD.south)) intents.add('confirm');
  if (pressed(PAD_EAST)) intents.add('back');
  if (pressed(PAD.north)) intents.add('alt');
  return intents;
}

function poll(): void {
  const now = padIntents();
  for (const intent of now) {
    if (!padPrevious.has(intent)) {
      useApp.getState().setInputDevice('gamepad');
      dispatch(intent);
    }
  }
  padPrevious.clear();
  for (const intent of now) {
    padPrevious.add(intent);
  }
  pollHandle = captureCount > 0 ? requestAnimationFrame(poll) : null;
}

/** Takes the input away from the world; returns a release function. Nested captures stack. */
export function captureInput(): () => void {
  captureCount++;
  if (captureCount === 1 && typeof requestAnimationFrame === 'function') {
    // Buttons held when the overlay opens must be released before they count.
    for (const intent of padIntents()) {
      padPrevious.add(intent);
    }
    pollHandle ??= requestAnimationFrame(poll);
  }
  let released = false;
  return () => {
    if (released) {
      return;
    }
    released = true;
    captureCount = Math.max(0, captureCount - 1);
    if (captureCount === 0 && pollHandle !== null) {
      cancelAnimationFrame(pollHandle);
      pollHandle = null;
      padPrevious.clear();
    }
  };
}

/**
 * Captures input while `active` and routes keyboard/gamepad intents to `onIntent`. Use in the
 * overlay root; minigames inside use `useNavIntent` only.
 */
export function useInputCapture(active: boolean): void {
  useEffect(() => (active ? captureInput() : undefined), [active]);
}

/**
 * Subscribes to navigation intents while mounted. The newest subscriber receives them; a
 * handler that returns `false` passes the intent on to the previous one. React runs a child's
 * effects before its parent's, so a parent overlay mounted together with its minigame gets
 * intents first.
 */
export function useNavIntent(onIntent: (intent: NavIntent) => unknown): void {
  const handler = useRef(onIntent);
  handler.current = onIntent;
  useEffect(() => subscribeNav((intent) => handler.current(intent)), []);
}
