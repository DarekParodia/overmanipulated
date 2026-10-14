// Role-specific clips (S5-02): fidgets played after a few seconds of standing still, ping emotes
// and level-win celebrations. Fidgets and emotes are "upper-body" clips (torso, head, arms): the
// controller lays them over whatever the legs are doing, so an emote never stops a walking
// player. Celebrations are full-body gestures like `cheer`. Arm poses are written as pointing
// directions in torso space (+x forward, +y up, +z left) through `armL`/`armR`, which is far
// easier to author than Euler angles for a one-bone arm; `armR` mirrors the left-arm numbers.
import { ABILITY } from '@redakcja/shared';
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

/** Generalist twirls a pencil in front of the chest, then looks round for the next queue. */
function idleGeneral(): AnimationClip {
  const low = armR(0.6, -0.2, -0.3);
  const twirl = armR(0.6, 0.05, -0.15);
  return upper('idleGeneral', 3.2, [
    [0.35, { armR: low, head: head(0, -0.2) }],
    [0.6, { armR: twirl, head: head(0, -0.18) }],
    [0.85, { armR: low, head: head(0, -0.2) }],
    [1.1, { armR: twirl, head: head(0, -0.18) }],
    [1.5, { armR: low, head: head(0.6, 0), torso: [0, 0.18, 0] }],
    [2.1, { armR: low, head: head(-0.6, 0), torso: [0, -0.18, 0] }],
    [2.7, { armR: armR(0.1, -1, 0.1), head: head(0, 0) }],
  ]);
}

/** Rescuer shades the eyes with one hand and scans the room from side to side. */
function idleRescuer(): AnimationClip {
  const shade = armR(0.45, 0.62, -0.25);
  return upper('idleRescuer', 3.4, [
    [0.45, { armR: shade, head: head(0, 0.12) }],
    [1.05, { armR: shade, head: head(0.55, 0.12), torso: [0, 0.2, 0] }],
    [1.85, { armR: shade, head: head(-0.55, 0.12), torso: [0, -0.2, 0] }],
    [2.45, { armR: shade, head: head(0, 0.1), torso: [0, 0, 0] }],
    [2.95, { armR: armR(0.1, -1, 0.1), head: head(0, 0) }],
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

// --- Role ability reactions (S7-42): upper body, so a walking player keeps walking -------------

/** Ekspertyza, Druga szansa, Przedłużenie (done or armed): a quick double fist pump. */
function abilityPower(): AnimationClip {
  const low = { armL: armL(0.55, 0.15, -0.25), armR: armR(0.55, 0.15, -0.25) };
  const up = { armL: armL(0.25, 0.9, 0.05), armR: armR(0.25, 0.9, 0.05) };
  return upper('abilityPower', 1.0, [
    [0.12, { ...low, head: head(0, -0.08), torso: [0, 0, -0.06] }],
    [0.3, { ...up, head: head(0, 0.2), torso: [0, 0, 0.05] }],
    [0.45, { ...low, head: head(0, 0.05), torso: [0, 0, -0.02] }],
    [0.62, { ...up, head: head(0, 0.22), torso: [0, 0, 0.05] }],
    [0.82, { ...low, head: head(0, 0.05) }],
  ]);
}

/** Podaj teczkę: both hands swing back, then push the folder forward and up in an arc. */
function abilityThrow(): AnimationClip {
  const back = { armL: armL(-0.35, -0.55, 0.2), armR: armR(-0.35, -0.55, 0.2) };
  const release = { armL: armL(0.85, 0.45, -0.1), armR: armR(0.85, 0.45, -0.1) };
  return upper('abilityThrow', 0.9, [
    [0.14, { ...back, torso: [0, 0, -0.12], head: head(0, -0.05) }],
    [0.32, { ...release, torso: [0, 0, 0.14], head: head(0, 0.15) }],
    [0.5, { ...release, torso: [0, 0, 0.1], head: head(0, 0.12) }],
    [0.75, { armL: armL(0.4, -0.6, 0.1), armR: armR(0.4, -0.6, 0.1), head: head(0, 0.04) }],
  ]);
}

/**
 * Telefon z terenu: the right hand holds a phone to the ear for the whole call
 * (`ABILITY.fieldCall.callMs`), with a few nods. The left arm has no track, so a carried folder
 * stays in that hand's pose. The controller stops it early when the call ends.
 */
function abilityCall(): AnimationClip {
  const duration = ABILITY.fieldCall.callMs / 1000;
  const ear = armR(0.12, 0.72, -0.2);
  const nod = (pitch: number): Rot => head(-0.15, pitch, 0.12);
  // Keys at fractions of the call, so the clip follows a retuned call length.
  const keys: readonly [number, Pose][] = [
    [0.05, { armR: ear, head: nod(0) }],
    [0.2, { armR: ear, head: nod(0.1) }],
    [0.25, { armR: ear, head: nod(-0.05) }],
    [0.3, { armR: ear, head: nod(0.1) }],
    [0.5, { armR: ear, head: nod(0), torso: [0, -0.1, 0] }],
    [0.7, { armR: ear, head: nod(0.08), torso: [0, 0.1, 0] }],
    [0.75, { armR: ear, head: nod(-0.05) }],
    [0.93, { armR: ear, head: nod(0) }],
  ];
  return upper(
    'abilityCall',
    duration,
    keys.map(([at, pose]) => [at * duration, pose] as const),
  );
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

/** Generalist gives two thumbs up on both hops. */
function cheerGeneral(): AnimationClip {
  const thumbs = { armL: armL(0.6, 0.35, 0.25), armR: armR(0.6, 0.35, 0.25) };
  const pump = { armL: armL(0.6, 0.6, 0.2), armR: armR(0.6, 0.6, 0.2) };
  return full('cheerGeneral', 1.5, [
    [CT[0], { ...thumbs, head: head(0, 0.1) }, hop(0)],
    [CT[1], { ...pump, head: head(0, 0.2) }, hop(1)],
    [CT[2], { ...thumbs, head: head(0, 0.15) }, hop(2)],
    [CT[3], { ...pump, head: head(0, 0.2) }, hop(3)],
    [CT[4], { ...thumbs, head: head(0, 0.2) }, hop(4)],
    [CT[5], { ...thumbs, head: head(0, 0.1) }, hop(5)],
  ]);
}

/** Rescuer swings an arm as if throwing the ring, then jumps into a V. */
function cheerRescuer(): AnimationClip {
  const windUp = armR(-0.6, 0.3, 0.6);
  const release = armR(0.9, 0.4, -0.1);
  return full('cheerRescuer', 1.5, [
    [CT[0], { armR: windUp, torso: [0, -0.25, 0], head: head(-0.2, 0.05) }, hop(0)],
    [CT[1], { armR: release, torso: [0, 0.25, 0], head: head(0.15, 0.1) }, 0],
    [CT[2], { armR: release, torso: [0, 0.1, 0], head: head(0, 0.15) }, 0],
    [CT[3], { armL: V_L, armR: V_R, head: head(0, 0.2) }, hop(3)],
    [CT[4], { armL: V_L, armR: V_R, head: head(0, 0.25) }, hop(4)],
    [CT[5], { armL: V_L, armR: V_R, head: head(0, 0.1) }, hop(5)],
  ]);
}

export const FIDGET_CLIPS = [
  'idlePhoto',
  'idleArchive',
  'idleReporter',
  'idleManager',
  'idleGeneral',
  'idleRescuer',
] as const;
export const EMOTE_CLIPS = ['emoteArchive', 'emoteFake', 'emoteMine'] as const;
/** Role ability reactions (S7-42). */
export const ABILITY_CLIPS = ['abilityPower', 'abilityThrow', 'abilityCall'] as const;
/** Upper-body layer clips: fidgets, ping emotes and ability reactions. */
export const UPPER_CLIPS = [...FIDGET_CLIPS, ...EMOTE_CLIPS, ...ABILITY_CLIPS] as const;
export type UpperClip = (typeof UPPER_CLIPS)[number];

/** Full-body role celebrations (level win). */
export const CELEBRATION_CLIPS = [
  'cheerPhoto',
  'cheerArchive',
  'cheerReporter',
  'cheerManager',
  'cheerGeneral',
  'cheerRescuer',
] as const;
export type CelebrationClip = (typeof CELEBRATION_CLIPS)[number];

export type RoleClips = Record<UpperClip | CelebrationClip, AnimationClip>;

let cached: RoleClips | null = null;

/** Fidget, emote, ability and celebration clips (built once, shared by every character). */
export function roleClips(): RoleClips {
  cached ??= {
    idlePhoto: idlePhoto(),
    idleArchive: idleArchive(),
    idleReporter: idleReporter(),
    idleManager: idleManager(),
    idleGeneral: idleGeneral(),
    idleRescuer: idleRescuer(),
    emoteArchive: emoteArchive(),
    emoteFake: emoteFake(),
    emoteMine: emoteMine(),
    abilityPower: abilityPower(),
    abilityThrow: abilityThrow(),
    abilityCall: abilityCall(),
    cheerPhoto: cheerPhoto(),
    cheerArchive: cheerArchive(),
    cheerReporter: cheerReporter(),
    cheerManager: cheerManager(),
    cheerGeneral: cheerGeneral(),
    cheerRescuer: cheerRescuer(),
  };
  return cached;
}
