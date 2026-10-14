import { describe, expect, it } from 'bun:test';
import { PAD, radialDeadzone, readGamepad } from './gamepad.ts';
import { GAME_KEYS, KEY_BINDINGS, keysToMove } from './keyboard.ts';
import { createRisingEdge, escapeOpensMenu, startPressed } from './menu-button.ts';
import { joystickVector, knobOffset } from './touch.ts';
import { NAV_KEYS } from './ui-nav.ts';

const pad = (axes: number[], pressed: number[] = []) => ({
  axes,
  buttons: Array.from({ length: 16 }, (_, i) => ({ pressed: pressed.includes(i) })),
});

describe('keyboard', () => {
  it('maps WASD and arrows to world axes', () => {
    expect(keysToMove(new Set(['KeyW']))).toEqual({ x: 0, y: -1 });
    expect(keysToMove(new Set(['ArrowRight', 'ArrowDown']))).toEqual({ x: 1, y: 1 });
  });

  it('cancels opposite keys', () => {
    expect(keysToMove(new Set(['KeyA', 'KeyD']))).toEqual({ x: 0, y: 0 });
  });

  it('binds the role ability to R, a game key that moves nothing (S7-39)', () => {
    expect(KEY_BINDINGS.ability).toEqual(['KeyR']);
    expect(GAME_KEYS.has('KeyR')).toBe(true);
    expect(keysToMove(new Set(['KeyR']))).toEqual({ x: 0, y: 0 });
  });

  it('turns R into the ability intent while an overlay owns the input (S7-39)', () => {
    expect(NAV_KEYS.KeyR).toBe('ability');
    expect(NAV_KEYS.KeyQ).toBe('alt');
  });

  it('turns H into the station help intent, a key no minigame or world action uses (S7-95)', () => {
    expect(NAV_KEYS.KeyH).toBe('help');
    expect(GAME_KEYS.has('KeyH')).toBe(false);
    expect(Object.values(NAV_KEYS).filter((intent) => intent === 'help')).toEqual(['help']);
  });
});

describe('gamepad', () => {
  it('ignores stick noise inside the dead zone', () => {
    expect(radialDeadzone(0.1, 0.12)).toEqual({ x: 0, y: 0 });
  });

  it('rescales outside the dead zone so movement starts at zero', () => {
    const v = radialDeadzone(0.6, 0);
    expect(v.x).toBeCloseTo(0.5, 5);
    expect(radialDeadzone(1, 0).x).toBeCloseTo(1, 5);
  });

  it('lets the d-pad override the stick and reads buttons', () => {
    const reading = readGamepad(pad([0.9, 0], [13, 0, 2]));
    expect(reading.move).toEqual({ x: 0, y: 1 });
    expect(reading).toMatchObject({ interact: true, work: true, ping: false, active: true });
  });

  it('reads RB (button 5) as the role ability and counts it as activity (S7-39)', () => {
    expect(PAD.rb).toBe(5);
    const reading = readGamepad(pad([0, 0], [5]));
    expect(reading).toMatchObject({ ability: true, interact: false, ping: false, active: true });
    expect(readGamepad(pad([0, 0], [4])).ability).toBe(false);
  });

  it('keeps Select (button 8) for the station help, apart from RB and Start (S7-95)', () => {
    expect(PAD.select).toBe(8);
    expect(PAD.rb).not.toBe(PAD.select);
    expect(PAD.start).not.toBe(PAD.select);
    const reading = readGamepad(pad([0, 0], [8]));
    expect(reading).toMatchObject({ ability: false, interact: false, work: false, ping: false });
  });

  it('reports an idle pad as inactive', () => {
    expect(readGamepad(pad([0.05, -0.05])).active).toBe(false);
  });
});

describe('touch joystick', () => {
  const origin = { x: 100, y: 100 };

  it('is zero inside the dead zone', () => {
    expect(joystickVector(origin, { x: 104, y: 103 })).toEqual({ x: 0, y: 0 });
  });

  it('reaches full speed at the ring and stays normalised beyond it', () => {
    const v = joystickVector(origin, { x: 300, y: 100 });
    expect(v.x).toBeCloseTo(1, 5);
    expect(v.y).toBeCloseTo(0, 5);
  });

  it('keeps the knob on the ring', () => {
    const offset = knobOffset(origin, { x: 100, y: 400 });
    expect(offset.y).toBeCloseTo(56, 5);
  });
});

describe('in-game menu keys (S7-10)', () => {
  const key = {
    code: 'Escape',
    repeat: false,
    captured: false,
    tutorialActive: false,
  };

  it('opens the menu with Esc only when nothing else owns it', () => {
    expect(escapeOpensMenu(key)).toBe(true);
    // An overlay, the settings or the open menu close on Esc instead.
    expect(escapeOpensMenu({ ...key, captured: true })).toBe(false);
    // The tutorial card skips first; the menu ignores that press.
    expect(escapeOpensMenu({ ...key, tutorialActive: true })).toBe(false);
    expect(escapeOpensMenu({ ...key, repeat: true })).toBe(false);
    expect(escapeOpensMenu({ ...key, code: 'KeyE' })).toBe(false);
  });

  it('reads Start as button 9 and counts only the rising edge', () => {
    expect(startPressed(pad([0, 0], [9]))).toBe(true);
    expect(startPressed(pad([0, 0], [8]))).toBe(false);
    expect(startPressed(null)).toBe(false);
    const edge = createRisingEdge();
    expect([true, true, false, true, false].map(edge)).toEqual([true, false, false, true, false]);
    // Held when the screen mounts: it must be released before it counts.
    const held = createRisingEdge(true);
    expect([true, false, true].map(held)).toEqual([false, false, true]);
  });
});
