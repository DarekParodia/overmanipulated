import { describe, expect, it } from 'bun:test';
import { radialDeadzone, readGamepad } from './gamepad.ts';
import { keysToMove } from './keyboard.ts';
import { joystickVector, knobOffset } from './touch.ts';

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
