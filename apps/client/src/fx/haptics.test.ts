import { describe, expect, it } from 'bun:test';
import { cues } from './cues.ts';
import {
  type HapticEnvironment,
  type HapticPattern,
  hapticPatternIds,
  hapticPatterns,
  MIN_PULSE_MS,
  planHaptic,
  playPlan,
  rumblePatterns,
} from './haptics.ts';

const full = { haptics: true, rumbleIntensity: 1 };

describe('haptic pattern table', () => {
  it('has the five feelings, each with a vibration and a rumble timeline', () => {
    expect(hapticPatternIds.sort()).toEqual(['alarm', 'error', 'success', 'thud', 'tick']);
    for (const id of hapticPatternIds) {
      expect(hapticPatterns[id].length).toBeGreaterThan(0);
      expect(rumblePatterns[id].length).toBeGreaterThan(0);
    }
  });

  it('keeps vibrations short enough for a phone and ordered by weight', () => {
    const total = (id: HapticPattern) => hapticPatterns[id].reduce((a, b) => a + b, 0);
    for (const id of hapticPatternIds) {
      expect(total(id)).toBeLessThanOrEqual(500);
      // Odd length: it starts and ends on a pulse, never on a pause.
      expect(hapticPatterns[id].length % 2).toBe(1);
    }
    expect(total('tick')).toBeLessThan(total('thud'));
    expect(total('thud')).toBeLessThan(total('error'));
    expect(total('error')).toBeLessThan(total('alarm'));
  });

  it('keeps rumble magnitudes in range and steps in order', () => {
    for (const id of hapticPatternIds) {
      let previousEnd = 0;
      for (const step of rumblePatterns[id]) {
        expect(step.strong).toBeGreaterThanOrEqual(0);
        expect(step.strong).toBeLessThanOrEqual(1);
        expect(step.weak).toBeLessThanOrEqual(1);
        expect(step.start).toBeGreaterThanOrEqual(previousEnd);
        previousEnd = step.start + step.duration;
      }
    }
  });

  it('is used by cues only with known patterns', () => {
    for (const cue of Object.values(cues)) {
      if ('haptic' in cue && cue.haptic) {
        expect(hapticPatternIds).toContain(cue.haptic);
      }
    }
  });

  it('gives emergencies the alarm and mistakes the error pattern', () => {
    expect(cues['event.bossCall.start'].haptic).toBe('alarm');
    expect(cues['verdict.fakePublished'].haptic).toBe('alarm');
    expect(cues['minigame.fail'].haptic).toBe('error');
    expect(cues['verdict.correct'].haptic).toBe('success');
  });
});

describe('planHaptic', () => {
  it('passes the pattern through at full intensity', () => {
    expect(planHaptic('alarm', full).vibration).toEqual([...hapticPatterns.alarm]);
  });

  it('is silent with haptics off or intensity 0', () => {
    for (const id of hapticPatternIds) {
      expect(planHaptic(id, { haptics: false, rumbleIntensity: 1 })).toEqual({
        vibration: null,
        rumble: [],
      });
      expect(planHaptic(id, { haptics: true, rumbleIntensity: 0 })).toEqual({
        vibration: null,
        rumble: [],
      });
    }
  });

  it('scales pulses and rumble magnitudes but keeps the pauses', () => {
    const plan = planHaptic('error', { haptics: true, rumbleIntensity: 0.5 });
    expect(plan.vibration).toEqual([23, 40, 23]);
    expect(plan.rumble[0]?.strong).toBeCloseTo(0.35);
    expect(plan.rumble[0]?.duration).toBe(90);
  });

  it('drops a tick that scales below what a motor can feel', () => {
    const faint = planHaptic('tick', { haptics: true, rumbleIntensity: 0.3 });
    expect(Math.round(8 * 0.3)).toBeLessThan(MIN_PULSE_MS);
    expect(faint.vibration).toBeNull();
    expect(faint.rumble.length).toBe(1);
  });

  it('clamps out-of-range intensity', () => {
    expect(planHaptic('thud', { haptics: true, rumbleIntensity: 5 }).vibration).toEqual([28]);
  });
});

describe('playPlan', () => {
  it('vibrates and rumbles every connected pad with a vibration actuator', () => {
    const vibrations: number[][] = [];
    const effects: { strongMagnitude: number }[] = [];
    const delays: number[] = [];
    const pad = {
      connected: true,
      vibrationActuator: {
        playEffect: (_type: string, params: { strongMagnitude: number }) => {
          effects.push(params);
          return Promise.resolve('complete');
        },
      },
    } as unknown as Gamepad;
    const env: HapticEnvironment = {
      vibrate: (pattern) => {
        vibrations.push(pattern);
        return true;
      },
      gamepads: () => [null, pad],
      schedule: (fn, ms) => {
        delays.push(ms);
        fn();
      },
    };
    playPlan(planHaptic('success', full), env);
    expect(vibrations).toEqual([[12, 45, 24]]);
    expect(delays).toEqual([90]);
    expect(effects.length).toBe(2);
  });

  it('falls back to the legacy pulse actuator', () => {
    const pulses: [number, number][] = [];
    const pad = {
      connected: true,
      hapticActuators: [
        {
          pulse: (value: number, duration: number) => {
            pulses.push([value, duration]);
            return Promise.resolve(true);
          },
        },
      ],
    } as unknown as Gamepad;
    playPlan(planHaptic('thud', full), { gamepads: () => [pad] });
    expect(pulses).toEqual([[0.5, 80]]);
  });

  it('survives missing APIs and throwing ones', () => {
    expect(() => playPlan(planHaptic('alarm', full), {})).not.toThrow();
    expect(() =>
      playPlan(planHaptic('alarm', full), {
        vibrate: () => {
          throw new Error('blocked');
        },
        gamepads: () => {
          throw new Error('blocked');
        },
      }),
    ).not.toThrow();
  });

  it('does nothing for a silent plan', () => {
    let called = false;
    playPlan(planHaptic('alarm', { haptics: false, rumbleIntensity: 1 }), {
      vibrate: () => {
        called = true;
        return true;
      },
      gamepads: () => {
        called = true;
        return [];
      },
    });
    expect(called).toBe(false);
  });
});
