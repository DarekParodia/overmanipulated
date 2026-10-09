import { describe, expect, test } from 'bun:test';
import { type HudMotion, hudMotions, motionAllowed, playMotion } from './hud-motion.ts';

const all = Object.keys(hudMotions) as HudMotion[];

describe('HUD motion', () => {
  test('everything plays with default settings', () => {
    for (const motion of all) {
      expect(motionAllowed(motion, { reducedMotion: false, noFlash: false })).toBe(true);
    }
  });

  test('reduced motion: no scale, shake or bounce at all', () => {
    for (const motion of all) {
      expect(motionAllowed(motion, { reducedMotion: true, noFlash: false })).toBe(false);
    }
  });

  test('no-flash: the timer stays steady, one-off motions still play', () => {
    expect(motionAllowed('pulse', { reducedMotion: false, noFlash: true })).toBe(false);
    expect(motionAllowed('shake', { reducedMotion: false, noFlash: true })).toBe(true);
  });

  test('plays on an element through the Web Animations API, and only when allowed', () => {
    const calls: unknown[] = [];
    const element = { animate: (...args: unknown[]) => calls.push(args) } as unknown as Element;
    playMotion(element, 'bump', { reducedMotion: false, noFlash: false });
    playMotion(element, 'bump', { reducedMotion: true, noFlash: false });
    playMotion(null, 'bump', { reducedMotion: false, noFlash: false });
    expect(calls).toHaveLength(1);
  });
});
