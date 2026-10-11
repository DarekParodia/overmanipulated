// Collects keyboard, gamepad and touch into one InputState, sampled once per simulation tick.
// Edge-triggered actions (pick up, ping) are latched between samples so a quick tap that starts
// and ends within one 50 ms tick is never lost.
import type { InputActions, MoveVector } from '@redakcja/shared';
import { useApp } from '../store/app.ts';
import { readGamepad } from './gamepad.ts';
import { firstGamepad } from './gamepad-access.ts';
import { GAME_KEYS, isWorkHeld, KEY_BINDINGS, keysToMove } from './keyboard.ts';
import { handleNavKey, isInputCaptured } from './ui-nav.ts';

export type InputSample = { move: MoveVector; actions: InputActions; ping: boolean };

const pressedKeys = new Set<string>();
const touch = { move: { x: 0, y: 0 } as MoveVector, work: false };
const latched = { interact: false, ping: false };
const padPrevious = { interact: false, ping: false };
let attached = false;

const NATIVE_DIALOG_KEYS: ReadonlySet<string> = new Set([
  'Tab',
  'Space',
  'Enter',
  'NumpadEnter',
  'Backspace',
]);

function onKeyDown(event: KeyboardEvent): void {
  if (isTypingTarget(event.target)) {
    return;
  }
  if (isInputCaptured()) {
    pressedKeys.clear();
    // A modal dialog (settings) keeps the browser's own Tab / Enter / Space behaviour.
    if (NATIVE_DIALOG_KEYS.has(event.code) && document.querySelector('dialog[open]')) {
      return;
    }
    if (handleNavKey(event)) {
      useApp.getState().setInputDevice('keyboard');
    }
    return;
  }
  if (!GAME_KEYS.has(event.code)) {
    return;
  }
  event.preventDefault();
  if (!event.repeat) {
    if ((KEY_BINDINGS.interact as readonly string[]).includes(event.code)) {
      latched.interact = true;
    }
    if ((KEY_BINDINGS.ping as readonly string[]).includes(event.code)) {
      latched.ping = true;
    }
  }
  pressedKeys.add(event.code);
  useApp.getState().setInputDevice('keyboard');
}

function onKeyUp(event: KeyboardEvent): void {
  pressedKeys.delete(event.code);
}

function onBlur(): void {
  pressedKeys.clear();
}

function isTypingTarget(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && (target.isContentEditable || target.tagName === 'INPUT');
}

/** Starts listening for keyboard input; returns a function that stops it. */
export function attachInput(): () => void {
  if (attached) {
    return () => {};
  }
  attached = true;
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', onBlur);
  return () => {
    attached = false;
    window.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('keyup', onKeyUp);
    window.removeEventListener('blur', onBlur);
    onBlur();
  };
}

/** Touch controls report here. */
export const touchInput = {
  setMove(move: MoveVector): void {
    touch.move = move;
    useApp.getState().setInputDevice('touch');
  },
  setWork(held: boolean): void {
    touch.work = held;
    useApp.getState().setInputDevice('touch');
  },
  pressInteract(): void {
    latched.interact = true;
    useApp.getState().setInputDevice('touch');
  },
  pressPing(): void {
    latched.ping = true;
    useApp.getState().setInputDevice('touch');
  },
};

function strongest(a: MoveVector, b: MoveVector): MoveVector {
  return Math.hypot(a.x, a.y) >= Math.hypot(b.x, b.y) ? a : b;
}

/** Reads all devices and consumes latched edges. Call exactly once per simulation tick. */
export function sampleInput(): InputSample {
  if (isInputCaptured()) {
    // An overlay owns the input: the avatar stands still and nothing is picked up.
    latched.interact = false;
    latched.ping = false;
    const pad = firstGamepad();
    if (pad) {
      const reading = readGamepad(pad);
      padPrevious.interact = reading.interact;
      padPrevious.ping = reading.ping;
    }
    return { move: { x: 0, y: 0 }, actions: { interact: false, work: false }, ping: false };
  }
  let move = strongest(keysToMove(pressedKeys), touch.move);
  let work = isWorkHeld(pressedKeys) || touch.work;
  const pad = firstGamepad();
  if (pad) {
    const reading = readGamepad(pad);
    if (reading.active) {
      useApp.getState().setInputDevice('gamepad');
    }
    move = strongest(move, reading.move);
    work = work || reading.work;
    if (reading.interact && !padPrevious.interact) {
      latched.interact = true;
    }
    if (reading.ping && !padPrevious.ping) {
      latched.ping = true;
    }
    padPrevious.interact = reading.interact;
    padPrevious.ping = reading.ping;
  }
  const sample: InputSample = {
    move,
    actions: { interact: latched.interact, work },
    ping: latched.ping,
  };
  latched.interact = false;
  latched.ping = false;
  return sample;
}
