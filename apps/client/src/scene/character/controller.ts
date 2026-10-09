// Drives a character's AnimationMixer from player state (S3-05): base layers (idle, walk, run,
// carry, work) are blended by weights that follow the state, one-shot gestures (stamp, cheer,
// facepalm, shrug, slump) fade in over them and back out. Weights are set directly every update
// instead of using crossFadeTo, so state changes mid-fade never leave a layer stuck. The pure
// rules (which layer, how fast to update the mixer) are exported for tests.
import { type AnimationAction, AnimationMixer, LoopOnce, LoopRepeat, type Object3D } from 'three';
import type { QualityPreset } from '../../store/settings.ts';
import {
  BASE_CLIPS,
  type BaseClip,
  characterClips,
  GESTURE_CLIPS,
  type GestureClip,
} from './clips.ts';

export type CharacterState = {
  moving: boolean;
  /** Rendered speed as a fraction of full walking speed (0..1). */
  speedFraction: number;
  carrying: boolean;
  /** Operating a station or the verdict desk. */
  working: boolean;
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

/** Playback rate of the locomotion cycle: slower steps when moving slowly (analog stick). */
export function strideRate(speedFraction: number): number {
  return 0.55 + 0.75 * Math.min(1, Math.max(0, speedFraction));
}

/** Gesture weight over its playback: quick fade in, gentle fade out before the end. */
export const GESTURE_FADE_IN_S = 0.1;
export const GESTURE_FADE_OUT_S = 0.25;
export function gestureWeight(time: number, duration: number): number {
  if (time <= 0 || time >= duration) {
    return 0;
  }
  return Math.min(1, time / GESTURE_FADE_IN_S, (duration - time) / GESTURE_FADE_OUT_S);
}

/** Animation triggers from the cue catalogue mapped to the gesture they play. */
export function gestureForTrigger(trigger: string): GestureClip | null {
  switch (trigger) {
    case 'stampSlam':
      return 'stamp';
    case 'cheer':
    case 'facepalm':
    case 'shrug':
    case 'slump':
      return trigger;
    default:
      return null;
  }
}

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

export type CharacterController = {
  /** Starts a gesture from the beginning (a repeated trigger restarts it). */
  play(gesture: GestureClip): void;
  /**
   * Advances the blend by `dt` and the mixer by `mixerDt` (the accumulated time since the last
   * mixer update, or 0 to skip evaluating the pose this frame).
   */
  update(state: CharacterState, dt: number, mixerDt: number): void;
  readonly gesture: GestureClip | null;
  dispose(): void;
};

export function createCharacterController(root: Object3D): CharacterController {
  const mixer = new AnimationMixer(root);
  const clips = characterClips();
  const base = {} as Record<BaseClip, AnimationAction>;
  for (const name of BASE_CLIPS) {
    const action = mixer.clipAction(clips[name]);
    action.setLoop(LoopRepeat, Number.POSITIVE_INFINITY);
    action.setEffectiveWeight(name === 'idle' ? 1 : 0);
    action.play();
    base[name] = action;
  }
  const gestures = {} as Record<GestureClip, AnimationAction>;
  for (const name of GESTURE_CLIPS) {
    const action = mixer.clipAction(clips[name]);
    action.setLoop(LoopOnce, 1);
    action.clampWhenFinished = true;
    action.setEffectiveWeight(0);
    gestures[name] = action;
  }

  const weights = zeroWeights();
  weights.idle = 1;
  const target = zeroWeights();
  let gesture: GestureClip | null = null;

  return {
    get gesture() {
      return gesture;
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
    update(state, dt, mixerDt) {
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

      const rate = strideRate(state.speedFraction);
      const scale = sum > 0 ? (1 - gestureW) / sum : 0;
      for (const name of BASE_CLIPS) {
        base[name].setEffectiveWeight(weights[name] * scale);
        if (name === 'walk' || name === 'run' || name === 'carryWalk') {
          base[name].timeScale = rate;
        }
      }
      if (mixerDt > 0) {
        mixer.update(mixerDt);
      }
    },
    dispose() {
      mixer.stopAllAction();
      mixer.uncacheRoot(root);
    },
  };
}
