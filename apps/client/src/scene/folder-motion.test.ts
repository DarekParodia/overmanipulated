import { describe, expect, it } from 'bun:test';
import { storyTypeSchema } from '@redakcja/shared';
import {
  CRUMPLE_S,
  createEffects,
  createOffset,
  HOP_HEIGHT,
  HOP_S,
  SLIDE_DISTANCE,
  stepEffects,
  triggerEffect,
} from './folder-motion.ts';
import { createFolderProps } from './folder-props.ts';

const DT = 1 / 60;

function run(trigger: string, seconds: number, reducedMotion = false) {
  const e = createEffects();
  triggerEffect(e, trigger, reducedMotion);
  const out = createOffset();
  const frames: { dx: number; dy: number; sxz: number; sy: number; roll: number }[] = [];
  for (let t = 0; t < seconds; t += DT) {
    stepEffects(e, DT, reducedMotion, out);
    frames.push({ ...out });
  }
  return { e, frames };
}

describe('folder motion', () => {
  it('slides a new folder in along the conveyor and settles with an overshoot', () => {
    const { frames } = run('slideIn', 2);
    expect(frames[0]?.dx ?? 0).toBeLessThan(-SLIDE_DISTANCE * 0.8);
    expect(Math.max(...frames.map((f) => f.dx))).toBeGreaterThan(0);
    expect(frames.at(-1)?.dx ?? 1).toBeCloseTo(0, 2);
  });

  it('hops up and lands back', () => {
    const { frames, e } = run('hop', HOP_S + 0.1);
    expect(Math.max(...frames.map((f) => f.dy))).toBeCloseTo(HOP_HEIGHT, 1);
    expect(frames.at(-1)?.dy).toBe(0);
    expect(e.hopT).toBe(-1);
  });

  it('squashes on a stamp slam and springs back', () => {
    const { frames } = run('stampSlam', 2);
    expect(frames[0]?.sy ?? 1).toBeLessThan(0.6);
    expect(frames.at(-1)?.sy ?? 0).toBeCloseTo(1, 2);
  });

  it('crumples down to nothing', () => {
    const { frames, e } = run('crumple', CRUMPLE_S + 0.05);
    expect(frames.at(-1)?.sxz ?? 1).toBeCloseTo(0, 3);
    expect(e.crumpleT).toBeGreaterThanOrEqual(CRUMPLE_S);
  });

  it('only shrinks with reduced motion: no slide, hop or squash', () => {
    for (const trigger of ['slideIn', 'hop', 'stampSlam', 'place', 'tremble']) {
      const e = createEffects();
      expect(triggerEffect(e, trigger, true)).toBe(false);
    }
    const { frames } = run('crumple', CRUMPLE_S / 2, true);
    expect(frames.every((f) => f.roll === 0 && f.sy <= 1)).toBe(true);
  });

  it('ignores triggers that are not folder effects', () => {
    expect(triggerEffect(createEffects(), 'cheer', false)).toBe(false);
  });
});

describe('folder props', () => {
  it('has a distinct vertex-coloured prop for every story type', () => {
    const props = createFolderProps();
    const counts = new Set<number>();
    for (const type of storyTypeSchema.options) {
      const geometry = props[type];
      expect(geometry.getAttribute('color')).toBeDefined();
      counts.add(geometry.getAttribute('position').count);
      geometry.dispose();
    }
    expect(counts.size).toBeGreaterThan(1);
  });
});
