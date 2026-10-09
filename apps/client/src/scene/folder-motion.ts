// Folder animations (S3-06) driven by feedback triggers: `slideIn` (arrives along the conveyor
// and settles with a bounce), `hop` (picked up, new deadline), `place` and `stampSlam` (squash),
// `tremble` (deadline close) and `crumple` (expired). Pure, allocation-free maths; Folders.tsx
// applies the result on top of the folder's placement.
import { type SpringState, stepSpring } from '../fx/animation/spring.ts';

/** Distance (tiles, along -x) a new folder slides in from. */
export const SLIDE_DISTANCE = 1.1;
export const HOP_S = 0.3;
export const HOP_HEIGHT = 0.18;
export const TREMBLE_S = 0.7;
export const CRUMPLE_S = 0.55;
/** Squash depth of a stamp slam and of a folder being put down (1 = none). */
const SLAM_SQUASH = 0.4;
const PLACE_SQUASH = 0.72;

export type FolderEffects = {
  slide: SpringState;
  squash: SpringState;
  hopT: number;
  trembleT: number;
  /** Seconds since the crumple started (keeps counting after it played out), or -1. */
  crumpleT: number;
  /** Seconds the folder has not been drawn (Folders drops stale effects). */
  unseenS: number;
};

export type FolderOffset = {
  dx: number;
  dy: number;
  /** Horizontal and vertical scale. */
  sxz: number;
  sy: number;
  roll: number;
  spin: number;
};

export function createEffects(): FolderEffects {
  return {
    slide: { value: 0, velocity: 0 },
    squash: { value: 1, velocity: 0 },
    hopT: -1,
    trembleT: -1,
    crumpleT: -1,
    unseenS: 0,
  };
}

export function createOffset(): FolderOffset {
  return { dx: 0, dy: 0, sxz: 1, sy: 1, roll: 0, spin: 0 };
}

/** Starts the effect for a trigger; returns false when the trigger is not a folder effect. */
export function triggerEffect(e: FolderEffects, trigger: string, reducedMotion: boolean): boolean {
  if (trigger === 'crumple') {
    e.crumpleT = 0;
    return true;
  }
  if (reducedMotion) {
    // Fades only: no slide, hop, squash or shake.
    return false;
  }
  switch (trigger) {
    case 'slideIn':
      e.slide.value = -SLIDE_DISTANCE;
      e.slide.velocity = 0;
      return true;
    case 'hop':
      e.hopT = 0;
      return true;
    case 'place':
      e.squash.value = PLACE_SQUASH;
      e.squash.velocity = 0;
      return true;
    case 'stampSlam':
      e.squash.value = SLAM_SQUASH;
      e.squash.velocity = 0;
      e.hopT = HOP_S * 0.5;
      return true;
    case 'tremble':
      e.trembleT = 0;
      return true;
    default:
      return false;
  }
}

/** True once a crumple has played out (the folder stays hidden until it is gone or reset). */
export function crumpleDone(e: FolderEffects): boolean {
  return e.crumpleT >= CRUMPLE_S;
}

/** Advances every effect by `dt` and writes the combined offset into `out`. */
export function stepEffects(
  e: FolderEffects,
  dt: number,
  reducedMotion: boolean,
  out: FolderOffset,
): FolderOffset {
  stepSpring(e.slide, 0, dt, 2.2, 0.5);
  stepSpring(e.squash, 1, dt, 4, 0.3);
  out.dx = e.slide.value;
  out.dy = 0;
  out.roll = 0;
  out.spin = 0;
  out.sy = e.squash.value;
  out.sxz = 1 / Math.sqrt(Math.max(0.2, e.squash.value));

  if (e.hopT >= 0) {
    e.hopT += dt;
    if (e.hopT >= HOP_S) {
      e.hopT = -1;
    } else {
      const t = e.hopT / HOP_S;
      out.dy = 4 * t * (1 - t) * HOP_HEIGHT;
      out.roll = Math.sin(t * Math.PI) * 0.12;
    }
  }
  if (e.trembleT >= 0) {
    e.trembleT += dt;
    if (e.trembleT >= TREMBLE_S) {
      e.trembleT = -1;
    } else {
      out.roll += Math.sin(e.trembleT * 48) * 0.09 * (1 - e.trembleT / TREMBLE_S);
    }
  }
  if (e.crumpleT >= 0) {
    e.crumpleT += dt;
    const t = Math.min(1, e.crumpleT / CRUMPLE_S);
    if (reducedMotion) {
      // Plain shrink, no jitter.
      out.sxz = 1 - t;
      out.sy = 1 - t;
    } else {
      // Scrunch flat and small with a twist, then vanish.
      const ease = t * t * (3 - 2 * t);
      out.sxz = (1 - 0.7 * ease) * (t < 0.9 ? 1 : (1 - t) * 10);
      out.sy = 1 + 2.5 * Math.sin(Math.min(1, t * 2) * Math.PI) - 0.9 * ease;
      out.spin = ease * 2.2;
      out.roll += Math.sin(t * 40) * 0.2 * (1 - t);
    }
  }
  return out;
}
