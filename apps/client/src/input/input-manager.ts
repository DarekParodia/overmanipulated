// Collects keyboard, gamepad and touch into one InputState, sampled once per simulation tick.
// Edge-triggered actions (pick up, ping) are latched between samples so a quick tap that starts
// and ends within one 50 ms tick is never lost.
import type { InputActions, MoveVector } from '@redakcja/shared';
import { useApp } from '../store/app.ts';
import { readGamepad } from './gamepad.ts';
import { GAME_KEYS, isWorkHeld, KEY_BINDINGS, keysToMove } from './keyboard.ts';

export type InputSample = { move: MoveVector; actions: InputActions; ping: boolean };

const pressedKeys = new Set<string>();
const touch = { move: { x: 0, y: 0 } as MoveVector, work: false };
const latched = { interact: false, ping: false };
const padPrevious = { interact: false, ping: false };
let attached = false;

function onKeyDown(event: KeyboardEvent): void {
  if (!GAME_KEYS.has(event.code) || isTypingTarget(event.target)) {
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

function firstGamepad() {
  try {
    for (const pad of navigator.getGamepads?.() ?? []) {
      if (pad?.connected) {
        return pad;
      }
    }
  } catch {
    // Gamepad API blocked (permissions policy): treat as no gamepad.
  }
  return null;
}

function strongest(a: MoveVector, b: MoveVector): MoveVector {
  return Math.hypot(a.x, a.y) >= Math.hypot(b.x, b.y) ? a : b;
}

/** Reads all devices and consumes latched edges. Call exactly once per simulation tick. */
export function sampleInput(): InputSample {
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
