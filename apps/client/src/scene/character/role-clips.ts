// Role-specific clips (S5-02): fidgets played after a few seconds of standing still, ping emotes
// and level-win celebrations. Fidgets and emotes are "upper-body" clips (torso, head, arms): the
// controller lays them over whatever the legs are doing, so an emote never stops a walking
// player. Celebrations are full-body gestures like `cheer`. Arm poses are written as pointing
// directions in torso space (+x forward, +y up, +z left) through `armL`/`armR`, which is far
// easier to author than Euler angles for a one-bone arm; `armR` mirrors the left-arm numbers.
import { AnimationClip, Euler, type KeyframeTrack, Quaternion } from 'three';
import { clip, hipsY, REST_POSE, type Rot, rot } from './clips.ts';
import { aimQuaternion } from './hands.ts';
import type { BoneName } from './rig.ts';

const quat = new Quaternion();
const euler = new Euler();

function aim(x: number, y: number, z: number): Rot {
  euler.setFromQuaternion(aimQuaternion(x, y, z, quat), 'XYZ');
  return [euler.x, euler.y, euler.z];
}

/** Left arm pointing at (x, y, z) in torso space; negative z is across the chest. */
const armL = aim;
/** Right arm, written with the left-arm numbers (mirrored across the body). */
const armR = (x: number, y: number, z: number): Rot => aim(x, y, -z);

const head = (yaw: number, pitch = 0, roll = 0): Rot => [roll, yaw, pitch];

type Pose = Partial<Record<BoneName, Rot>>;
/** A keyframe: time, bone rotations, optional hip height offset. */
type Key = readonly [time: number, pose: Pose, hipDy?: number];

const UPPER_BONES = ['torso', 'head', 'armL', 'armR'] as const satisfies readonly BoneName[];

function tracksFor(bones: readonly BoneName[], duration: number, keys: readonly Key[]) {
  const tracks: KeyframeTrack[] = [];
  for (const bone of bones) {
    const times: number[] = [];
    const values: Rot[] = [];
    for (const [time, pose] of keys) {
      const value = pose[bone];
      if (value) {
        times.push(time);
        values.push(value);
      }
    }
    if (times.length === 0) {
      continue;
    }
    // Start and end at the rest pose so a fade never snaps.
    if (times[0] !== 0) {
      times.unshift(0);
      values.unshift(REST_POSE[bone]);
    }
    if (times[times.length - 1] !== duration) {
      times.push(duration);
      values.push(REST_POSE[bone]);
    }
    tracks.push(rot(bone, times, values));
  }
  return tracks;
}

/** Upper-body clip: only torso, head and arms get tracks. */
function upper(name: string, duration: number, keys: readonly Key[]): AnimationClip {
  // Not `clip()`: it would fill every other bone and the hips with rest tracks.
  return new AnimationClip(name, duration, tracksFor(UPPER_BONES, duration, keys));
}

/** Full-body gesture: unmentioned bones rest, hip heights from the keys' third entry. */
function full(name: string, duration: number, keys: readonly Key[]): AnimationClip {
  const bones: BoneName[] = ['torso', 'head', 'armL', 'armR', 'legL', 'legR'];
  const tracks = tracksFor(bones, duration, keys);
  const times = keys.filter((k) => k[2] !== undefined).map((k) => k[0]);
  if (times.length > 0) {
    const offsets = keys.filter((k) => k[2] !== undefined).map((k) => k[2] ?? 0);
    if (times[0] !== 0) {
      times.unshift(0);
      offsets.unshift(0);
    }
    if (times[times.length - 1] !== duration) {
      times.push(duration);
      offsets.push(0);
    }
    tracks.push(hipsY(times, offsets));
  }
  return clip(name, duration, tracks);
}

// --- Fidgets: played after a few seconds of standing still -----------------------------------

/** Photo editor lifts the camera and peeks through the viewfinder. */
function idlePhoto(): AnimationClip {
  const hold = { armL: armL(0.37, -0.24, -0.27), armR: armR(0.37, -0.24, -0.27) };
  const raised = { armL: armL(0.42, 0.02, -0.3), armR: armR(0.42, 0.02, -0.3) };
  return upper('idlePhoto', 3.4, [
    [0.5, { ...hold, head: head(0, -0.1), torso: [0, 0, -0.04] }],
    [0.95, { ...raised, head: head(0, -0.4), torso: [0, 0, -0.12] }],
    [1.45, { ...raised, head: head(0.5, -0.4), torso: [0, 0.15, -0.12] }],
    [2.05, { ...raised, head: head(-0.5, -0.4), torso: [0, -0.15, -0.12] }],
    [2.5, { ...raised, head: head(0, -0.34), torso: [0, 0, -0.1] }],
    [2.9, { ...hold, head: head(0, -0.1), torso: [0, 0, -0.04] }],
  ]);
}

/** Archivist pushes the glasses up the nose. */
function idleArchive(): AnimationClip {
  const face = armR(0.27, 0.26, -0.2);
  const tap = armR(0.27, 0.34, -0.2);
  return upper('idleArchive', 3.0, [
    [0.45, { armR: face, head: head(0.1, 0.06) }],
    [0.7, { armR: tap, head: head(0.1, 0.1) }],
    [0.95, { armR: face, head: head(0.1, 0.06) }],
    [1.2, { armR: tap, head: head(0.1, 0.1) }],
    [1.6, { armR: face, head: head(-0.2, 0.02) }],
    [2.2, { armR: armR(0.1, -1, 0.1), head: head(0, 0) }],
  ]);
}

/** Reporter flips the notebook page and clicks the pencil twice. */
function idleReporter(): AnimationClip {
  const book = armL(0.65, -0.45, -0.2);
  const flip = armL(0.7, -0.15, -0.2);
  const pencil = armR(0.6, -0.4, -0.3);
  const click = armR(0.6, -0.05, -0.3);
  return upper('idleReporter', 3.6, [
    [0.4, { armL: book, armR: pencil, head: head(0, -0.22) }],
    [0.85, { armL: flip, armR: pencil, head: head(0, -0.24) }],
    [1.05, { armL: book, armR: pencil, head: head(0, -0.22) }],
    [1.5, { armL: book, armR: click, head: head(0, -0.2) }],
    [1.62, { armL: book, armR: pencil, head: head(0, -0.2) }],
    [1.76, { armL: book, armR: click, head: head(0, -0.2) }],
    [1.88, { armL: book, armR: pencil, head: head(0, -0.2) }],
    [2.5, { armL: book, armR: pencil, head: head(0.2, -0.1) }],
    [3.1, { armL: armL(0.1, -1, 0.1), armR: armR(0.1, -1, 0.1), head: head(0, 0) }],
  ]);
}

/** Managing editor straightens the cap, then checks a watch. */
function idleManager(): AnimationClip {
  const cap = armR(0.12, 0.6, -0.12);
  const pat = armR(0.2, 0.55, -0.1);
  const watch = armL(0.6, 0.12, -0.38);
  return upper('idleManager', 3.5, [
    [0.4, { armR: cap, head: head(0, 0.08) }],
    [0.65, { armR: pat, head: head(0, 0.1) }],
    [0.9, { armR: cap, head: head(0, 0.08) }],
    [1.15, { armR: pat, head: head(0, 0.1) }],
    [1.5, { armR: armR(0.1, -1, 0.1), head: head(0, 0) }],
    [1.9, { armL: watch, head: head(0, -0.3) }],
    [2.6, { armL: watch, head: head(0, -0.32) }],
    [2.9, { armL: watch, head: head(0, -0.08) }],
    [3.3, { armL: armL(0.1, -1, 0.1), head: head(0, 0) }],
  ]);
}

// --- Ping emotes: short, readable at phone size ------------------------------------------------

/** needArchive: points at the shelves with a double jab. */
function emoteArchive(): AnimationClip {
  const point = armR(0.35, 0.18, 0.9);
  const jab = armR(0.4, 0.3, 0.95);
  return upper('emoteArchive', 1.4, [
    [
      0.18,
      { armR: point, armL: armL(0.05, -0.8, 0.5), head: head(0.5, -0.04), torso: [0, 0.25, 0] },
    ],
    [0.35, { armR: jab, armL: armL(0.05, -0.8, 0.5), head: head(0.5, -0.04), torso: [0, 0.25, 0] }],
    [
      0.52,
      { armR: point, armL: armL(0.05, -0.8, 0.5), head: head(0.5, -0.04), torso: [0, 0.25, 0] },
    ],
    [0.7, { armR: jab, armL: armL(0.05, -0.8, 0.5), head: head(0.5, -0.04), torso: [0, 0.25, 0] }],
    [1.0, { armR: point, head: head(0.45), torso: [0, 0.2, 0] }],
  ]);
}

/** fake: both arms crossed in an "X", flapping open and shut. */
function emoteFake(): AnimationClip {
  const crossed = { armL: armL(0.45, 0.4, -0.8), armR: armR(0.45, 0.4, -0.8) };
  const open = { armL: armL(0.25, 0.6, 0.6), armR: armR(0.25, 0.6, 0.6) };
  return upper('emoteFake', 1.3, [
    [0.14, { ...crossed, head: head(0.25) }],
    [0.32, { ...open, head: head(-0.25) }],
    [0.5, { ...crossed, head: head(0.25) }],
    [0.68, { ...open, head: head(-0.25) }],
    [0.86, { ...crossed, head: head(0.2) }],
    [1.05, { ...crossed, head: head(0) }],
  ]);
}

/** mine: hand shoots up ("I will take it"). */
function emoteMine(): AnimationClip {
  const up = armR(0.0, 1, 0.12);
  const wave = armR(0.0, 1, 0.45);
  return upper('emoteMine', 1.3, [
    [0.16, { armR: up, head: head(0, 0.1), torso: [0, 0, 0.04] }],
    [0.34, { armR: wave, head: head(0, 0.1), torso: [0, 0, 0.04] }],
    [0.52, { armR: up, head: head(0, 0.1), torso: [0, 0, 0.04] }],
    [0.7, { armR: wave, head: head(0, 0.1), torso: [0, 0, 0.04] }],
    [0.95, { armR: up, head: head(0, 0.08) }],
  ]);
}

// --- Level-win celebrations: one flavour per role ----------------------------------------------

/** Hip heights of the two jumps every celebration shares. */
const JUMPS = [-0.04, 0.24, 0, 0.18, 0, 0] as const;
const CT = [0.12, 0.28, 0.44, 0.6, 0.76, 1.1, 1.5] as const;
const hop = (i: number) => JUMPS[i] ?? 0;
const V_L = armL(0, 1, 0.55);
const V_R = armR(0, 1, 0.55);

/** Photo editor frames a shot with both hands, clicks, then throws the camera arm up. */
function cheerPhoto(): AnimationClip {
  const frame = { armL: armL(0.55, 0.45, -0.22), armR: armR(0.55, 0.45, -0.22) };
  return full('cheerPhoto', 1.5, [
    [CT[0], { ...frame, head: head(0, -0.1) }, hop(0)],
    [CT[1], { ...frame, head: head(0.2, -0.1) }, hop(1)],
    [CT[2], { ...frame, head: head(-0.2, -0.1) }, hop(2)],
    [CT[3], { armL: V_L, armR: V_R, head: head(0, 0.2) }, hop(3)],
    [CT[4], { armL: V_L, armR: V_R, head: head(0, 0.25) }, hop(4)],
    [CT[5], { armL: V_L, armR: V_R, head: head(0, 0.1) }, hop(5)],
  ]);
}

/** Archivist pumps one fist, other hand on the hip, tipping the glasses with a nod. */
function cheerArchive(): AnimationClip {
  const hip = armL(0.0, -0.6, 0.8);
  return full('cheerArchive', 1.5, [
    [CT[0], { armR: armR(0.1, 1, 0.1), armL: hip, head: head(0, 0.15) }, hop(0)],
    [CT[1], { armR: armR(0.3, 0.7, 0.0), armL: hip, head: head(0, 0.05) }, hop(1)],
    [CT[2], { armR: armR(0.1, 1, 0.1), armL: hip, head: head(0, 0.2) }, hop(2)],
    [CT[3], { armR: armR(0.3, 0.7, 0.0), armL: hip, head: head(0, 0.05) }, hop(3)],
    [CT[4], { armR: armR(0.1, 1, 0.1), armL: hip, head: head(0, 0.2) }, hop(4)],
    [CT[5], { armR: armR(0.1, 1, 0.1), armL: hip, head: head(0, 0.1) }, hop(5)],
  ]);
}

/** Reporter waves the notebook overhead with the pencil raised in the other hand. */
function cheerReporter(): AnimationClip {
  const waveA = armL(0, 1, 0.3);
  const waveB = armL(0, 1, 0.75);
  const pencil = armR(0.1, 1, 0.2);
  return full('cheerReporter', 1.5, [
    [CT[0], { armL: waveA, armR: pencil, head: head(0, 0.15) }, hop(0)],
    [CT[1], { armL: waveB, armR: pencil, head: head(0, 0.2) }, hop(1)],
    [CT[2], { armL: waveA, armR: pencil, head: head(0, 0.2) }, hop(2)],
    [CT[3], { armL: waveB, armR: pencil, head: head(0, 0.2) }, hop(3)],
    [CT[4], { armL: waveA, armR: pencil, head: head(0, 0.2) }, hop(4)],
    [CT[5], { armL: waveB, armR: pencil, head: head(0, 0.1) }, hop(5)],
  ]);
}

/** Managing editor salutes with the cap hand, then jumps with both arms out wide. */
function cheerManager(): AnimationClip {
  const salute = armR(0.25, 0.4, -0.12);
  const wide = { armL: armL(0, 0.45, 1), armR: armR(0, 0.45, 1) };
  return full('cheerManager', 1.5, [
    [CT[0], { armR: salute, head: head(0, 0.06) }, hop(0)],
    [CT[1], { armR: salute, head: head(0, 0.1) }, 0],
    [CT[2], { armR: salute, head: head(0, 0.1) }, 0],
    [CT[3], { ...wide, head: head(0, 0.2) }, 0.3],
    [CT[4], { ...wide, head: head(0, 0.25) }, 0],
    [CT[5], { ...wide, head: head(0, 0.1) }, 0.12],
  ]);
}

export const FIDGET_CLIPS = ['idlePhoto', 'idleArchive', 'idleReporter', 'idleManager'] as const;
export const EMOTE_CLIPS = ['emoteArchive', 'emoteFake', 'emoteMine'] as const;
/** Upper-body layer clips: fidgets and ping emotes. */
export const UPPER_CLIPS = [...FIDGET_CLIPS, ...EMOTE_CLIPS] as const;
export type UpperClip = (typeof UPPER_CLIPS)[number];

/** Full-body role celebrations (level win). */
export const CELEBRATION_CLIPS = [
  'cheerPhoto',
  'cheerArchive',
  'cheerReporter',
  'cheerManager',
] as const;
export type CelebrationClip = (typeof CELEBRATION_CLIPS)[number];

export type RoleClips = Record<UpperClip | CelebrationClip, AnimationClip>;

let cached: RoleClips | null = null;

/** Fidget, emote and celebration clips (built once, shared by every character). */
export function roleClips(): RoleClips {
  cached ??= {
    idlePhoto: idlePhoto(),
    idleArchive: idleArchive(),
    idleReporter: idleReporter(),
    idleManager: idleManager(),
    emoteArchive: emoteArchive(),
    emoteFake: emoteFake(),
    emoteMine: emoteMine(),
    cheerPhoto: cheerPhoto(),
    cheerArchive: cheerArchive(),
    cheerReporter: cheerReporter(),
    cheerManager: cheerManager(),
  };
  return cached;
}
