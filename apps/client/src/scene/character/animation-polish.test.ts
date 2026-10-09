// Stage 5 character polish (S5-02): stride matching, role fidgets, ping emotes, celebrations,
// hand IK, look-at, foot contacts and footstep gating.
import { describe, expect, it } from 'bun:test';
import { PING_KINDS, roleSchema } from '@redakcja/shared';
import { Quaternion, Vector3 } from 'three';
import {
  celebrationForRole,
  createCharacterController,
  createFidgetTimer,
  emoteForPing,
  FIDGET_FIRST_S,
  fidgetForRole,
  footSlideRatio,
  gestureForTrigger,
  locomotionRate,
  RATE_MAX,
  RATE_MIN,
  seededRandom,
  stepFidgetTimer,
  strideRate,
  targetBaseWeights,
  zeroWeights,
} from './controller.ts';
import {
  allowFootstep,
  createFootstepGate,
  isNearestRemote,
  STEP_GLOBAL_MAX,
  STEP_MIN_INTERVAL_S,
} from './footsteps.ts';
import {
  ARM_LENGTH,
  aimArmAt,
  carryAnchor,
  carryTarget,
  gloveAt,
  SHOULDER_L,
  SHOULDER_R,
  type Vec3,
  worldToTorso,
} from './hands.ts';
import { HEAD_LEAD_MAX, headLook, turnTowards, wrapAngle } from './look.ts';
import { createCharacterRig } from './rig.ts';
import { CELEBRATION_CLIPS, roleClips, UPPER_CLIPS } from './role-clips.ts';

const still = { moving: false, speedFraction: 0, carrying: false, working: false };
const origin = (): Vec3 => ({ x: 0, y: 0, z: 0 });
const DT = 1 / 30;

function walking(speedFraction: number) {
  return targetBaseWeights({ moving: true, speedFraction, carrying: false, working: false });
}

describe('stride matching', () => {
  it('keeps the planted foot close to the ground speed across the walking range', () => {
    for (const f of [0.35, 0.45, 0.55]) {
      const ratio = footSlideRatio(f, walking(f));
      expect(ratio).toBeGreaterThan(0.85);
      expect(ratio).toBeLessThan(1.15);
    }
  });

  it('stays within a fifth of the ground speed at a sprint, with and without a folder', () => {
    expect(Math.abs(footSlideRatio(1, walking(1)) - 1)).toBeLessThan(0.2);
    const carrying = targetBaseWeights({
      moving: true,
      speedFraction: 0.8,
      carrying: true,
      working: false,
    });
    expect(Math.abs(footSlideRatio(0.8, carrying) - 1)).toBeLessThan(0.2);
  });

  it('steps faster at higher speed and respects the cadence limits', () => {
    expect(strideRate(0.9)).toBeGreaterThan(strideRate(0.4));
    for (const f of [0, 0.1, 0.5, 1]) {
      const rate = locomotionRate(f, walking(f));
      expect(rate).toBeGreaterThanOrEqual(RATE_MIN);
      expect(rate).toBeLessThanOrEqual(RATE_MAX);
    }
    expect(locomotionRate(0.5, zeroWeights())).toBe(1);
  });
});

describe('role clips and triggers', () => {
  it('builds every fidget, emote and celebration with valid tracks', () => {
    const clips = roleClips();
    for (const name of [...UPPER_CLIPS, ...CELEBRATION_CLIPS]) {
      expect(clips[name].validate()).toBe(true);
      expect(clips[name].duration).toBeGreaterThan(0.8);
    }
  });

  it('keeps fidgets and emotes to the upper body so legs can keep walking', () => {
    const clips = roleClips();
    for (const name of UPPER_CLIPS) {
      const bones = new Set(clips[name].tracks.map((t) => t.name.split('.')[0]));
      expect(bones.has('legL')).toBe(false);
      expect(bones.has('legR')).toBe(false);
      expect(bones.has('hips')).toBe(false);
    }
  });

  it('gives every role its own fidget and celebration, other roles none', () => {
    const roles = roleSchema.options;
    expect(new Set(roles.map(fidgetForRole)).size).toBe(roles.length);
    expect(new Set(roles.map(celebrationForRole)).size).toBe(roles.length);
    expect(fidgetForRole(null)).toBeNull();
    expect(celebrationForRole(null)).toBe('cheer');
  });

  it('maps each ping kind to a distinct emote', () => {
    expect(new Set(PING_KINDS.map(emoteForPing)).size).toBe(PING_KINDS.length);
  });

  it('plays the role celebration only for the team-wide cheer', () => {
    expect(gestureForTrigger('cheer', { team: true, role: 'archivist' })).toBe('cheerArchive');
    expect(gestureForTrigger('cheer', { team: false, role: 'archivist' })).toBe('cheer');
    expect(gestureForTrigger('cheer')).toBe('cheer');
  });
});

describe('fidget timer', () => {
  it('fires after standing still for a few seconds, then again later', () => {
    const timer = createFidgetTimer(() => 0.5);
    let fired = 0;
    let firstAt = 0;
    for (let t = 0; t < 40; t += 0.1) {
      if (stepFidgetTimer(timer, true, 0.1)) {
        fired++;
        if (fired === 1) {
          firstAt = t;
        }
      }
    }
    expect(firstAt).toBeGreaterThan(FIDGET_FIRST_S - 0.2);
    expect(firstAt).toBeLessThan(FIDGET_FIRST_S + 0.3);
    expect(fired).toBeGreaterThanOrEqual(3);
  });

  it('starts over when the player moves', () => {
    const timer = createFidgetTimer(() => 0);
    for (let i = 0; i < 30; i++) {
      stepFidgetTimer(timer, true, 0.1);
    }
    stepFidgetTimer(timer, false, 0.1);
    expect(stepFidgetTimer(timer, true, 3.5)).toBe(false);
  });

  it('seeds players differently but each reproducibly', () => {
    expect(seededRandom(1)()).toBe(seededRandom(1)());
    expect(seededRandom(1)()).not.toBe(seededRandom(2)());
  });
});

describe('controller layers', () => {
  function setup(role: Parameters<typeof createCharacterRig>[1]) {
    const rig = createCharacterRig('#3a86ff', role, { shadows: false });
    const controller = createCharacterController(rig.root, { role, seed: 3 });
    return { rig, controller };
  }

  it('fidgets by role after standing still and cancels when the player moves', () => {
    const { rig, controller } = setup('photoEditor');
    for (let t = 0; t < FIDGET_FIRST_S + 0.5; t += DT) {
      controller.update(still, DT, DT);
    }
    expect(controller.upperClip).toBe('idlePhoto');
    const moving = { ...still, moving: true, speedFraction: 0.5 };
    for (let i = 0; i < 20; i++) {
      controller.update(moving, DT, DT);
    }
    expect(controller.upperClip).toBeNull();
    controller.dispose();
    rig.dispose();
  });

  it('never fidgets without a role, with reduced motion or while carrying', () => {
    const cases = [
      [null, still],
      ['archivist', { ...still, allowFidget: false }],
      ['archivist', { ...still, carrying: true }],
    ] as const;
    for (const [role, state] of cases) {
      const { rig, controller } = setup(role);
      for (let t = 0; t < 12; t += DT) {
        controller.update(state, DT, DT);
      }
      expect(controller.upperClip).toBeNull();
      controller.dispose();
      rig.dispose();
    }
  });

  it('lifts the arm for an emote while the legs keep walking', () => {
    const { rig, controller } = setup(null);
    const moving = { ...still, moving: true, speedFraction: 0.5 };
    for (let i = 0; i < 20; i++) {
      controller.update(moving, DT, DT);
    }
    controller.playUpper('emoteMine');
    for (let i = 0; i < 12; i++) {
      controller.update(moving, DT, DT);
    }
    expect(controller.upperClip).toBe('emoteMine');
    // The right arm hangs along -y at rest; during the emote it points up.
    const tip = new Vector3(0, -1, 0).applyQuaternion(rig.bones.armR.quaternion);
    expect(tip.y).toBeGreaterThan(0.5);
    // Legs still swing.
    expect(rig.bones.legL.quaternion.angleTo(new Quaternion())).toBeGreaterThan(0.05);
    for (let i = 0; i < 60; i++) {
      controller.update(moving, DT, DT);
    }
    expect(controller.upperClip).toBeNull();
    controller.dispose();
    rig.dispose();
  });

  it('emits about two foot contacts per cycle while walking and none standing', () => {
    const { rig, controller } = setup(null);
    const moving = { ...still, moving: true, speedFraction: 0.5 };
    for (let i = 0; i < 30; i++) {
      controller.update(moving, 1 / 60, 1 / 60);
    }
    controller.consumeSteps();
    const seconds = 4;
    for (let i = 0; i < seconds * 60; i++) {
      controller.update(moving, 1 / 60, 1 / 60);
    }
    const steps = controller.consumeSteps();
    const expected = (seconds * 2 * controller.rate) / 0.5;
    expect(steps).toBeGreaterThan(expected * 0.85);
    expect(steps).toBeLessThan(expected * 1.15);
    for (let i = 0; i < 90; i++) {
      controller.update(still, 1 / 60, 1 / 60);
    }
    controller.consumeSteps();
    for (let i = 0; i < 60; i++) {
      controller.update(still, 1 / 60, 1 / 60);
    }
    expect(controller.consumeSteps()).toBe(0);
    controller.dispose();
    rig.dispose();
  });

  it('does not advance the pose or footsteps on LOD frames without a mixer update', () => {
    const { rig, controller } = setup(null);
    const moving = { ...still, moving: true, speedFraction: 0.5 };
    for (let i = 0; i < 120; i++) {
      controller.update(moving, 1 / 60, 0);
    }
    expect(controller.consumeSteps()).toBe(0);
    controller.dispose();
    rig.dispose();
  });

  it('turns the head by the look yaw', () => {
    const { rig, controller } = setup(null);
    for (let i = 0; i < 20; i++) {
      controller.update({ ...still, lookYaw: 0.6 }, DT, DT);
    }
    expect(rig.bones.head.rotation.y).toBeGreaterThan(0.3);
    controller.dispose();
    rig.dispose();
  });

  it('holds both hands in front of the chest while carrying', () => {
    const { rig, controller } = setup(null);
    for (let i = 0; i < 30; i++) {
      controller.update({ ...still, carrying: true }, DT, DT);
    }
    for (const name of ['armL', 'armR'] as const) {
      const tip = new Vector3(0, -1, 0).applyQuaternion(rig.bones[name].quaternion);
      expect(tip.x).toBeGreaterThan(0.8);
    }
    controller.dispose();
    rig.dispose();
  });

  it('reaches towards a fixture and relaxes afterwards', () => {
    const { rig, controller } = setup(null);
    for (let i = 0; i < 10; i++) {
      controller.update(still, DT, DT);
    }
    controller.reachFor({ x: 0.8, y: 0.4, z: 0 });
    for (let i = 0; i < 8; i++) {
      controller.update(still, DT, DT);
    }
    const reaching = new Vector3(0, -1, 0).applyQuaternion(rig.bones.armR.quaternion);
    expect(reaching.x).toBeGreaterThan(0.5);
    for (let i = 0; i < 40; i++) {
      controller.update(still, DT, DT);
    }
    const relaxed = new Vector3(0, -1, 0).applyQuaternion(rig.bones.armR.quaternion);
    expect(relaxed.x).toBeLessThan(0.4);
    controller.dispose();
    rig.dispose();
  });

  it('shows a frozen pose at a fixed time for screenshots', () => {
    const { rig, controller } = setup('archivist');
    controller.seek('idleArchive', 0.7);
    controller.update(still, DT, DT);
    const first = rig.bones.armR.quaternion.clone();
    controller.update(still, DT, DT);
    expect(rig.bones.armR.quaternion.angleTo(first)).toBeLessThan(0.01);
    expect(controller.upperClip).toBe('idleArchive');
    controller.dispose();
    rig.dispose();
  });
});

describe('hand IK', () => {
  it('puts the glove one arm length from the shoulder, towards the target', () => {
    const glove = gloveAt(SHOULDER_L, { x: 1, y: 0.4, z: 0.2 }, origin());
    const d = Math.hypot(glove.x - SHOULDER_L[0], glove.y - SHOULDER_L[1], glove.z - SHOULDER_L[2]);
    expect(d).toBeCloseTo(ARM_LENGTH, 5);
    expect(glove.x).toBeGreaterThan(SHOULDER_L[0]);
  });

  it('aims the hanging arm at the target', () => {
    const q = aimArmAt(SHOULDER_R, { x: 0.6, y: 0.37, z: -0.29 }, new Quaternion());
    const tip = new Vector3(0, -1, 0).applyQuaternion(q);
    expect(tip.x).toBeGreaterThan(0.99);
  });

  it('brings the two hands together in front of the chest when carrying', () => {
    const l = gloveAt(SHOULDER_L, carryTarget(1, origin()), origin());
    const r = gloveAt(SHOULDER_R, carryTarget(-1, origin()), origin());
    expect(l.x).toBeGreaterThan(0.2);
    expect(l.z).toBeGreaterThan(0);
    expect(r.z).toBeLessThan(0);
    expect(Math.abs(l.z - r.z)).toBeLessThan(0.5);
    const anchor = carryAnchor(l, r, origin());
    expect(anchor.x).toBeGreaterThan(l.x);
    expect(anchor.z).toBeCloseTo(0, 5);
  });

  it('converts world offsets to torso space for any body rotation', () => {
    const ahead = worldToTorso(1, 0, 0.37, 0, origin());
    expect(ahead.x).toBeCloseTo(1);
    expect(ahead.y).toBeCloseTo(0);
    // Facing +y on the floor plan = body rotation -PI/2: an offset along +z is straight ahead.
    const turned = worldToTorso(0, 1, 0.37, -Math.PI / 2, origin());
    expect(turned.x).toBeCloseTo(1);
    expect(turned.z).toBeCloseTo(0);
  });
});

describe('look-at', () => {
  it('wraps angles and turns the short way', () => {
    expect(Math.abs(wrapAngle(3 * Math.PI))).toBeCloseTo(Math.PI, 5);
    expect(turnTowards(3, -3, 1, 100)).toBeGreaterThan(3);
    expect(turnTowards(0, 1, 0.1, 10)).toBeGreaterThan(0);
    expect(turnTowards(0, 1, 0.1, 10)).toBeLessThan(1);
  });

  it('leads the body turn with the head, within a limit', () => {
    const lead = headLook(0, Math.PI / 2, { x: 0, y: 0 }, null);
    expect(lead.yaw).not.toBe(0);
    expect(Math.abs(lead.yaw)).toBeLessThanOrEqual(HEAD_LEAD_MAX);
    expect(headLook(-0.5, 0.5, { x: 0, y: 0 }, null).yaw).toBeCloseTo(0, 5);
  });

  it('looks down at a nearby target and ignores far ones', () => {
    const look = headLook(0, 0, { x: 5, y: 5 }, { x: 5, y: 6 });
    expect(Math.abs(look.yaw)).toBeCloseTo(Math.PI / 2, 5);
    expect(look.pitch).toBeLessThan(0);
    expect(headLook(0, 0, { x: 0, y: 0 }, { x: 40, y: 0 }).pitch).toBe(0);
  });
});

describe('footstep gate', () => {
  const players = new Map([
    ['me', { x: 0, y: 0, local: true }],
    ['a', { x: 1, y: 0 }],
    ['b', { x: 2, y: 0 }],
    ['c', { x: 9, y: 0 }],
  ]);

  it('lets the local player and the two nearest remote players be heard', () => {
    expect(isNearestRemote('a', players)).toBe(true);
    expect(isNearestRemote('b', players)).toBe(true);
    expect(isNearestRemote('c', players)).toBe(false);
    const gate = createFootstepGate();
    expect(allowFootstep(gate, { id: 'c', local: false, now: 0, x: 9, y: 0 }, players)).toBe(false);
    expect(allowFootstep(gate, { id: 'me', local: true, now: 0, x: 0, y: 0 }, players)).toBe(true);
  });

  it('rate-limits one player', () => {
    const gate = createFootstepGate();
    const me = (now: number) => ({ id: 'me', local: true, now, x: 0, y: 0 });
    expect(allowFootstep(gate, me(0), players)).toBe(true);
    expect(allowFootstep(gate, me(STEP_MIN_INTERVAL_S / 2), players)).toBe(false);
    expect(allowFootstep(gate, me(STEP_MIN_INTERVAL_S + 0.01), players)).toBe(true);
  });

  it('caps all players together inside the window', () => {
    const gate = createFootstepGate();
    const crowd = new Map<string, { x: number; y: number; local?: boolean }>();
    let heard = 0;
    for (let i = 0; i < 20; i++) {
      crowd.set(`p${i}`, { x: 0, y: 0, local: true });
      if (allowFootstep(gate, { id: `p${i}`, local: true, now: i * 0.01, x: 0, y: 0 }, crowd)) {
        heard++;
      }
    }
    expect(heard).toBe(STEP_GLOBAL_MAX);
  });
});
