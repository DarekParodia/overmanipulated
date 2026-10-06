// Simulation (tiles, x right / y down the screen) ↔ three.js world (x right, z towards camera).
import type { Vector3 } from 'three';

export function toWorld(x: number, y: number, target: Vector3, height = 0): Vector3 {
  return target.set(x, height, y);
}

/** Simulation facing (atan2 over sim y) → rotation about three's Y axis for a +x-forward model. */
export function facingToRotationY(facing: number): number {
  return -facing;
}
