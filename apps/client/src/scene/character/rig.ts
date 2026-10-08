// Procedural cartoon character (S3-05): a small bone rig (hips, torso, head, arms, legs) skinned
// to chunky flat-shaded primitives. Every part follows exactly one bone, so the whole body is one
// vertex-coloured SkinnedMesh plus one inverted-hull outline mesh sharing the skeleton: two draw
// calls per character, whatever the role accessory. +x is forward (the face), +y up.
import type { Role } from '@redakcja/shared';
import {
  BackSide,
  Bone,
  type BufferGeometry,
  CapsuleGeometry,
  CylinderGeometry,
  Float32BufferAttribute,
  Group,
  MeshBasicMaterial,
  MeshLambertMaterial,
  Skeleton,
  SkinnedMesh,
  SphereGeometry,
  TorusGeometry,
  Uint16BufferAttribute,
} from 'three';
import { colors } from '../../ui/tokens.ts';
import { box, merge, paint } from '../geometry.ts';

export const BONE_NAMES = ['hips', 'torso', 'head', 'armL', 'armR', 'legL', 'legR'] as const;
export type BoneName = (typeof BONE_NAMES)[number];

/** Bone rest positions relative to the parent bone (hips relative to the character root). */
export const BONE_REST: Record<BoneName, readonly [number, number, number]> = {
  hips: [0, 0.34, 0],
  torso: [0, 0.03, 0],
  head: [0, 0.47, 0],
  armL: [0, 0.37, 0.29],
  armR: [0, 0.37, -0.29],
  legL: [0, -0.02, 0.12],
  legR: [0, -0.02, -0.12],
};

const BONE_PARENT: Record<BoneName, BoneName | null> = {
  hips: null,
  torso: 'hips',
  head: 'torso',
  armL: 'torso',
  armR: 'torso',
  legL: 'hips',
  legR: 'hips',
};

/** Height of the top of the head above the floor in the rest pose (name tags sit above it). */
export const CHARACTER_HEIGHT = 1.3;

/** Outline thickness (world units) of the inverted hull around body parts. */
const OUTLINE = 0.05;
const OUTLINE_SMALL = 0.035;

/** World-space rest position of a bone (sum of the chain's offsets; the rest pose has no rotation). */
export function boneRestWorld(name: BoneName): [number, number, number] {
  const out: [number, number, number] = [0, 0, 0];
  let current: BoneName | null = name;
  while (current) {
    const rest: readonly [number, number, number] = BONE_REST[current];
    out[0] += rest[0];
    out[1] += rest[1];
    out[2] += rest[2];
    current = BONE_PARENT[current];
  }
  return out;
}

type Part = {
  /** Geometry centred on its own origin (outline inflation scales about it). */
  geometry: BufferGeometry;
  color: string;
  bone: BoneName;
  /** Centre in the bone's local space. */
  at: readonly [number, number, number];
  /** Outline thickness; 0 = no outline (navy parts, tiny details). */
  outline: number;
};

function part(
  bone: BoneName,
  geometry: BufferGeometry,
  color: string,
  at: readonly [number, number, number],
  outline = OUTLINE,
): Part {
  return { geometry, color, bone, at, outline };
}

const sphere = (radius: number, w = 10, h = 7) => new SphereGeometry(radius, w, h);
const capsule = (radius: number, length: number, radial = 8) =>
  new CapsuleGeometry(radius, length, 2, radial);
const scaled = (geometry: BufferGeometry, x: number, y: number, z: number) =>
  geometry.scale(x, y, z);

/** Head sphere: radius and centre in the head bone's space. */
const HEAD_R = 0.27;
const HEAD_Y = 0.2;
/** Eyes sit tilted up the face so they read from the angled top-down camera. */
const EYE_ELEVATION = 0.38;
const EYE_SIDE = 0.1;

/** A point on (or `out` beyond) the head surface at the eye elevation, `z` to the side. */
function onFace(z: number, out: number, elevation = EYE_ELEVATION): [number, number, number] {
  const y = HEAD_R * Math.sin(elevation);
  const x = Math.sqrt(Math.max(0, HEAD_R * HEAD_R - y * y - z * z));
  return [x + out * Math.cos(elevation), HEAD_Y + y + out * Math.sin(elevation), z];
}

/** A flattened disc facing along the face normal at the eye elevation. */
function faceDisc(radius: number, depth: number): BufferGeometry {
  return scaled(sphere(radius, 10, 7), depth, 1, 1).rotateZ(EYE_ELEVATION);
}

/** The body every character shares, in the player's colour with white hands and navy shoes. */
function bodyParts(color: string): Part[] {
  return [
    // Bean-shaped torso and a big round head.
    part('torso', capsule(0.27, 0.2, 10), color, [0, 0.22, 0]),
    part('head', sphere(HEAD_R), color, [0, HEAD_Y, 0]),
    // Big cartoon eyes looking forward (+x): white with navy pupils.
    part('head', faceDisc(0.088, 0.4), colors.surface, onFace(EYE_SIDE, -0.012), 0),
    part('head', faceDisc(0.088, 0.4), colors.surface, onFace(-EYE_SIDE, -0.012), 0),
    part('head', faceDisc(0.046, 0.5), colors.outline, onFace(EYE_SIDE * 0.95, 0.012), 0),
    part('head', faceDisc(0.046, 0.5), colors.outline, onFace(-EYE_SIDE * 0.95, 0.012), 0),
    // Arms hanging from the shoulders, white cartoon gloves.
    part('armL', capsule(0.07, 0.16), color, [0, -0.13, 0], OUTLINE_SMALL),
    part('armR', capsule(0.07, 0.16), color, [0, -0.13, 0], OUTLINE_SMALL),
    part('armL', sphere(0.085, 8, 6), colors.surface, [0, -0.29, 0], OUTLINE_SMALL),
    part('armR', sphere(0.085, 8, 6), colors.surface, [0, -0.29, 0], OUTLINE_SMALL),
    // Stubby legs with navy shoes.
    part('legL', capsule(0.09, 0.1), color, [0, -0.13, 0], OUTLINE_SMALL),
    part('legR', capsule(0.09, 0.1), color, [0, -0.13, 0], OUTLINE_SMALL),
    part('legL', box(0.21, 0.08, 0.14), colors.outline, [0.03, -0.27, 0], 0),
    part('legR', box(0.21, 0.08, 0.14), colors.outline, [0.03, -0.27, 0], 0),
  ];
}

function ringYZ(radius: number, tube: number): BufferGeometry {
  // Torus lies in XY; turn it to face +x.
  return new TorusGeometry(radius, tube, 5, 14).rotateY(Math.PI / 2).rotateZ(EYE_ELEVATION);
}

/** Role accessories (glossary: photo editor, archivist, reporter, managing editor). */
function accessoryParts(role: Role | null): Part[] {
  switch (role) {
    case 'photoEditor': {
      // Camera on a strap across the chest.
      const strap = new TorusGeometry(0.285, 0.018, 4, 18).rotateX(Math.PI / 2).rotateX(0.55);
      return [
        part('torso', strap, colors.outline, [0, 0.24, 0], 0),
        part('torso', box(0.1, 0.14, 0.22), colors.textSoft, [0.3, 0.14, 0], OUTLINE_SMALL),
        part(
          'torso',
          new CylinderGeometry(0.058, 0.058, 0.08, 10).rotateZ(Math.PI / 2),
          colors.surface,
          [0.37, 0.13, 0.02],
          OUTLINE_SMALL,
        ),
        part(
          'torso',
          new CylinderGeometry(0.036, 0.036, 0.02, 10).rotateZ(Math.PI / 2),
          colors.outline,
          [0.415, 0.13, 0.02],
          0,
        ),
        part('torso', box(0.05, 0.04, 0.06), colors.outline, [0.3, 0.23, -0.06], 0),
      ];
    }
    case 'archivist':
      // Round glasses around the eyes, with a bridge and temples.
      return [
        part('head', ringYZ(0.1, 0.02), colors.outline, onFace(EYE_SIDE, 0.012), 0),
        part('head', ringYZ(0.1, 0.02), colors.outline, onFace(-EYE_SIDE, 0.012), 0),
        part('head', box(0.03, 0.025, 0.05), colors.outline, onFace(0, 0.02), 0),
      ];
    case 'reporter':
      // Notebook in the left hand, pencil behind the ear.
      return [
        part('armL', box(0.16, 0.035, 0.13), colors.surface, [0.06, -0.33, 0.02], OUTLINE_SMALL),
        part('armL', box(0.12, 0.04, 0.012), colors.blue, [0.06, -0.33, -0.03], 0),
        part(
          'head',
          new CylinderGeometry(0.022, 0.022, 0.24, 6).rotateZ(Math.PI / 2 - 0.35),
          colors.furniture,
          [0.0, 0.25, 0.235],
          0.014,
        ),
        part(
          'head',
          new CylinderGeometry(0, 0.022, 0.05, 6).rotateZ(-Math.PI / 2 - 0.35),
          colors.outline,
          [0.135, 0.205, 0.235],
          0,
        ),
      ];
    case 'managingEditor':
      // Cap over the top of the head (clear of the eyes) with a visor.
      return [
        part(
          'head',
          new SphereGeometry(HEAD_R + 0.02, 12, 4, 0, Math.PI * 2, 0, 0.82),
          colors.surface,
          [0, HEAD_Y, 0],
        ),
        part(
          'head',
          box(0.17, 0.03, 0.36).rotateZ(-0.25),
          colors.outline,
          onFace(0, 0.06, 0.78),
          0,
        ),
        part('head', sphere(0.045, 6, 4), colors.outline, [0, HEAD_Y + HEAD_R + 0.03, 0], 0),
      ];
    default:
      return [];
  }
}

/** Grows a centred part by `thickness` on every side (non-uniform scale about its centre). */
function inflate(geometry: BufferGeometry, thickness: number): BufferGeometry {
  const clone = geometry.clone();
  clone.computeBoundingBox();
  const bb = clone.boundingBox;
  if (!bb) {
    return clone;
  }
  const sx = bb.max.x - bb.min.x;
  const sy = bb.max.y - bb.min.y;
  const sz = bb.max.z - bb.min.z;
  const factor = (size: number) => (size > 1e-6 ? (size + thickness * 2) / size : 1);
  return clone.scale(factor(sx), factor(sy), factor(sz));
}

/** Places parts in bind-pose space with a rigid skin weight to their bone, then merges them. */
function buildSkinned(parts: readonly Part[], withColor: boolean): BufferGeometry {
  const placed = parts.map((p) => {
    const origin = boneRestWorld(p.bone);
    const geometry = p.geometry.translate(
      origin[0] + p.at[0],
      origin[1] + p.at[1],
      origin[2] + p.at[2],
    );
    const count = geometry.getAttribute('position').count;
    const index = BONE_NAMES.indexOf(p.bone);
    const skinIndex = new Uint16Array(count * 4);
    const skinWeight = new Float32Array(count * 4);
    for (let i = 0; i < count; i++) {
      skinIndex[i * 4] = index;
      skinWeight[i * 4] = 1;
    }
    geometry.setAttribute('skinIndex', new Uint16BufferAttribute(skinIndex, 4));
    geometry.setAttribute('skinWeight', new Float32BufferAttribute(skinWeight, 4));
    if (withColor) {
      paint(geometry, p.color);
    } else {
      geometry.deleteAttribute('uv');
    }
    return geometry;
  });
  return merge(placed);
}

/** Geometries for one character look: the coloured body and its outline hull. */
export function buildCharacterGeometry(
  color: string,
  role: Role | null,
): { body: BufferGeometry; outline: BufferGeometry } {
  const parts = [...bodyParts(color), ...accessoryParts(role)];
  const hulls = parts
    .filter((p) => p.outline > 0)
    .map((p) => ({ ...p, geometry: inflate(p.geometry, p.outline) }));
  const outline = buildSkinned(hulls, false);
  const body = buildSkinned(parts, true);
  return { body, outline };
}

export type CharacterRig = {
  /** Add this to the scene; it holds both meshes and the bone hierarchy. */
  root: Group;
  bones: Record<BoneName, Bone>;
  body: SkinnedMesh;
  outline: SkinnedMesh;
  dispose(): void;
};

/** Builds the bones, skeleton and both skinned meshes for one character. */
export function createCharacterRig(
  color: string,
  role: Role | null,
  options: { shadows: boolean },
): CharacterRig {
  const bones = {} as Record<BoneName, Bone>;
  for (const name of BONE_NAMES) {
    const bone = new Bone();
    bone.name = name;
    bone.position.set(...BONE_REST[name]);
    bones[name] = bone;
  }
  for (const name of BONE_NAMES) {
    const parent = BONE_PARENT[name];
    if (parent) {
      bones[parent].add(bones[name]);
    }
  }

  const geometry = buildCharacterGeometry(color, role);
  const bodyMaterial = new MeshLambertMaterial({ vertexColors: true, flatShading: true });
  const outlineMaterial = new MeshBasicMaterial({ color: colors.outline, side: BackSide });
  const body = new SkinnedMesh(geometry.body, bodyMaterial);
  const outline = new SkinnedMesh(geometry.outline, outlineMaterial);
  body.name = 'avatar-body';
  outline.name = 'avatar-outline';
  body.castShadow = options.shadows;
  // Up to four characters: culling them costs more than it saves, and poses leave the bind box.
  body.frustumCulled = false;
  outline.frustumCulled = false;

  const root = new Group();
  root.add(bones.hips);
  root.add(body);
  root.add(outline);
  root.updateMatrixWorld(true);
  const skeleton = new Skeleton(BONE_NAMES.map((name) => bones[name]));
  body.bind(skeleton);
  outline.bind(skeleton);

  return {
    root,
    bones,
    body,
    outline,
    dispose() {
      geometry.body.dispose();
      geometry.outline.dispose();
      bodyMaterial.dispose();
      outlineMaterial.dispose();
      skeleton.dispose();
    },
  };
}
