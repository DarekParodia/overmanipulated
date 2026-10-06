import { describe, expect, it } from 'bun:test';
import { loadSettings } from '../store/settings.ts';
import { animateCharacter, createAnimator } from './animation/procedural.ts';
import { stepSpring } from './animation/spring.ts';
import sprite from './audio/sfx-sprite.json';
import { addTrauma, createShake, stepShake } from './camera/shake.ts';
import { cueIds, cues } from './cues.ts';
import { createFeedback, resolveCue } from './feedback.ts';
import { createPool, scaleAt, spawn, stepPool } from './particles/pool.ts';
import { particlePresets } from './particles/presets.ts';

const defaults = loadSettings(null);
const particle = {
  x: 0,
  y: 0,
  z: 0.5,
  vx: 1,
  vy: 0,
  vz: 0,
  life: 1,
  size: 0.1,
  gravity: 0,
  drag: 0,
  color: 0,
};

describe('cue catalogue', () => {
  it('references only existing sounds and particle presets', () => {
    for (const id of cueIds) {
      const cue = cues[id];
      if ('sound' in cue) {
        for (const sound of cue.sound.ids) {
          expect(Object.keys(sprite)).toContain(sound);
        }
      }
      if ('particles' in cue) {
        expect(Object.keys(particlePresets)).toContain(cue.particles.preset);
      }
    }
  });

  it('has an entry for every cue documented as implemented in stage 1', () => {
    for (const id of ['player.join', 'player.step', 'ui.click', 'ui.copy', 'game.start']) {
      expect(cueIds).toContain(id as (typeof cueIds)[number]);
    }
  });
});

describe('cue resolution respects settings', () => {
  it('mute drops sound only', () => {
    const resolved = resolveCue(cues['stamp.applied'], { ...defaults, muted: true }, 'high');
    expect(resolved.sound).toBeNull();
    expect(resolved.particles).not.toBeNull();
  });

  it('reduced motion removes shake and thins particles but keeps them', () => {
    const normal = resolveCue(cues['stamp.applied'], { ...defaults, reducedMotion: false }, 'high');
    const reduced = resolveCue(cues['stamp.applied'], { ...defaults, reducedMotion: true }, 'high');
    expect(normal.shake).toBeGreaterThan(0);
    expect(reduced.shake).toBe(0);
    expect(reduced.particles?.count).toBeLessThan(normal.particles?.count ?? 0);
    expect(reduced.particles?.count).toBeGreaterThan(0);
  });

  it('haptics off removes vibration; low quality spawns fewer particles', () => {
    expect(
      resolveCue(cues['game.start'], { ...defaults, haptics: false }, 'high').haptic,
    ).toBeNull();
    const low = resolveCue(cues['player.join'], defaults, 'low').particles?.count ?? 0;
    const high = resolveCue(cues['player.join'], defaults, 'high').particles?.count ?? 0;
    expect(low).toBeLessThan(high);
  });

  it('dispatches to connected outputs and stops after disconnect', () => {
    const calls: string[] = [];
    const fb = createFeedback(
      () => ({ ...defaults, reducedMotion: false }),
      () => 'high',
    );
    const disconnect = fb.connect({
      playSound: (ids) => calls.push(`sound:${ids[0]}`),
      spawnParticles: (preset) => calls.push(`particles:${preset}`),
      addTrauma: () => calls.push('shake'),
    });
    const stop = fb.onAnimation((trigger) => calls.push(`anim:${trigger}`));
    fb.emit('stamp.applied', { position: { x: 1, y: 1 } });
    expect(calls).toEqual(['sound:stamp', 'particles:paperBits', 'shake', 'anim:stampSlam']);
    disconnect();
    stop();
    calls.length = 0;
    fb.emit('stamp.applied', { position: { x: 1, y: 1 } });
    expect(calls).toEqual([]);
  });
});

describe('particle pool', () => {
  it('reuses slots without growing and frees dead particles', () => {
    const pool = createPool(4);
    for (let i = 0; i < 10; i++) {
      spawn(pool, particle);
    }
    expect(pool.count).toBe(4);
    stepPool(pool, 2);
    expect(pool.count).toBe(0);
  });

  it('moves particles and lands them on the floor', () => {
    const pool = createPool(1);
    spawn(pool, { ...particle, gravity: 10, vz: 0 });
    stepPool(pool, 0.5);
    expect(pool.px[0]).toBeCloseTo(0.5, 5);
    expect(pool.pz[0]).toBe(0);
  });

  it('grows then shrinks to zero over its life', () => {
    const pool = createPool(1);
    spawn(pool, particle);
    stepPool(pool, 0.3);
    const mid = scaleAt(pool, 0);
    stepPool(pool, 0.69);
    expect(mid).toBeCloseTo(0.1, 5);
    expect(scaleAt(pool, 0)).toBeLessThan(0.01);
  });
});

describe('camera shake', () => {
  it('decays trauma to zero', () => {
    const shake = createShake();
    addTrauma(shake, 0.5);
    const first = stepShake(shake, 0.016);
    expect(Math.abs(first.x) + Math.abs(first.y)).toBeGreaterThan(0);
    for (let i = 0; i < 100; i++) {
      stepShake(shake, 0.016);
    }
    expect(shake.trauma).toBe(0);
  });
});

describe('spring', () => {
  it('stays stable and settles even with very long frames (slow devices)', () => {
    const state = { value: 0.2, velocity: 0 };
    for (let i = 0; i < 20; i++) {
      stepSpring(state, 1, 0.2, 5, 0.35);
      expect(Number.isFinite(state.value)).toBe(true);
      expect(state.value).toBeGreaterThan(0);
    }
    expect(state.value).toBeCloseTo(1, 2);
  });
});

describe('procedural animation', () => {
  it('keeps a positive, finite squash at low frame rates', () => {
    const animator = createAnimator();
    for (let i = 0; i < 40; i++) {
      const { pose } = animateCharacter(animator, i % 10 < 5, 0.12, false);
      expect(Number.isFinite(pose.squash)).toBe(true);
      expect(pose.squash).toBeGreaterThan(0.5);
    }
  });

  it('emits start, footsteps and stop events', () => {
    const animator = createAnimator();
    const start = animateCharacter(animator, true, 0.016, false);
    expect(start.events.started).toBe(true);
    let steps = 0;
    for (let i = 0; i < 60; i++) {
      if (animateCharacter(animator, true, 1 / 60, false).events.footstep) {
        steps++;
      }
    }
    // 2.4 cycles/s × 2 feet × 1 s ≈ 4–5 steps.
    expect(steps).toBeGreaterThanOrEqual(4);
    expect(steps).toBeLessThanOrEqual(5);
    expect(animateCharacter(animator, false, 0.016, false).events.stopped).toBe(true);
  });

  it('holds a neutral pose with reduced motion', () => {
    const animator = createAnimator();
    const { pose } = animateCharacter(animator, true, 0.1, true);
    expect(pose).toEqual({ bob: 0, lean: 0, squash: 1 });
  });
});
