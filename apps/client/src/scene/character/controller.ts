// Drives a character's AnimationMixer from player state (S3-05, S5-02). Layers, bottom to top:
//   1. base loops (idle, walk, run, carry, work) blended by weights that follow the state; the
//      locomotion playback rate is matched to the ground speed so feet do not slide;
//   2. full-body one-shot gestures (stamp, cheer, role celebrations, facepalm, shrug, slump);
//   3. an upper-body layer (role fidgets after standing still, ping emotes) sampled by hand and
//      laid over the arms, head and torso so legs keep walking;
//   4. look-at (the head leads the body's turns and follows the interaction target);
//   5. hand IK (hands meet around a carried folder, reach for a fixture when putting down).
// Weights are set directly every update instead of using crossFadeTo, so state changes mid-fade
// never leave a layer stuck. The pure rules are exported for tests.
import type { PingKind, Role } from '@redakcja/shared';
import { PLAYER_SPEED_TILES_PER_S } from '@redakcja/shared';
import {
  type AnimationAction,
  type AnimationClip,
  AnimationMixer,
  type Bone,
  type KeyframeTrack,
  LoopOnce,
  LoopRepeat,
  type Object3D,
  Quaternion,
  Vector3,
} from 'three';
import type { QualityPreset } from '../../store/settings.ts';
import {
  BASE_CLIPS,
  type BaseClip,
  characterClips,
  GESTURE_CLIPS,
  type GestureClip,
  LEG_LENGTH,
  LEG_SWING,
  STRIDE_S,
} from './clips.ts';
import { aimArmAt, carryTarget, SHOULDER_L, SHOULDER_R, type Vec3 } from './hands.ts';
import type { BoneName } from './rig.ts';
import {
  CELEBRATION_CLIPS,
  type CelebrationClip,
  roleClips,
  UPPER_CLIPS,
  type UpperClip,
} from './role-clips.ts';

export type CharacterState = {
  moving: boolean;
  /** Rendered speed as a fraction of full walking speed (0..1). */
  speedFraction: number;
  carrying: boolean;
  /** Operating a station or the verdict desk. */
  working: boolean;
  /** Head turn (radians, about the vertical axis) relative to the body; + turns to the left. */
  lookYaw?: number;
  /** Head pitch: negative looks down. */
  lookPitch?: number;
  /** False with reduced motion: no role fidgets. */
  allowFidget?: boolean;
};

/** Below this fraction of full speed the character walks; above RUN_FULL it runs. */
export const RUN_FROM = 0.55;
export const RUN_FULL = 0.9;

export type BaseWeights = Record<BaseClip, number>;

export function zeroWeights(): BaseWeights {
  return { idle: 0, walk: 0, run: 0, carryIdle: 0, carryWalk: 0, work: 0 };
}

/** Target weight of every base layer for a state (they sum to 1). */
export function targetBaseWeights(
  state: CharacterState,
  out: BaseWeights = zeroWeights(),
): BaseWeights {
  for (const key of BASE_CLIPS) {
    out[key] = 0;
  }
  if (state.working && !state.moving) {
    out.work = 1;
  } else if (state.carrying) {
    out[state.moving ? 'carryWalk' : 'carryIdle'] = 1;
  } else if (state.moving) {
    const run = Math.min(1, Math.max(0, (state.speedFraction - RUN_FROM) / (RUN_FULL - RUN_FROM)));
    out.run = run;
    out.walk = 1 - run;
  } else {
    out.idle = 1;
  }
  return out;
}

// --- Stride matching ---------------------------------------------------------------------------

type Locomotion = 'walk' | 'run' | 'carryWalk';
const LOCOMOTION: readonly Locomotion[] = ['walk', 'run', 'carryWalk'];

/** Ground covered by one foot while it is planted (half a cycle), in tiles. */
export function strideDistance(kind: Locomotion): number {
  return 2 * LEG_LENGTH * Math.sin(LEG_SWING[kind]);
}

/** Cadence limits: slower looks like slow motion, faster like a blur. */
export const RATE_MIN = 0.6;
export const RATE_MAX = 1.8;

/**
 * Playback rate of the locomotion cycle that makes the planted foot move backwards as fast as the
 * character moves forwards, mixed over the weights of the walk, run and carry-walk layers.
 */
export function locomotionRate(speedFraction: number, weights: BaseWeights): number {
  const speed = Math.min(1, Math.max(0, speedFraction)) * PLAYER_SPEED_TILES_PER_S;
  let total = 0;
  let rate = 0;
  for (const kind of LOCOMOTION) {
    const w = weights[kind];
    total += w;
    rate += w * ((speed * (STRIDE_S / 2)) / strideDistance(kind));
  }
  const ideal = total > 0 ? rate / total : 1;
  return Math.min(RATE_MAX, Math.max(RATE_MIN, ideal));
}

/** Playback rate for walking or running at a fraction of full speed (the weights follow state). */
export function strideRate(speedFraction: number): number {
  return locomotionRate(
    speedFraction,
    targetBaseWeights({ moving: true, speedFraction, carrying: false, working: false }),
  );
}

/** Foot speed over ground speed for the given rate (1 = the feet do not slide). */
export function footSlideRatio(speedFraction: number, weights: BaseWeights): number {
  const speed = Math.min(1, Math.max(0, speedFraction)) * PLAYER_SPEED_TILES_PER_S;
  if (speed <= 0) {
    return 1;
  }
  const rate = locomotionRate(speedFraction, weights);
  let total = 0;
  let foot = 0;
  for (const kind of LOCOMOTION) {
    total += weights[kind];
    foot += weights[kind] * ((strideDistance(kind) * rate) / (STRIDE_S / 2));
  }
  return total > 0 ? foot / total / speed : 1;
}

// --- Gestures, fidgets, emotes -----------------------------------------------------------------

/** Gesture weight over its playback: quick fade in, gentle fade out before the end. */
export const GESTURE_FADE_IN_S = 0.1;
export const GESTURE_FADE_OUT_S = 0.25;
export function gestureWeight(time: number, duration: number): number {
  if (time <= 0 || time >= duration) {
    return 0;
  }
  return Math.min(1, time / GESTURE_FADE_IN_S, (duration - time) / GESTURE_FADE_OUT_S);
}

/** Full-body gestures played through the mixer. */
export type BodyGesture = GestureClip | CelebrationClip;

export function celebrationForRole(role: Role | null): BodyGesture {
  switch (role) {
    case 'photoEditor':
      return 'cheerPhoto';
    case 'archivist':
      return 'cheerArchive';
    case 'reporter':
      return 'cheerReporter';
    case 'managingEditor':
      return 'cheerManager';
    default:
      return 'cheer';
  }
}

export function fidgetForRole(role: Role | null): UpperClip | null {
  switch (role) {
    case 'photoEditor':
      return 'idlePhoto';
    case 'archivist':
      return 'idleArchive';
    case 'reporter':
      return 'idleReporter';
    case 'managingEditor':
      return 'idleManager';
    default:
      return null;
  }
}

export function emoteForPing(ping: PingKind): UpperClip {
  switch (ping) {
    case 'needArchive':
      return 'emoteArchive';
    case 'fake':
      return 'emoteFake';
    case 'mine':
      return 'emoteMine';
  }
}

/**
 * Animation triggers from the cue catalogue mapped to the full-body gesture they play. A `cheer`
 * that is about nobody in particular is the team-wide level win: it plays the role's celebration.
 */
export function gestureForTrigger(
  trigger: string,
  context: { team?: boolean; role?: Role | null } = {},
): BodyGesture | null {
  switch (trigger) {
    case 'stampSlam':
      return 'stamp';
    case 'cheer':
      return context.team ? celebrationForRole(context.role ?? null) : 'cheer';
    case 'facepalm':
    case 'shrug':
    case 'slump':
      return trigger;
    default:
      return null;
  }
}

/** Role fidgets: first after this long standing still, then every MIN..MIN+SPAN seconds. */
export const FIDGET_FIRST_S = 4;
export const FIDGET_GAP_MIN_S = 7;
export const FIDGET_GAP_SPAN_S = 6;

export type FidgetTimer = { still: number; due: number; rng: () => number };

export function createFidgetTimer(rng: () => number): FidgetTimer {
  return { still: 0, due: FIDGET_FIRST_S, rng };
}

/** Advances the timer; true when a fidget is due. Any activity resets the wait. */
export function stepFidgetTimer(timer: FidgetTimer, canFidget: boolean, dt: number): boolean {
  if (!canFidget) {
    timer.still = 0;
    timer.due = FIDGET_FIRST_S;
    return false;
  }
  timer.still += dt;
  if (timer.still < timer.due) {
    return false;
  }
  timer.still = 0;
  timer.due = FIDGET_GAP_MIN_S + timer.rng() * FIDGET_GAP_SPAN_S;
  return true;
}

/** Small seeded RNG (mulberry32) so fidgets of different players drift apart. */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Stable hash of a string, for seeding. */
export function hashString(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) {
    hash = Math.imul(hash ^ value.charCodeAt(i), 16777619);
  }
  return hash >>> 0;
}

// --- Animation LOD -----------------------------------------------------------------------------

/**
 * Animation LOD: seconds between mixer updates (0 = every frame). Off-screen characters barely
 * update, far ones and everyone on the `low` preset update at a reduced rate.
 */
export const LOD_FAR_DISTANCE = 22;
export function mixerInterval(preset: QualityPreset, onScreen: boolean, distance: number): number {
  if (!onScreen) {
    return 1 / 6;
  }
  if (distance > LOD_FAR_DISTANCE) {
    return 1 / 20;
  }
  return preset === 'low' ? 1 / 30 : 0;
}

/** Rate (1/s) at which base weights follow their targets (~0.2 s cross-fade). */
const BLEND_RATE = 12;
/** Locomotion rate follows its target a little slower, so the cadence never jumps. */
const RATE_SMOOTHING = 14;
/** A cancelled fidget fades out within this long. */
const FIDGET_CANCEL_S = 0.18;
/** Duration of a hand reach (picking up / putting down). */
export const REACH_S = 0.55;
/** Head turn limit relative to the body. */
export const LOOK_YAW_MAX = 1.0;

// Upper-layer track sampling: interpolants only hold the clip data and a result buffer that is
// consumed right away, so one set serves every character.
type UpperTrack = { bone: BoneName; sample: (time: number) => ArrayLike<number> };
const upperTracks = new WeakMap<AnimationClip, UpperTrack[]>();
function tracksOf(clip: AnimationClip): UpperTrack[] {
  let tracks = upperTracks.get(clip);
  if (!tracks) {
    tracks = clip.tracks.map((track: KeyframeTrack) => {
      const interpolant = (
        track as unknown as { createInterpolant(): { evaluate(time: number): ArrayLike<number> } }
      ).createInterpolant();
      return {
        bone: track.name.split('.')[0] as BoneName,
        sample: (time: number) => interpolant.evaluate(time),
      };
    });
    upperTracks.set(clip, tracks);
  }
  return tracks;
}

export type ControllerOptions = {
  role?: Role | null;
  /** Seeds the fidget timing (the player id hash). */
  seed?: number;
};

export type CharacterController = {
  /** Starts a full-body gesture from the beginning (a repeated trigger restarts it). */
  play(gesture: BodyGesture): void;
  /** Starts an upper-body clip (fidget or emote) from the beginning. */
  playUpper(clip: UpperClip): void;
  /** Reaches both hands for a point (torso space) for REACH_S seconds. */
  reachFor(target: Vec3): void;
  /**
   * Advances the blend by `dt` and the mixer by `mixerDt` (the accumulated time since the last
   * mixer update, or 0 to skip evaluating the pose this frame).
   */
  update(state: CharacterState, dt: number, mixerDt: number): void;
  /** Foot contacts since the last call (each is one footstep). */
  consumeSteps(): number;
  /** Debug: shows a gesture or upper clip frozen at `time` (clock stops until `unfreeze`). */
  seek(clip: BodyGesture | UpperClip, time: number): void;
  unfreeze(): void;
  readonly gesture: BodyGesture | null;
  readonly upperClip: UpperClip | null;
  /** The playback rate currently applied to the locomotion cycle. */
  readonly rate: number;
  dispose(): void;
};

const AXIS_Y = new Vector3(0, 1, 0);
const AXIS_Z = new Vector3(0, 0, 1);
const ALL_GESTURES: readonly BodyGesture[] = [...GESTURE_CLIPS, ...CELEBRATION_CLIPS];

export function createCharacterController(
  root: Object3D,
  options: ControllerOptions = {},
): CharacterController {
  const role = options.role ?? null;
  const mixer = new AnimationMixer(root);
  const baseClips = characterClips();
  const extra = roleClips();
  const base = {} as Record<BaseClip, AnimationAction>;
  for (const name of BASE_CLIPS) {
    const action = mixer.clipAction(baseClips[name]);
    action.setLoop(LoopRepeat, Number.POSITIVE_INFINITY);
    action.setEffectiveWeight(name === 'idle' ? 1 : 0);
    action.play();
    base[name] = action;
  }
  const gestures = {} as Record<BodyGesture, AnimationAction>;
  for (const name of ALL_GESTURES) {
    const clip =
      name in baseClips ? baseClips[name as GestureClip] : extra[name as CelebrationClip];
    const action = mixer.clipAction(clip);
    action.setLoop(LoopOnce, 1);
    action.clampWhenFinished = true;
    action.setEffectiveWeight(0);
    gestures[name] = action;
  }

  const bone = (name: BoneName) => root.getObjectByName(name) as Bone | undefined;
  const bones = {
    torso: bone('torso'),
    head: bone('head'),
    armL: bone('armL'),
    armR: bone('armR'),
  } as Record<BoneName, Bone | undefined>;

  const weights = zeroWeights();
  weights.idle = 1;
  const target = zeroWeights();
  let gesture: BodyGesture | null = null;
  let upperName: UpperClip | null = null;
  let upperTime = 0;
  let upperIsFidget = false;
  let upperCancel = 1;
  let reachT = Number.POSITIVE_INFINITY;
  const reachTarget: Vec3 = { x: 0, y: 0, z: 0 };
  const timer = createFidgetTimer(seededRandom(options.seed ?? 1));
  let frozen = false;
  let rate = 1;
  let lastHalf = -1;
  let steps = 0;

  const q = new Quaternion();
  const aimL = new Quaternion();
  const aimR = new Quaternion();
  const tL: Vec3 = { x: 0, y: 0, z: 0 };
  const tR: Vec3 = { x: 0, y: 0, z: 0 };
  const reachL: Vec3 = { x: 0, y: 0, z: 0 };
  const reachR: Vec3 = { x: 0, y: 0, z: 0 };
  const yawQ = new Quaternion();

  function startUpper(name: UpperClip, fidget: boolean): void {
    upperName = name;
    upperTime = 0;
    upperIsFidget = fidget;
    upperCancel = 1;
  }

  function upperWeight(): number {
    if (!upperName) {
      return 0;
    }
    const duration = extra[upperName].duration;
    return gestureWeight(upperTime, duration) * (upperIsFidget ? upperCancel : 1);
  }

  /** Lays the upper-body clip over the mixer's pose. */
  function applyUpper(w: number): void {
    if (!upperName || w <= 0) {
      return;
    }
    const clip = extra[upperName];
    for (const track of tracksOf(clip)) {
      const target = bones[track.bone];
      if (target) {
        q.fromArray(track.sample(Math.min(upperTime, clip.duration)));
        target.quaternion.slerp(q, w);
      }
    }
  }

  function applyLook(state: CharacterState, w: number): void {
    const head = bones.head;
    if (!head || w <= 0) {
      return;
    }
    const yaw = Math.max(-LOOK_YAW_MAX, Math.min(LOOK_YAW_MAX, state.lookYaw ?? 0)) * w;
    const pitch = (state.lookPitch ?? 0) * w;
    if (Math.abs(yaw) > 1e-4) {
      head.quaternion.premultiply(yawQ.setFromAxisAngle(AXIS_Y, yaw));
    }
    if (Math.abs(pitch) > 1e-4) {
      head.quaternion.premultiply(yawQ.setFromAxisAngle(AXIS_Z, pitch));
    }
  }

  function applyHands(w: number, carryW: number, reachW: number): void {
    const armL = bones.armL;
    const armR = bones.armR;
    if (!armL || !armR || w <= 0) {
      return;
    }
    carryTarget(1, tL);
    carryTarget(-1, tR);
    if (reachW > 0) {
      // Both hands towards the same point, a hand's width apart.
      reachL.x = reachR.x = reachTarget.x;
      reachL.y = reachR.y = reachTarget.y;
      reachL.z = reachTarget.z + 0.08;
      reachR.z = reachTarget.z - 0.08;
      const f = carryW > 0 ? reachW : 1;
      tL.x += (reachL.x - tL.x) * f;
      tL.y += (reachL.y - tL.y) * f;
      tL.z += (reachL.z - tL.z) * f;
      tR.x += (reachR.x - tR.x) * f;
      tR.y += (reachR.y - tR.y) * f;
      tR.z += (reachR.z - tR.z) * f;
    }
    armL.quaternion.slerp(aimArmAt(SHOULDER_L, tL, aimL), w);
    armR.quaternion.slerp(aimArmAt(SHOULDER_R, tR, aimR), w);
  }

  return {
    get gesture() {
      return gesture;
    },
    get upperClip() {
      return upperName;
    },
    get rate() {
      return rate;
    },
    play(name) {
      if (gesture && gesture !== name) {
        gestures[gesture].stop();
      }
      gesture = name;
      const action = gestures[name];
      action.reset();
      action.setEffectiveWeight(0);
      action.play();
    },
    playUpper(name) {
      startUpper(name, false);
    },
    reachFor(point) {
      reachTarget.x = point.x;
      reachTarget.y = point.y;
      reachTarget.z = point.z;
      reachT = 0;
    },
    consumeSteps() {
      const count = steps;
      steps = 0;
      return count;
    },
    seek(name, time) {
      frozen = true;
      if ((UPPER_CLIPS as readonly string[]).includes(name)) {
        startUpper(name as UpperClip, false);
        upperTime = time;
      } else {
        this.play(name as BodyGesture);
        gestures[name as BodyGesture].time = time;
      }
    },
    unfreeze() {
      frozen = false;
    },
    update(state, dt, mixerDt) {
      if (frozen) {
        dt = 0;
        mixerDt = 0;
      }
      targetBaseWeights(state, target);
      const k = 1 - Math.exp(-BLEND_RATE * dt);
      let sum = 0;
      for (const name of BASE_CLIPS) {
        weights[name] += (target[name] - weights[name]) * k;
        sum += weights[name];
      }

      let gestureW = 0;
      if (gesture) {
        const action = gestures[gesture];
        const duration = action.getClip().duration;
        if (action.time >= duration || action.paused) {
          action.stop();
          gesture = null;
        } else {
          // Time after this update, so the weight matches the pose being evaluated.
          gestureW = gestureWeight(Math.min(action.time + mixerDt, duration), duration);
          action.setEffectiveWeight(gestureW);
        }
      }

      // Fidgets: standing still, empty-handed, with nothing else going on.
      const canFidget =
        role !== null &&
        state.allowFidget !== false &&
        !state.moving &&
        !state.carrying &&
        !state.working &&
        gesture === null &&
        (upperName === null || upperIsFidget);
      if (upperName && upperIsFidget && !canFidget) {
        upperCancel = Math.max(0, upperCancel - dt / FIDGET_CANCEL_S);
      }
      const idleFor = upperName === null && gesture === null;
      if (stepFidgetTimer(timer, canFidget && idleFor, dt)) {
        const fidget = fidgetForRole(role);
        if (fidget) {
          startUpper(fidget, true);
        }
      }
      if (upperName) {
        upperTime += dt;
        if (upperTime >= extra[upperName].duration || (upperIsFidget && upperCancel <= 0)) {
          upperName = null;
        }
      }
      const upperW = upperWeight();

      // Locomotion cadence follows the ground speed (smoothed), so feet do not slide.
      const locomotion = weights.walk + weights.run + weights.carryWalk;
      const idealRate = locomotionRate(state.speedFraction, weights);
      rate += (idealRate - rate) * (1 - Math.exp(-RATE_SMOOTHING * dt));
      const scale = sum > 0 ? (1 - gestureW) / sum : 0;
      for (const name of BASE_CLIPS) {
        base[name].setEffectiveWeight(weights[name] * scale);
        if (name === 'walk' || name === 'run' || name === 'carryWalk') {
          base[name].timeScale = rate;
        }
      }

      if (mixerDt > 0 || frozen) {
        mixer.update(mixerDt);
        // Foot contacts: left heel at 0 and right heel at half the cycle.
        const half = STRIDE_S / 2;
        const index = Math.floor(base.walk.time / half) % 2;
        if (locomotion > 0.5 && gesture === null && lastHalf >= 0 && index !== lastHalf) {
          steps += 1;
        }
        lastHalf = index;

        applyUpper(upperW);
        const free = (1 - gestureW) * (1 - upperW);
        applyLook(state, free);
        const carryW = weights.carryIdle + weights.carryWalk;
        let reachW = 0;
        if (reachT < REACH_S) {
          reachW = gestureWeight(reachT, REACH_S);
        }
        if (mixerDt > 0 || frozen) {
          reachT += mixerDt;
        }
        applyHands(Math.max(carryW, reachW) * free, carryW, reachW);
      }
    },
    dispose() {
      mixer.stopAllAction();
      mixer.uncacheRoot(root);
    },
  };
}
