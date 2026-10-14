import { describe, expect, test } from 'bun:test';
import { ENDLESS_LAYOUT, LEVELS } from '@redakcja/content';
import { parseLayout } from '@redakcja/shared';
import { DirectionalLight, Object3D, Vector3 } from 'three';
import { SUN_MARGIN, SUN_OFFSET, SUN_TALLEST_PROP, sunFrame } from './sun.ts';

/** Top of the back wall with its cap (Newsroom.tsx BACK_WALL_HEIGHT + WALL_CAP, rounded up). */
const BACK_WALL_TOP = 1.9;

/** A light set up the way SunLight.tsx sets it up, with its shadow matrices updated. */
function fittedLight(width: number, height: number): DirectionalLight {
  const frame = sunFrame(width, height);
  const light = new DirectionalLight();
  const target = new Object3D();
  target.position.set(...frame.target);
  target.updateMatrixWorld();
  light.target = target;
  light.position.set(...frame.position);
  light.updateMatrixWorld();
  const camera = light.shadow.camera;
  camera.left = -frame.half.x;
  camera.right = frame.half.x;
  camera.top = frame.half.y;
  camera.bottom = -frame.half.y;
  camera.updateProjectionMatrix();
  light.shadow.updateMatrices(light);
  return light;
}

function covers(light: DirectionalLight, x: number, y: number, z: number): boolean {
  return light.shadow.getFrustum().containsPoint(new Vector3(x, y, z));
}

describe('sunFrame', () => {
  test('fits the shadow box to a 20x12 campaign room', () => {
    const frame = sunFrame(20, 12);
    expect(frame.half.x).toBeCloseTo(12.65, 2);
    expect(frame.half.y).toBeCloseTo(10.75, 2);
    expect(frame.target).toEqual([10, 0, 6]);
    expect(frame.position).toEqual([14, 12, 12]);
  });

  test('fits the shadow box to the 24x14 endless room', () => {
    const frame = sunFrame(24, 14);
    expect(frame.half.x).toBeCloseTo(14.87, 2);
    expect(frame.half.y).toBeCloseTo(12.42, 2);
    expect(frame.target).toEqual([12, 0, 7]);
    expect(frame.position).toEqual([16, 12, 13]);
  });

  test('keeps the light direction of every room the same', () => {
    for (const [width, height] of [
      [20, 12],
      [22, 12],
      [24, 14],
    ] as const) {
      const { target, position } = sunFrame(width, height);
      expect([position[0] - target[0], position[1] - target[1], position[2] - target[2]]).toEqual([
        SUN_OFFSET.x,
        SUN_OFFSET.y,
        SUN_OFFSET.z,
      ]);
    }
  });

  test('the shadow camera holds every corner of every shipped room', () => {
    const maps = [...LEVELS.map((level) => parseLayout(level.layout)), parseLayout(ENDLESS_LAYOUT)];
    expect(LEVELS.length).toBeGreaterThan(0);
    for (const map of maps) {
      const light = fittedLight(map.width, map.height);
      for (const x of [0, map.width]) {
        for (const y of [0, SUN_TALLEST_PROP]) {
          for (const z of [0, map.height]) {
            expect(covers(light, x, y, z)).toBe(true);
          }
        }
        // The back wall row stands taller than SUN_TALLEST_PROP; the margin has to hold its top.
        for (const z of [0, 1]) {
          expect(covers(light, x, BACK_WALL_TOP, z)).toBe(true);
        }
      }
      // Fitted, not oversized: two margins past the front-right corner is already outside.
      const beyond = 2 * SUN_MARGIN;
      expect(covers(light, map.width + beyond, 0, map.height + beyond)).toBe(false);
    }
  });

  test('the old fixed box at the origin missed the front-right of a 20x12 room', () => {
    const light = new DirectionalLight();
    light.position.set(SUN_OFFSET.x, SUN_OFFSET.y, SUN_OFFSET.z);
    light.updateMatrixWorld();
    light.target.updateMatrixWorld();
    const camera = light.shadow.camera;
    camera.left = -14;
    camera.right = 14;
    camera.top = 10;
    camera.bottom = -10;
    camera.updateProjectionMatrix();
    light.shadow.updateMatrices(light);
    expect(covers(light, 20, 0, 12)).toBe(false);
    expect(covers(fittedLight(20, 12), 20, 0, 12)).toBe(true);
  });
});
