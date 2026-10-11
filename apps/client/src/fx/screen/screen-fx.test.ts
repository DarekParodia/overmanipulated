import { describe, expect, it } from 'bun:test';
import { CREDIBILITY_LOW, DEADLINE_WARNING_MS, type Folder } from '@redakcja/shared';
import { addPunch, createPunch, PUNCH_MAX, stepPunch } from '../camera/punch.ts';
import { particlePresets } from '../particles/presets.ts';
import { drawSpriteAtlas, frameIndex, spriteFrames } from '../particles/sprites.ts';
import {
  effectsAnimated,
  glitchAnimated,
  isRaidActive,
  pressureTier,
  VIGNETTE_MIN_LEVEL,
  vignetteLevel,
} from './screen-fx-model.ts';

const folder = (deadlineMs: number, tag?: Folder['tag']) =>
  ({ id: 'f', deadlineMs, tag }) as unknown as Folder;

describe('vignette', () => {
  it('is off at the low-credibility threshold and grows below it', () => {
    expect(vignetteLevel(100)).toBe(0);
    expect(vignetteLevel(CREDIBILITY_LOW)).toBe(0);
    expect(vignetteLevel(CREDIBILITY_LOW - 1)).toBeGreaterThanOrEqual(VIGNETTE_MIN_LEVEL);
    expect(vignetteLevel(10)).toBeGreaterThan(vignetteLevel(25));
    expect(vignetteLevel(0)).toBe(1);
    expect(vignetteLevel(-5)).toBe(1);
  });
});

describe('raid and pressure', () => {
  it('detects bot raid tags', () => {
    expect(isRaidActive([folder(1)])).toBe(false);
    expect(isRaidActive([folder(1), folder(1, { kind: 'botRaid', raidId: 'r' })])).toBe(true);
  });

  it('tiers by the most urgent deadline under 10 s', () => {
    expect(pressureTier([], 0)).toBe(0);
    expect(pressureTier([folder(DEADLINE_WARNING_MS + 1)], 0)).toBe(0);
    expect(pressureTier([folder(DEADLINE_WARNING_MS - 1)], 0)).toBe(1);
    expect(pressureTier([folder(9000), folder(3000)], 0)).toBe(2);
    expect(pressureTier([folder(500)], 1000)).toBe(0);
  });
});

describe('motion settings', () => {
  it('stops everything with reduced motion or no-flash, the glitch also on low', () => {
    expect(effectsAnimated({ reducedMotion: false, noFlash: false })).toBe(true);
    expect(effectsAnimated({ reducedMotion: true, noFlash: false })).toBe(false);
    expect(effectsAnimated({ reducedMotion: false, noFlash: true })).toBe(false);
    expect(glitchAnimated({ reducedMotion: false, noFlash: false }, 'low')).toBe(false);
    expect(glitchAnimated({ reducedMotion: false, noFlash: false }, 'medium')).toBe(true);
  });
});

describe('camera punch', () => {
  it('ignores weak impacts, caps stacked ones and recovers', () => {
    const state = createPunch();
    addPunch(state, 0.1);
    expect(stepPunch(state, 0)).toBe(1);
    for (let i = 0; i < 10; i++) {
      addPunch(state, 0.7);
    }
    expect(state.amount).toBe(PUNCH_MAX);
    expect(stepPunch(state, 0)).toBeLessThan(1);
    expect(stepPunch(state, 2)).toBe(1);
  });
});

describe('particle sprites', () => {
  it('fits every frame in the 4x4 atlas and every preset uses existing frames', () => {
    expect(spriteFrames.length).toBeLessThanOrEqual(16);
    for (const preset of Object.values(particlePresets)) {
      for (const frame of 'frames' in preset ? preset.frames : []) {
        expect(frameIndex(frame)).toBeGreaterThanOrEqual(0);
      }
    }
    expect(new Set(spriteFrames).size).toBe(spriteFrames.length);
    expect(typeof drawSpriteAtlas).toBe('function');
  });
});
