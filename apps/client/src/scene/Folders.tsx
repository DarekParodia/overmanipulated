// Story folders in the world: bright yellow boxes with a thick navy edge whose cover (one shared
// atlas) shows the big type icon and 1–3 priority flags, with a small prop per story type tucked
// into the back edge (folder-props.ts: one instanced mesh per type). They lie on fixtures or the
// floor, or follow their carrier's rendered position at chest height. Stamps collected show as
// navy dots on the cover (one instanced mesh for all folders). One draw call per folder plus one
// per prop type in play. Feedback triggers animate them (folder-motion.ts): slide in on the
// conveyor, hop, squash on put-down and stamp, tremble, crumple when expired (an expired folder
// stays drawn until its crumple has played). Groups are named `folder:<id>` for tests.
import { useFrame } from '@react-three/fiber';
import type { StoryType } from '@redakcja/shared';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  BoxGeometry,
  type Group,
  type InstancedMesh,
  Matrix4,
  MeshLambertMaterial,
  Object3D,
  type Texture,
} from 'three';
import { useShallow } from 'zustand/react/shallow';
import { type SpringState, stepSpring } from '../fx/animation/spring.ts';
import { feedback } from '../fx/feedback.ts';
import { useGame } from '../net/game-store.ts';
import { runtime } from '../net/session.ts';
import { useSettings } from '../store/settings.ts';
import { colors } from '../ui/tokens.ts';
import {
  ATLAS_PRIORITIES,
  ATLAS_TYPES,
  atlasCell,
  FOLDER_SIZE,
  folderLook,
  folderPlacement,
  type Placement,
  stampMarkCount,
} from './entities.ts';
import {
  CRUMPLE_S,
  createEffects,
  createOffset,
  type FolderEffects,
  stepEffects,
  triggerEffect,
} from './folder-motion.ts';
import { createFolderProps } from './folder-props.ts';
import { cylinder } from './geometry.ts';
import { renderState } from './render-state.ts';
import { createFolderAtlas } from './textures.ts';

/** Smoothing rates (1/s) towards the target placement. Carried folders stick to the hands. */
const FOLLOW_RATE_CARRIED = 30;
const FOLLOW_RATE_RESTING = 14;
/** Instanced stamp marks shared by all folders. */
const MARK_CAPACITY = 96;
/** Stamp mark slots on the cover (folder-local x, z): under the flags, right of the icon. */
const MARK_SLOTS: readonly [number, number][] = [
  [0.117, 0.066],
  [0.178, 0.066],
  [0.239, 0.066],
  [0.117, 0.15],
  [0.178, 0.15],
];

/** Instanced props per story type. */
const PROP_CAPACITY = 32;
/** A crumpled folder still in the state after this long pops back (e.g. a replayed event). */
const CRUMPLE_HOLD_S = 0.6;
/** Effects of folders not drawn for this long are dropped. */
const STALE_S = 1.5;

type Motion = Placement & {
  pop: SpringState;
  storyId: string;
  type: StoryType;
  /** Seconds since the folder was last drawn. */
  unseenS: number;
};

/**
 * Folder box whose sides sample the navy edge of its atlas cell, so a whole folder is one
 * material and one draw call. Thin and low, so it casts no shadow.
 */
function createFolderGeometry(): BoxGeometry {
  const geometry = new BoxGeometry(FOLDER_SIZE.width, FOLDER_SIZE.thickness, FOLDER_SIZE.depth);
  const uv = geometry.getAttribute('uv');
  // Faces are +x, -x, +y (cover), -y, +z, -z with four vertices each; the sides sample the
  // navy edge.
  for (let i = 0; i < uv.count; i++) {
    if (i < 8 || i >= 12) {
      uv.setXY(i, 0.01, 0.5);
    }
  }
  uv.needsUpdate = true;
  geometry.clearGroups();
  return geometry;
}

function FolderModel({
  id,
  storyId,
  atlas,
  geometry,
  register,
}: {
  id: string;
  storyId: string;
  atlas: Texture;
  geometry: BoxGeometry;
  register: (id: string, group: Group | null) => void;
}) {
  const { type, priority } = folderLook(storyId);
  const cover = useMemo(() => {
    // Clones share the atlas image, so it is uploaded to the GPU once.
    const map = atlas.clone();
    const cell = atlasCell({ type, priority });
    map.repeat.set(1 / ATLAS_TYPES.length, 1 / ATLAS_PRIORITIES.length);
    map.offset.set(cell.col / ATLAS_TYPES.length, 1 - (cell.row + 1) / ATLAS_PRIORITIES.length);
    return new MeshLambertMaterial({ map });
  }, [atlas, type, priority]);
  useEffect(
    () => () => {
      cover.map?.dispose();
      cover.dispose();
    },
    [cover],
  );
  const ref = useCallback((group: Group | null) => register(id, group), [id, register]);

  return (
    <group ref={ref} name={`folder:${id}`} visible={false}>
      <mesh geometry={geometry} material={cover} />
    </group>
  );
}

export function Folders() {
  const live = useGame(useShallow((s) => s.folders.map((f) => `${f.id}\n${f.storyId}`)));
  // Expired folders leave the state before their crumple has played: keep drawing them.
  const [ghosts, setGhosts] = useState<readonly string[]>([]);
  const items = useMemo(() => {
    const ids = new Set(live.map((item) => item.split('\n')[0]));
    return [...live, ...ghosts.filter((item) => !ids.has(item.split('\n')[0]))];
  }, [live, ghosts]);
  const atlas = useMemo(createFolderAtlas, []);
  const geometry = useMemo(createFolderGeometry, []);
  const markGeometry = useMemo(() => cylinder(0.03, 0.012, {}, 12), []);
  const propGeometries = useMemo(createFolderProps, []);
  useEffect(
    () => () => {
      atlas.dispose();
      geometry.dispose();
      markGeometry.dispose();
      for (const prop of Object.values(propGeometries)) {
        prop.dispose();
      }
    },
    [atlas, geometry, markGeometry, propGeometries],
  );

  const fixtures = useMemo(() => new Map(runtime.map.fixtures.map((f) => [f.id, f])), []);
  const groups = useRef(new Map<string, Group>());
  const motion = useRef(new Map<string, Motion>());
  const effects = useRef(new Map<string, FolderEffects>());
  const marks = useRef<InstancedMesh>(null);
  const props = useRef(new Map<StoryType, InstancedMesh>());
  const scratch = useMemo(
    () => ({
      local: new Object3D(),
      matrix: new Matrix4(),
      offset: createOffset(),
      seen: new Set<string>(),
      propCounts: new Map<StoryType, number>(),
    }),
    [],
  );

  const register = useMemo(
    () => (id: string, group: Group | null) => {
      // Motion outlives the group for a moment: a late expiry event needs the last placement.
      if (group) {
        groups.current.set(id, group);
      } else {
        groups.current.delete(id);
      }
    },
    [],
  );

  useEffect(
    () =>
      feedback.onAnimation((trigger, context, options) => {
        const id = context.folderId;
        if (!id) {
          return;
        }
        const e = effects.current.get(id) ?? createEffects();
        if (!triggerEffect(e, trigger, options.reducedMotion)) {
          return;
        }
        e.unseenS = 0;
        effects.current.set(id, e);
        if (trigger === 'crumple') {
          const storyId =
            motion.current.get(id)?.storyId ??
            useGame.getState().folders.find((f) => f.id === id)?.storyId;
          if (storyId !== undefined) {
            const item = `${id}\n${storyId}`;
            setGhosts((list) => (list.includes(item) ? list : [...list, item]));
          }
        }
      }),
    [],
  );

  useLayoutEffect(() => {
    if (marks.current) {
      marks.current.count = 0;
    }
    for (const mesh of props.current.values()) {
      mesh.count = 0;
      mesh.visible = false;
    }
  }, []);

  useFrame((_, delta) => {
    const reducedMotion = useSettings.getState().reducedMotion;
    const carrier = (playerId: string) => renderState.players.get(playerId);
    let markCount = 0;
    const markMesh = marks.current;
    const { seen, propCounts, offset } = scratch;
    seen.clear();
    propCounts.clear();
    const finishedGhosts: string[] = [];

    const draw = (id: string, m: Motion, group: Group) => {
      seen.add(id);
      m.unseenS = 0;
      const e = effects.current.get(id);
      let off = null;
      if (e) {
        e.unseenS = 0;
        off = stepEffects(e, delta, reducedMotion, offset);
      }
      const crumpled = e !== undefined && e.crumpleT >= CRUMPLE_S;
      const scale = reducedMotion ? 1 : m.pop.value;
      group.visible = !crumpled;
      group.position.set(m.x + (off?.dx ?? 0), m.height + (off?.dy ?? 0), m.y);
      group.rotation.set(m.pitch + (off?.roll ?? 0), m.yaw + (off?.spin ?? 0), 0, 'YXZ');
      group.scale.set(scale * (off?.sxz ?? 1), scale * (off?.sy ?? 1), scale * (off?.sxz ?? 1));
      group.updateMatrixWorld();
      if (crumpled) {
        return false;
      }
      const propMesh = props.current.get(m.type);
      const propIndex = propCounts.get(m.type) ?? 0;
      if (propMesh && propIndex < PROP_CAPACITY) {
        propMesh.setMatrixAt(propIndex, group.matrixWorld);
        propCounts.set(m.type, propIndex + 1);
      }
      return true;
    };

    for (const folder of useGame.getState().folders) {
      const group = groups.current.get(folder.id);
      if (!group) {
        continue;
      }
      const target = folderPlacement(folder, fixtures, carrier);
      if (!target) {
        group.visible = false;
        continue;
      }
      let m = motion.current.get(folder.id);
      if (!m) {
        m = {
          ...target,
          pop: { value: reducedMotion ? 1 : 0.35, velocity: 0 },
          storyId: folder.storyId,
          type: folderLook(folder.storyId).type,
          unseenS: 0,
        };
        motion.current.set(folder.id, m);
      }
      const carried = folder.location.kind === 'carried';
      const k = reducedMotion
        ? 1
        : 1 - Math.exp(-(carried ? FOLLOW_RATE_CARRIED : FOLLOW_RATE_RESTING) * delta);
      m.x += (target.x - m.x) * k;
      m.y += (target.y - m.y) * k;
      m.height += (target.height - m.height) * k;
      m.yaw += (target.yaw - m.yaw) * k;
      m.pitch += (target.pitch - m.pitch) * k;
      stepSpring(m.pop, 1, delta, 3.5, 0.5);

      const e = effects.current.get(folder.id);
      if (e && e.crumpleT >= CRUMPLE_S + CRUMPLE_HOLD_S) {
        // Still in play after its crumple (a replayed event): pop it back.
        effects.current.delete(folder.id);
        m.pop.value = reducedMotion ? 1 : 0.35;
      }
      if (!draw(folder.id, m, group) || !markMesh) {
        continue;
      }
      const stamps = stampMarkCount(folder);
      for (let i = 0; i < stamps && markCount < MARK_CAPACITY; i++) {
        const slot = MARK_SLOTS[i];
        if (!slot) {
          break;
        }
        scratch.local.position.set(slot[0], FOLDER_SIZE.thickness / 2 + 0.006, slot[1]);
        scratch.local.rotation.set(0, 0, 0);
        scratch.local.updateMatrix();
        scratch.matrix.multiplyMatrices(group.matrixWorld, scratch.local.matrix);
        markMesh.setMatrixAt(markCount, scratch.matrix);
        markCount++;
      }
    }

    // Expired folders already gone from the state: finish their crumple where they were.
    for (const item of ghosts) {
      const id = item.split('\n')[0] ?? '';
      if (seen.has(id)) {
        continue;
      }
      const m = motion.current.get(id);
      const group = groups.current.get(id);
      const e = effects.current.get(id);
      if (!m || !group || !e || e.crumpleT < 0) {
        finishedGhosts.push(item);
        continue;
      }
      draw(id, m, group);
      if (e.crumpleT >= CRUMPLE_S) {
        finishedGhosts.push(item);
      }
    }
    if (finishedGhosts.length > 0) {
      setGhosts((list) => list.filter((item) => !finishedGhosts.includes(item)));
    }

    // Forget folders that are gone (after a grace period for late expiry events).
    for (const [id, e] of effects.current) {
      if (!seen.has(id)) {
        e.unseenS += delta;
        if (e.unseenS > STALE_S) {
          effects.current.delete(id);
        }
      }
    }
    for (const [id, m] of motion.current) {
      if (!seen.has(id)) {
        m.unseenS += delta;
        if (m.unseenS > STALE_S) {
          motion.current.delete(id);
        }
      }
    }

    if (markMesh) {
      markMesh.count = markCount;
      markMesh.instanceMatrix.needsUpdate = true;
    }
    for (const [type, mesh] of props.current) {
      const count = propCounts.get(type) ?? 0;
      mesh.count = count;
      mesh.visible = count > 0;
      mesh.instanceMatrix.needsUpdate = true;
    }
  });

  return (
    <>
      {items.map((item) => {
        const [id = '', storyId = ''] = item.split('\n');
        return (
          <FolderModel
            key={id}
            id={id}
            storyId={storyId}
            atlas={atlas}
            geometry={geometry}
            register={register}
          />
        );
      })}
      <instancedMesh
        ref={marks}
        args={[markGeometry, undefined, MARK_CAPACITY]}
        frustumCulled={false}
        name="folder-stamp-marks"
      >
        <meshLambertMaterial color={colors.outline} />
      </instancedMesh>
      {ATLAS_TYPES.map((type) => (
        <instancedMesh
          key={type}
          ref={(mesh) => {
            if (mesh) {
              props.current.set(type, mesh);
            } else {
              props.current.delete(type);
            }
          }}
          args={[propGeometries[type], undefined, PROP_CAPACITY]}
          frustumCulled={false}
          visible={false}
          name={`folder-props:${type}`}
        >
          <meshLambertMaterial vertexColors flatShading />
        </instancedMesh>
      ))}
    </>
  );
}
