import { describe, expect, it } from 'bun:test';
import { ADAPTIVE, createAdaptiveController } from './adaptive-quality.ts';
import { degradeLadder, detectPreset, profileFor } from './quality.ts';

const SLOW = 0.03;
const GOOD = 1 / 60;

/** Feeds `seconds` of frames of one length; returns the decisions that were not 0. */
function run(
  controller: ReturnType<typeof createAdaptiveController>,
  seconds: number,
  frameS: number,
  stage: { value: number },
  maxStage: number,
): number[] {
  const decisions: number[] = [];
  for (let t = 0; t < seconds; t += frameS) {
    const decision = controller.update(frameS, stage.value, maxStage);
    if (decision !== 0) {
      stage.value += decision;
      decisions.push(decision);
    }
  }
  return decisions;
}

/** Feeds good frames until the controller wins one step back; returns false if it never does. */
function recoverOnce(
  controller: ReturnType<typeof createAdaptiveController>,
  stage: { value: number },
): boolean {
  for (let i = 0; i < 60 * 600; i++) {
    const decision = controller.update(GOOD, stage.value, 4);
    stage.value += decision;
    if (decision === -1) {
      return true;
    }
  }
  return false;
}

describe('adaptive quality controller', () => {
  it('steps down after a few slow seconds, not before', () => {
    const c = createAdaptiveController();
    const stage = { value: 0 };
    expect(run(c, ADAPTIVE.SETTLE_S + 2, SLOW, stage, 4)).toEqual([]);
    expect(run(c, 3, SLOW, stage, 4)).toEqual([1]);
    expect(stage.value).toBe(1);
  });

  it('keeps stepping down while the game stays slow, and stops at the end of the ladder', () => {
    const c = createAdaptiveController();
    const stage = { value: 0 };
    run(c, 120, SLOW, stage, 3);
    expect(stage.value).toBe(3);
  });

  it('ignores stalls such as a hidden tab', () => {
    const c = createAdaptiveController();
    const stage = { value: 0 };
    for (let i = 0; i < 100; i++) {
      c.update(2, stage.value, 4);
      c.update(GOOD, stage.value, 4);
    }
    expect(stage.value).toBe(0);
  });

  it('degrades a device that only produces very long frames', () => {
    const c = createAdaptiveController();
    const stage = { value: 0 };
    run(c, 60, 0.4, stage, 4);
    expect(stage.value).toBeGreaterThan(0);
  });

  it('degrades when long frames alternate with quick ones (GPU backlog)', () => {
    const c = createAdaptiveController();
    const stage = { value: 0 };
    for (let i = 0; i < 400; i++) {
      stage.value += c.update(i % 2 ? 0.4 : GOOD, stage.value, 4);
    }
    expect(stage.value).toBeGreaterThan(0);
  });

  it('does not degrade on a single hitch in a healthy game', () => {
    const c = createAdaptiveController();
    const stage = { value: 0 };
    for (let i = 0; i < 60 * 120; i++) {
      stage.value += c.update(i % 600 === 0 ? 0.3 : GOOD, stage.value, 4);
    }
    expect(stage.value).toBe(0);
  });

  it('does not react to a healthy game', () => {
    const c = createAdaptiveController();
    const stage = { value: 0 };
    expect(run(c, 300, GOOD, stage, 4)).toEqual([]);
  });

  it('recovers one step after a long comfortable stretch', () => {
    const c = createAdaptiveController();
    const stage = { value: 2 };
    expect(run(c, 10, GOOD, stage, 4)).toEqual([]);
    expect(run(c, ADAPTIVE.FAST_WINDOWS + ADAPTIVE.SETTLE_S + 2, GOOD, stage, 4)).toEqual([-1]);
    expect(stage.value).toBe(1);
  });

  it('puts a failed recovery back, never tries that step again and stops after two relapses', () => {
    const c = createAdaptiveController();
    const stage = { value: 1 };
    // First attempt: recover, then slow again at once.
    expect(recoverOnce(c, stage)).toBe(true);
    expect(stage.value).toBe(0);
    run(c, 6, SLOW, stage, 4);
    expect(stage.value).toBe(1);
    expect(c.state.relapses).toBe(1);
    expect(c.state.minStage).toBe(1);
    expect(c.state.fastNeeded).toBe(ADAPTIVE.FAST_WINDOWS * 2);
    // Fast forever: step 1 is blocked by minStage, so nothing changes.
    expect(run(c, 600, GOOD, stage, 4)).toEqual([]);
    expect(stage.value).toBe(1);
  });

  it('turns recovery off after repeated relapses', () => {
    const c = createAdaptiveController();
    const stage = { value: 2 };
    expect(recoverOnce(c, stage)).toBe(true);
    run(c, 6, SLOW, stage, 4);
    expect(c.state.relapses).toBe(1);
    run(c, 30, SLOW, stage, 4);
    expect(stage.value).toBe(4);
    expect(recoverOnce(c, stage)).toBe(true);
    run(c, 6, SLOW, stage, 4);
    expect(c.state.relapses).toBe(ADAPTIVE.MAX_RELAPSES);
    expect(c.state.recoveryOff).toBe(true);
    const before = stage.value;
    expect(run(c, 1000, GOOD, stage, 4)).toEqual([]);
    expect(stage.value).toBe(before);
  });

  it('does not count a slow spell long after a recovery as a relapse', () => {
    const c = createAdaptiveController();
    const stage = { value: 1 };
    expect(recoverOnce(c, stage)).toBe(true);
    expect(stage.value).toBe(0);
    run(c, ADAPTIVE.RELAPSE_S + 5, GOOD, stage, 4);
    run(c, 6, SLOW, stage, 4);
    expect(stage.value).toBe(1);
    expect(c.state.relapses).toBe(0);
  });

  it('forgets everything on reset', () => {
    const c = createAdaptiveController();
    const stage = { value: 1 };
    expect(recoverOnce(c, stage)).toBe(true);
    run(c, 6, SLOW, stage, 4);
    c.reset();
    expect(c.state.relapses).toBe(0);
    expect(c.state.minStage).toBe(0);
  });
});

describe('degrade ladder', () => {
  it('cuts particles first, then shadows, then DPR, then props, then outlines on high', () => {
    const ladder = degradeLadder(profileFor('high', false, 2));
    expect(ladder).toHaveLength(6);
    expect(ladder[1]).toMatchObject({ particleScale: 0.5, motes: false, shadows: true });
    expect(ladder[2]).toMatchObject({ shadows: false, maxDpr: 2 });
    expect(ladder[3]?.maxDpr).toBe(1.5);
    expect(ladder[4]?.detail).toBe(false);
    expect(ladder[5]?.outlines).toBe(false);
  });

  it('skips steps that would change nothing on low', () => {
    const ladder = degradeLadder(profileFor('low', true, 3));
    // particles, then outlines: shadows, DPR and detail are already minimal.
    expect(ladder).toHaveLength(3);
    expect(ladder[2]?.outlines).toBe(false);
  });

  it('every step is monotonic: nothing comes back at a deeper step', () => {
    const ladder = degradeLadder(profileFor('high', false, 2));
    for (let i = 1; i < ladder.length; i++) {
      const a = ladder[i - 1];
      const b = ladder[i];
      expect(b && a && b.maxDpr <= a.maxDpr).toBe(true);
      expect(b && a && b.particleScale <= a.particleScale).toBe(true);
      if (a && b && !a.shadows) expect(b.shadows).toBe(false);
      if (a && b && !a.detail) expect(b.detail).toBe(false);
    }
  });
});

describe('device detection', () => {
  it('starts desktops on high, integrated GPUs on medium, software renderers on low', () => {
    expect(detectPreset('NVIDIA GeForce RTX 3060', false)).toBe('high');
    expect(detectPreset('Intel(R) UHD Graphics 620', false)).toBe('medium');
    expect(detectPreset('Google SwiftShader', false)).toBe('low');
  });

  it('never starts a phone on high; weak phones start on low', () => {
    expect(detectPreset('Adreno (TM) 650', true, { deviceMemoryGb: 8, cores: 8 })).toBe('medium');
    expect(detectPreset('Adreno (TM) 650', true)).toBe('medium');
    expect(detectPreset('Mali-G52', true, { deviceMemoryGb: 4, cores: 8 })).toBe('low');
    expect(detectPreset('Mali-G52', true, { cores: 4 })).toBe('low');
    expect(detectPreset('Mali-T830', true, { deviceMemoryGb: 8, cores: 8 })).toBe('low');
  });

  it('caps the DPR at 1.5 on phones and 2 on desktops', () => {
    expect(profileFor('high', true, 3).maxDpr).toBe(1.5);
    expect(profileFor('high', false, 3).maxDpr).toBe(2);
    expect(profileFor('medium', false, 1).maxDpr).toBe(1);
  });
});
