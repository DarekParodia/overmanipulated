// Hand "IK" for carrying and reaching (S5-02). The rig has one bone per arm (no elbow), so the
// solver is an aim: the arm points from the shoulder at a target in torso space and the glove
// lands one arm length along that ray. Carrying aims both arms at two points in front of the
// chest (the hands meet around the folder); reaching aims them at a fixture. The folder follows
// the glove midpoint (`carryAnchor`). Pure maths on plain numbers and three's Quaternion.
import { type Quaternion, Vector3 } from 'three';
import { BONE_REST } from './rig.ts';

/** Distance from the shoulder to the centre of the glove (arm capsule plus glove, rig.ts). */
export const ARM_LENGTH = 0.29;

/** Shoulder positions in torso space (+x forward, +y up, +z left). */
export const SHOULDER_L = BONE_REST.armL;
export const SHOULDER_R = BONE_REST.armR;

/** Where the torso bone sits in the character's group space at rest (hips + torso offsets). */
export const TORSO_ORIGIN_Y = BONE_REST.hips[1] + BONE_REST.torso[1];

export type Vec3 = { x: number; y: number; z: number };

/** The points both hands aim at while carrying a folder (torso space): in front, chest height. */
export const CARRY_AIM = { x: 0.55, y: 0.45, zHalf: 0.1 } as const;

/** How far in front of the glove midpoint the carried folder's centre sits. */
export const CARRY_FOLDER_AHEAD = 0.17;

const DOWN = new Vector3(0, -1, 0);
const scratch = new Vector3();

/** Rotation that turns a hanging arm (-y) to point along (dx, dy, dz) in torso space. */
export function aimQuaternion(dx: number, dy: number, dz: number, out: Quaternion): Quaternion {
  scratch.set(dx, dy, dz);
  if (scratch.lengthSq() < 1e-9) {
    return out.identity();
  }
  return out.setFromUnitVectors(DOWN, scratch.normalize());
}

/** Arm rotation that points the glove at `target` (torso space) from a shoulder. */
export function aimArmAt(
  shoulder: readonly [number, number, number],
  target: Vec3,
  out: Quaternion,
): Quaternion {
  return aimQuaternion(target.x - shoulder[0], target.y - shoulder[1], target.z - shoulder[2], out);
}

/** The glove position (torso space) when the arm points at `target`. */
export function gloveAt(
  shoulder: readonly [number, number, number],
  target: Vec3,
  out: Vec3,
): Vec3 {
  scratch.set(target.x - shoulder[0], target.y - shoulder[1], target.z - shoulder[2]);
  scratch.normalize().multiplyScalar(ARM_LENGTH);
  out.x = shoulder[0] + scratch.x;
  out.y = shoulder[1] + scratch.y;
  out.z = shoulder[2] + scratch.z;
  return out;
}

/** Carry aim point of the left (`side` +1) or right (-1) hand. */
export function carryTarget(side: 1 | -1, out: Vec3): Vec3 {
  out.x = CARRY_AIM.x;
  out.y = CARRY_AIM.y;
  out.z = CARRY_AIM.zHalf * side;
  return out;
}

/**
 * A point on the floor plan (world offset from the character in tiles, x right / z towards the
 * camera) in the character's torso space, `height` above the floor. `bodyRotationY` is the
 * group's rotation about Y.
 */
export function worldToTorso(
  offsetX: number,
  offsetZ: number,
  height: number,
  bodyRotationY: number,
  out: Vec3,
): Vec3 {
  const c = Math.cos(bodyRotationY);
  const s = Math.sin(bodyRotationY);
  out.x = offsetX * c - offsetZ * s;
  out.z = offsetX * s + offsetZ * c;
  out.y = height - TORSO_ORIGIN_Y;
  return out;
}

/** Folder centre (group space offsets) from the two glove positions: midpoint plus a step ahead. */
export function carryAnchor(left: Vec3, right: Vec3, out: Vec3): Vec3 {
  out.x = (left.x + right.x) / 2 + CARRY_FOLDER_AHEAD;
  out.y = (left.y + right.y) / 2;
  out.z = (left.z + right.z) / 2;
  return out;
}

/** Carried-folder anchors published by the avatars for the folder layer (world tiles / height). */
export type HandAnchor = { x: number; y: number; height: number };
export const handAnchors = new Map<string, HandAnchor>();
