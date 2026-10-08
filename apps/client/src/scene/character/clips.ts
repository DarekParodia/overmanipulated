// Animation clips for the character rig, built in code from keyframes on bone rotations and the
// hip position (S3-05). Conventions (rig.ts): +x forward, +y up, left side = +z. A positive z
// rotation swings a hanging limb forward; a negative z rotation leans the torso/head forward;
// arm L rotates outwards with negative x, arm R with positive x.
import {
  AnimationClip,
  Euler,
  type KeyframeTrack,
  Quaternion,
  QuaternionKeyframeTrack,
  VectorKeyframeTrack,
} from 'three';
import { BONE_REST, type BoneName } from './rig.ts';

type Rot = readonly [number, number, number];

const euler = new Euler();
const quat = new Quaternion();

/** Rotation keyframes (Euler XYZ radians) for one bone. */
function rot(bone: BoneName, times: readonly number[], values: readonly Rot[]): KeyframeTrack {
  const flat: number[] = [];
  for (const [x, y, z] of values) {
    quat.setFromEuler(euler.set(x, y, z));
    flat.push(quat.x, quat.y, quat.z, quat.w);
  }
  return new QuaternionKeyframeTrack(`${bone}.quaternion`, [...times], flat);
}

/** Hip height keyframes as offsets from the rest position. */
function hipsY(times: readonly number[], offsets: readonly number[]): KeyframeTrack {
  const [x, y, z] = BONE_REST.hips;
  return new VectorKeyframeTrack(
    'hips.position',
    [...times],
    offsets.flatMap((dy) => [x, y + dy, z]),
  );
}

/** Same rotation at every key (keeps a bone still in a clip that animates others). */
function hold(bone: BoneName, duration: number, value: Rot): KeyframeTrack {
  return rot(bone, [0, duration], [value, value]);
}

/** Two-beat cycle helper: keys at 0, ¼, ½, ¾ and 1 of the duration. */
function quarters(duration: number): number[] {
  return [0, duration / 4, duration / 2, (duration * 3) / 4, duration];
}

/** Every bone gets a track in every clip, so blending never falls back to a stale pose. */
const ARM_OUT = 0.12;
const REST_POSE: Record<BoneName, Rot> = {
  hips: [0, 0, 0],
  torso: [0, 0, 0],
  head: [0, 0, 0],
  armL: [-ARM_OUT, 0, 0.08],
  armR: [ARM_OUT, 0, 0.08],
  legL: [0, 0, 0],
  legR: [0, 0, 0],
};

function clip(name: string, duration: number, tracks: KeyframeTrack[]): AnimationClip {
  const covered = new Set(tracks.map((t) => t.name));
  for (const bone of Object.keys(REST_POSE) as BoneName[]) {
    if (!covered.has(`${bone}.quaternion`)) {
      tracks.push(hold(bone, duration, REST_POSE[bone]));
    }
  }
  if (!covered.has('hips.position')) {
    tracks.push(hipsY([0, duration], [0, 0]));
  }
  return new AnimationClip(name, duration, tracks);
}

/** Length of one locomotion cycle (two steps); walk, run and carry-walk share it to stay in sync. */
export const STRIDE_S = 0.5;

function locomotion(
  name: string,
  legSwing: number,
  armSwing: number | null,
  lean: number,
  bounce: number,
  armOut: number,
): AnimationClip {
  const t = quarters(STRIDE_S);
  const tracks = [
    rot(
      'legL',
      t,
      [legSwing, 0, -legSwing, 0, legSwing].map((z) => [0, 0, z] as const),
    ),
    rot(
      'legR',
      t,
      [-legSwing, 0, legSwing, 0, -legSwing].map((z) => [0, 0, z] as const),
    ),
    rot(
      'torso',
      t,
      [0.08, 0, -0.08, 0, 0.08].map((y) => [0, y * (legSwing > 0.6 ? 1.4 : 1), lean] as const),
    ),
    rot('head', t, [
      [0, -0.05, -lean * 0.5],
      [0, 0, -lean * 0.5 - 0.04],
      [0, 0.05, -lean * 0.5],
      [0, 0, -lean * 0.5 - 0.04],
      [0, -0.05, -lean * 0.5],
    ]),
    hipsY(t, [0, bounce, 0, bounce, 0]),
  ];
  if (armSwing !== null) {
    tracks.push(
      rot(
        'armL',
        t,
        [-armSwing, 0, armSwing, 0, -armSwing].map((z) => [-armOut, 0, z + 0.1] as const),
      ),
      rot(
        'armR',
        t,
        [armSwing, 0, -armSwing, 0, armSwing].map((z) => [armOut, 0, z + 0.1] as const),
      ),
    );
  } else {
    // Arms held forward at chest height, bouncing a little with each step.
    tracks.push(
      rot(
        'armL',
        t,
        [1.5, 1.44, 1.5, 1.44, 1.5].map((z) => [0.14, 0, z] as const),
      ),
      rot(
        'armR',
        t,
        [1.5, 1.44, 1.5, 1.44, 1.5].map((z) => [-0.14, 0, z] as const),
      ),
    );
  }
  return clip(name, STRIDE_S, tracks);
}

function idle(): AnimationClip {
  const d = 2.4;
  const t = quarters(d);
  return clip('idle', d, [
    rot('torso', t, [
      [0, 0, 0],
      [0, 0, -0.03],
      [0, 0, 0],
      [0, 0, -0.03],
      [0, 0, 0],
    ]),
    rot('head', t, [
      [0, 0, 0],
      [0, 0.18, 0.02],
      [0, 0, 0],
      [0, -0.18, 0.02],
      [0, 0, 0],
    ]),
    rot('armL', t, [
      [-ARM_OUT, 0, 0.08],
      [-ARM_OUT - 0.04, 0, 0.12],
      [-ARM_OUT, 0, 0.08],
      [-ARM_OUT - 0.04, 0, 0.12],
      [-ARM_OUT, 0, 0.08],
    ]),
    rot('armR', t, [
      [ARM_OUT, 0, 0.08],
      [ARM_OUT + 0.04, 0, 0.12],
      [ARM_OUT, 0, 0.08],
      [ARM_OUT + 0.04, 0, 0.12],
      [ARM_OUT, 0, 0.08],
    ]),
    hipsY(t, [0, -0.012, 0, -0.012, 0]),
  ]);
}

function carryIdle(): AnimationClip {
  const d = 1.6;
  const t = [0, d / 2, d];
  return clip('carryIdle', d, [
    rot('armL', t, [
      [0.14, 0, 1.5],
      [0.14, 0, 1.45],
      [0.14, 0, 1.5],
    ]),
    rot('armR', t, [
      [-0.14, 0, 1.5],
      [-0.14, 0, 1.45],
      [-0.14, 0, 1.5],
    ]),
    rot('torso', t, [
      [0, 0, 0.05],
      [0, 0, 0.03],
      [0, 0, 0.05],
    ]),
    hipsY(t, [0, -0.012, 0]),
  ]);
}

/** Working at a station or the desk: hands on the table, typing. */
function work(): AnimationClip {
  const d = 0.5;
  const t = quarters(d);
  return clip('work', d, [
    rot('armL', t, [
      [0.1, 0, 1.0],
      [0.1, 0, 1.3],
      [0.1, 0, 1.0],
      [0.1, 0, 1.15],
      [0.1, 0, 1.0],
    ]),
    rot('armR', t, [
      [-0.1, 0, 1.15],
      [-0.1, 0, 1.0],
      [-0.1, 0, 1.3],
      [-0.1, 0, 1.0],
      [-0.1, 0, 1.15],
    ]),
    rot('torso', t, [
      [0, 0, -0.14],
      [0, 0.03, -0.16],
      [0, 0, -0.14],
      [0, -0.03, -0.16],
      [0, 0, -0.14],
    ]),
    rot('head', t, [
      [0, 0, -0.18],
      [0, 0, -0.24],
      [0, 0, -0.18],
      [0, 0, -0.24],
      [0, 0, -0.18],
    ]),
  ]);
}

/** Right arm up, then a hard slam down onto the folder. */
function stamp(): AnimationClip {
  const t = [0, 0.18, 0.3, 0.36, 0.55, 0.75];
  return clip('stamp', 0.75, [
    rot('armR', t, [
      [ARM_OUT, 0, 0.1],
      [-0.75, 0, 2.5],
      [-0.8, 0, 2.6],
      [-0.1, 0, 1.15],
      [-0.1, 0, 1.2],
      [ARM_OUT, 0, 0.1],
    ]),
    rot('armL', t, [
      [-ARM_OUT, 0, 0.08],
      [-0.3, 0, 0.3],
      [-0.3, 0, 0.3],
      [0.1, 0, 0.9],
      [0.1, 0, 0.9],
      [-ARM_OUT, 0, 0.08],
    ]),
    rot('torso', t, [
      [0, 0, 0],
      [0, -0.1, 0.12],
      [0, -0.1, 0.14],
      [0, 0.05, -0.28],
      [0, 0, -0.22],
      [0, 0, 0],
    ]),
    rot('head', t, [
      [0, 0, 0],
      [0, 0, 0.1],
      [0, 0, 0.1],
      [0, 0, -0.2],
      [0, 0, -0.15],
      [0, 0, 0],
    ]),
    hipsY(t, [0, 0.02, 0.03, -0.05, -0.03, 0]),
  ]);
}

/** Jump with both arms up in a V, twice. */
function cheer(): AnimationClip {
  const t = [0, 0.12, 0.28, 0.44, 0.6, 0.76, 0.95, 1.2];
  const up = 2.6;
  return clip('cheer', 1.2, [
    rot('armL', t, [
      [-ARM_OUT, 0, 0.08],
      [-up, 0, 0.3],
      [-up - 0.3, 0, 0.2],
      [-up, 0, 0.3],
      [-up - 0.3, 0, 0.2],
      [-up, 0, 0.3],
      [-up + 0.6, 0, 0.2],
      [-ARM_OUT, 0, 0.08],
    ]),
    rot('armR', t, [
      [ARM_OUT, 0, 0.08],
      [up, 0, 0.3],
      [up + 0.3, 0, 0.2],
      [up, 0, 0.3],
      [up + 0.3, 0, 0.2],
      [up, 0, 0.3],
      [up - 0.6, 0, 0.2],
      [ARM_OUT, 0, 0.08],
    ]),
    rot('legL', t, [
      [0, 0, 0],
      [0, 0, 0],
      [0, 0, 0.35],
      [0, 0, 0],
      [0, 0, 0.3],
      [0, 0, 0],
      [0, 0, 0],
      [0, 0, 0],
    ]),
    rot('legR', t, [
      [0, 0, 0],
      [0, 0, 0],
      [0, 0, -0.2],
      [0, 0, 0],
      [0, 0, -0.15],
      [0, 0, 0],
      [0, 0, 0],
      [0, 0, 0],
    ]),
    rot('head', t, [
      [0, 0, 0],
      [0, 0, 0.15],
      [0, 0, 0.25],
      [0, 0, 0.15],
      [0, 0, 0.25],
      [0, 0, 0.15],
      [0, 0, 0.05],
      [0, 0, 0],
    ]),
    hipsY(t, [0, -0.04, 0.24, 0, 0.18, 0, 0, 0]),
  ]);
}

/** Hand to the face, head down. */
function facepalm(): AnimationClip {
  const t = [0, 0.22, 0.32, 1.05, 1.4];
  const palm: Rot = [0.55, 0, 2.45];
  return clip('facepalm', 1.4, [
    rot('armR', t, [[ARM_OUT, 0, 0.08], palm, palm, palm, [ARM_OUT, 0, 0.08]]),
    rot('head', t, [
      [0, 0, 0],
      [0.1, 0, -0.32],
      [0.12, 0, -0.38],
      [-0.08, 0, -0.38],
      [0, 0, 0],
    ]),
    rot('torso', t, [
      [0, 0, 0],
      [0, 0, -0.14],
      [0, 0, -0.16],
      [0, 0, -0.16],
      [0, 0, 0],
    ]),
    hipsY(t, [0, -0.03, -0.035, -0.035, 0]),
  ]);
}

/** Palms out, shoulders up, head tilted. */
function shrug(): AnimationClip {
  const t = [0, 0.18, 0.7, 1.0];
  return clip('shrug', 1.0, [
    rot('armL', t, [
      [-ARM_OUT, 0, 0.08],
      [-1.15, 0, 0.55],
      [-1.15, 0, 0.55],
      [-ARM_OUT, 0, 0.08],
    ]),
    rot('armR', t, [
      [ARM_OUT, 0, 0.08],
      [1.15, 0, 0.55],
      [1.15, 0, 0.55],
      [ARM_OUT, 0, 0.08],
    ]),
    rot('head', t, [
      [0, 0, 0],
      [0.22, 0, 0.05],
      [0.22, 0, 0.05],
      [0, 0, 0],
    ]),
    rot('torso', t, [
      [0, 0, 0],
      [0, 0, 0.06],
      [0, 0, 0.06],
      [0, 0, 0],
    ]),
    hipsY(t, [0, 0.03, 0.03, 0]),
  ]);
}

/** Lost level: shoulders drop, head hangs. */
function slump(): AnimationClip {
  const t = [0, 0.35, 1.4, 1.8];
  const low: Rot = [0, 0, -0.42];
  return clip('slump', 1.8, [
    rot('head', t, [
      [0, 0, 0],
      [0, 0, -0.55],
      [0, 0, -0.55],
      [0, 0, 0],
    ]),
    rot('torso', t, [[0, 0, 0], low, low, [0, 0, 0]]),
    rot('armL', t, [
      [-ARM_OUT, 0, 0.08],
      [0.05, 0, -0.1],
      [0.05, 0, -0.1],
      [-ARM_OUT, 0, 0.08],
    ]),
    rot('armR', t, [
      [ARM_OUT, 0, 0.08],
      [-0.05, 0, -0.1],
      [-0.05, 0, -0.1],
      [ARM_OUT, 0, 0.08],
    ]),
    hipsY(t, [0, -0.06, -0.06, 0]),
  ]);
}

/** Looping base layers: chosen by player state and blended by weight. */
export const BASE_CLIPS = ['idle', 'walk', 'run', 'carryIdle', 'carryWalk', 'work'] as const;
export type BaseClip = (typeof BASE_CLIPS)[number];

/** One-shot gestures played over the base layers. */
export const GESTURE_CLIPS = ['stamp', 'cheer', 'facepalm', 'shrug', 'slump'] as const;
export type GestureClip = (typeof GESTURE_CLIPS)[number];

export type CharacterClips = Record<BaseClip | GestureClip, AnimationClip>;

let cached: CharacterClips | null = null;

/** All character clips (built once; clips are immutable and shared by every character). */
export function characterClips(): CharacterClips {
  cached ??= {
    idle: idle(),
    walk: locomotion('walk', 0.5, 0.45, -0.06, 0.035, ARM_OUT),
    run: locomotion('run', 0.85, 0.85, -0.18, 0.07, 0.25),
    carryIdle: carryIdle(),
    carryWalk: locomotion('carryWalk', 0.45, null, 0.04, 0.03, 0),
    work: work(),
    stamp: stamp(),
    cheer: cheer(),
    facepalm: facepalm(),
    shrug: shrug(),
    slump: slump(),
  };
  return cached;
}
