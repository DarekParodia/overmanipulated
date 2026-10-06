import { describe, expect, it } from 'bun:test';
import { type Folder, gameEventSchema } from '@redakcja/shared';
import { loadSettings } from '../store/settings.ts';
import { animateCharacter, createAnimator } from './animation/procedural.ts';
import { stepSpring } from './animation/spring.ts';
import { createLoopManager } from './audio/loops.ts';
import sprite from './audio/sfx-sprite.json';
import { addTrauma, createShake, stepShake } from './camera/shake.ts';
import { type Cue, cueIds, cues } from './cues.ts';
import { TICK_FAST_MS, TICK_SLOW_MS, tickIntervalMs, urgentTimeLeft } from './deadline-ticker.ts';
import { cueForEvent, type GameplayEvent, wrongVerdictCue } from './event-cues.ts';
import { createFeedback, resolveCue } from './feedback.ts';
import { crossedLastSeconds } from './gameplay-feedback.ts';
import { createPool, scaleAt, spawn, stepPool } from './particles/pool.ts';
import { particleCapacity, particlePresets } from './particles/presets.ts';
import { createHitStop, HIT_STOP_SCALE, timeScaleAt, triggerHitStop } from './time-scale.ts';

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
      if ('extraParticles' in cue) {
        expect(Object.keys(particlePresets)).toContain(cue.extraParticles.preset);
      }
    }
  });

  it('plays loops from looping sprites', () => {
    const map = sprite as unknown as Record<string, [number, number, boolean]>;
    expect(map.keys?.[2]).toBe(true);
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
    expect(calls).toEqual([
      'sound:stamp',
      'particles:paperBits',
      'particles:inkSplat',
      'shake',
      'anim:stampSlam',
    ]);
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

// --- S2-12 core gameplay feedback -------------------------------------------------------------

const player = 'p1';
/** One example of every gameplay event kind. */
const everyEvent: GameplayEvent[] = [
  { kind: 'folderSpawned', folderId: 'f1', storyId: 's1', fixtureId: 'conveyor-0' },
  { kind: 'folderPickedUp', folderId: 'f1', playerId: player },
  {
    kind: 'folderPutDown',
    folderId: 'f1',
    playerId: player,
    location: { kind: 'fixture', fixtureId: 'table-0' },
  },
  { kind: 'deadlineWarning', folderId: 'f1' },
  { kind: 'folderExpired', folderId: 'f1', storyId: 's1' },
  { kind: 'deadlineExtended', folderId: 'f1', playerId: player },
  { kind: 'workStarted', stationId: 'imageSearch-0', playerId: player },
  { kind: 'workCancelled', stationId: 'imageSearch-0', playerId: player },
  {
    kind: 'minigameStarted',
    stationId: 'imageSearch-0',
    station: 'imageSearch',
    playerId: player,
    folderId: 'f1',
    seed: 1,
  },
  { kind: 'minigameFailed', stationId: 'imageSearch-0', playerId: player, folderId: 'f1' },
  {
    kind: 'stampApplied',
    stationId: 'imageSearch-0',
    playerId: player,
    folderId: 'f1',
    stampId: 'x',
  },
  { kind: 'deskOpened', deskId: 'desk-0', playerId: player, folderId: 'f1' },
  { kind: 'deskClosed', deskId: 'desk-0', playerId: player },
  {
    kind: 'verdictResult',
    folderId: 'f1',
    storyId: 's1',
    playerId: player,
    verdict: 'publish',
    justifyingStampId: 'x',
    outcome: 'correct',
    scoreDelta: 100,
    credibilityDelta: 0,
    speedBonus: false,
    missedStampIds: [],
  },
  { kind: 'ping', playerId: player, ping: 'needArchive' },
];

describe('gameplay event cues', () => {
  it('covers every gameplay event kind with a cue that has sound and a visual layer', () => {
    const kinds = new Set<string>(everyEvent.map((e) => e.kind));
    const all = gameEventSchema.options.map((o) => o.shape.kind.value as string);
    const sessionKinds = ['playerJoined', 'playerLeft', 'playerReconnected', 'gameStarted'];
    expect([...kinds].sort()).toEqual(all.filter((k) => !sessionKinds.includes(k)).sort());
    for (const event of everyEvent) {
      const cue: Cue = cues[cueForEvent(event, () => 'true')];
      expect(cue.sound).toBeDefined();
      // Audio-only information does not exist: particles or an animation trigger too.
      expect(cue.particles !== undefined || cue.animation !== undefined).toBe(true);
    }
    for (const ping of ['needArchive', 'fake', 'mine'] as const) {
      expect(cueForEvent({ kind: 'ping', playerId: player, ping }, () => undefined)).toBe(
        `ping.${ping}`,
      );
    }
  });

  it('maps verdict outcomes by severity', () => {
    const verdict = everyEvent.find((e) => e.kind === 'verdictResult');
    if (verdict?.kind !== 'verdictResult') {
      throw new Error('fixture missing');
    }
    expect(cueForEvent(verdict, () => 'true')).toBe('verdict.correct');
    expect(cueForEvent({ ...verdict, verdict: 'publishWithContext' }, () => 'misleading')).toBe(
      'verdict.contextCorrect',
    );
    expect(cueForEvent({ ...verdict, outcome: 'wrongJustification' }, () => 'true')).toBe(
      'verdict.wrongJustification',
    );
    expect(cueForEvent({ ...verdict, outcome: 'wrong' }, () => 'false')).toBe(
      'verdict.fakePublished',
    );
    expect(wrongVerdictCue('publishWithContext', 'unverifiable')).toBe('verdict.fakePublished');
    expect(wrongVerdictCue('publish', 'satire')).toBe('verdict.fakePublished');
    expect(wrongVerdictCue('reject', 'true')).toBe('verdict.truthRejected');
    expect(wrongVerdictCue('publishWithContext', 'true')).toBe('verdict.wrong');
    expect(wrongVerdictCue('publish', undefined)).toBe('verdict.fakePublished');
    // A published fake must feel worse than an expired folder (game-feel.md, severity).
    const fake: Cue = cues['verdict.fakePublished'];
    const expired: Cue = cues['folder.expired'];
    expect(fake.severity).toBeGreaterThan(expired.severity);
    expect(fake.shake ?? 0).toBeGreaterThan(expired.shake ?? 0);
  });

  it('starts the work loop on work start and stops it on cancel, minigame and stamp', () => {
    const calls: string[] = [];
    const fb = createFeedback(
      () => defaults,
      () => 'high',
    );
    fb.connect({
      startLoop: (key, loop) => calls.push(`start:${key}:${loop}`),
      stopLoop: (key) => calls.push(`stop:${key ?? 'all'}`),
    });
    const at = { loopKey: 'imageSearch-0' };
    fb.emit('station.workStart', at);
    fb.emit('station.workCancel', at);
    fb.emit('minigame.start', at);
    fb.emit('stamp.applied', at);
    fb.emit('stamp.applied');
    fb.emit('level.win');
    expect(calls).toEqual([
      'start:imageSearch-0:typewriter',
      'stop:imageSearch-0',
      'stop:imageSearch-0',
      'stop:imageSearch-0',
      'stop:all',
    ]);
  });

  it('skips haptics for cues about other players and passes accessibility options', () => {
    const calls: string[] = [];
    const fb = createFeedback(
      () => ({ ...defaults, haptics: true, noFlash: true, reducedMotion: false }),
      () => 'high',
    );
    fb.connect({
      vibrate: (pattern) => calls.push(`vibrate:${pattern}`),
      hitStop: (ms) => calls.push(`hitStop:${ms}`),
    });
    fb.emit('stamp.applied', { remote: true });
    fb.emit('stamp.applied', { remote: false });
    expect(calls.filter((c) => !c.startsWith('stampSlam'))).toEqual(['hitStop:60', 'vibrate:thud']);
    calls.length = 0;
    fb.onAnimation((trigger, _context, options) =>
      calls.push(`${trigger}:${options.noFlash}:${options.reducedMotion}`),
    );
    fb.emit('folder.pickup', { remote: true });
    fb.emit('folder.pickup', { remote: false });
    expect(calls).toEqual(['hop:true:false', 'vibrate:tick', 'hop:true:false']);
  });

  it('keeps every burst within a third of the particle pool', () => {
    for (const quality of ['low', 'medium', 'high'] as const) {
      for (const id of cueIds) {
        const resolved = resolveCue(cues[id], { ...defaults, reducedMotion: false }, quality);
        const burst = (resolved.particles?.count ?? 0) + (resolved.extraParticles?.count ?? 0);
        expect(burst).toBeLessThanOrEqual(particleCapacity[quality] / 3);
      }
    }
  });
});

describe('reduced motion for gameplay cues', () => {
  it('removes hit-stop and shake, thins particles, keeps sound and animation triggers', () => {
    const motion = { ...defaults, reducedMotion: false };
    const still = { ...defaults, reducedMotion: true };
    for (const id of ['stamp.applied', 'verdict.fakePublished', 'folder.expired'] as const) {
      const normal = resolveCue(cues[id], motion, 'high');
      const reduced = resolveCue(cues[id], still, 'high');
      expect(normal.shake).toBeGreaterThan(0);
      expect(reduced.shake).toBe(0);
      expect(reduced.hitStopMs).toBe(0);
      expect(reduced.sound).toEqual(normal.sound);
      expect(reduced.animations).toEqual(normal.animations);
      expect(reduced.particles?.count ?? 0).toBeLessThan(normal.particles?.count ?? 0);
      expect(reduced.particles?.count ?? 0).toBeGreaterThan(0);
    }
    expect(resolveCue(cues['stamp.applied'], motion, 'high').hitStopMs).toBe(60);
  });
});

describe('hit-stop', () => {
  it('slows the FX clock briefly and caps stacked impacts', () => {
    const state = createHitStop();
    expect(timeScaleAt(state, 0)).toBe(1);
    triggerHitStop(state, 60, 1000);
    expect(timeScaleAt(state, 1030)).toBe(HIT_STOP_SCALE);
    expect(timeScaleAt(state, 1061)).toBe(1);
    triggerHitStop(state, 10_000, 2000);
    expect(timeScaleAt(state, 2200)).toBe(1);
    // Chained impacts during a freeze do not extend it.
    triggerHitStop(state, 60, 3000);
    triggerHitStop(state, 60, 3040);
    expect(timeScaleAt(state, 3070)).toBe(1);
  });
});

describe('loop manager', () => {
  it('starts one loop per key, stops by key or all', () => {
    const calls: string[] = [];
    let next = 1;
    const manager = createLoopManager({
      start: (id) => {
        calls.push(`start:${id}`);
        return next++;
      },
      stop: (handle) => calls.push(`stop:${handle}`),
    });
    const layer = { ids: ['keys'], bus: 'sfx' } as const;
    manager.start('a', layer, 0);
    manager.start('a', layer, 10);
    manager.start('b', layer, 20);
    expect(manager.active().get('a')).toBe(10);
    manager.stop('a');
    manager.stop('a');
    manager.stop();
    expect(calls).toEqual(['start:keys', 'start:keys', 'stop:1', 'stop:2']);
    expect(manager.active().size).toBe(0);
  });
});

describe('deadline ticker', () => {
  const folder = (deadlineMs: number, warned: boolean): Folder => ({
    id: `f${deadlineMs}`,
    storyId: 's',
    location: { kind: 'floor', x: 1, y: 1 },
    stamps: [],
    spawnedAtMs: 0,
    deadlineMs,
    warned,
  });

  it('ticks for the most urgent warned folder only, and stops when none is left', () => {
    expect(urgentTimeLeft([folder(20_000, false)], 15_000)).toBeNull();
    expect(urgentTimeLeft([folder(20_000, true), folder(18_000, true)], 15_000)).toBe(3000);
    expect(urgentTimeLeft([folder(20_000, true)], 21_000)).toBeNull();
    expect(urgentTimeLeft([], 0)).toBeNull();
    // Deadline extended past the warning window: no ticking although `warned` stays set.
    expect(urgentTimeLeft([folder(40_000, true)], 15_000)).toBeNull();
  });

  it('speeds up as the deadline nears', () => {
    expect(tickIntervalMs(60_000)).toBe(TICK_SLOW_MS);
    expect(tickIntervalMs(0)).toBe(TICK_FAST_MS);
    expect(tickIntervalMs(2000)).toBeLessThan(tickIntervalMs(8000));
  });
});

describe('level timer', () => {
  it('fires the last-seconds sting once when crossing 30 s, never on reset', () => {
    expect(crossedLastSeconds(30_050, 29_990)).toBe(true);
    expect(crossedLastSeconds(29_990, 29_940)).toBe(false);
    expect(crossedLastSeconds(0, 360_000)).toBe(false);
    expect(crossedLastSeconds(40_000, 0)).toBe(false);
    // Resuming after a reconnect at 12 s left is not a fresh crossing.
    expect(crossedLastSeconds(45_000, 12_000)).toBe(false);
  });
});
