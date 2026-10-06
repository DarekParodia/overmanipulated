// Story folders in the world: thin manila boxes whose cover (one shared atlas) shows the type
// icon and the priority band. They lie on fixtures or the floor, or follow their carrier's
// rendered position at chest height. Stamps collected show as small ink rings on the cover
// (one instanced mesh for all folders). One draw call per folder. Groups are named
// `folder:<id>` for tests.
import { useFrame } from '@react-three/fiber';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
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
import { useGame } from '../net/game-store.ts';
import { runtime } from '../net/session.ts';
import { useSettings } from '../store/settings.ts';
import { palette } from '../ui/tokens.ts';
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
import { ring } from './geometry.ts';
import { renderState } from './render-state.ts';
import { createFolderAtlas } from './textures.ts';

/** Smoothing rates (1/s) towards the target placement. Carried folders stick to the hands. */
const FOLLOW_RATE_CARRIED = 30;
const FOLLOW_RATE_RESTING = 14;
/** Instanced stamp marks shared by all folders. */
const MARK_CAPACITY = 96;
/** Stamp mark slots on the cover (folder-local x, z), right of the type icon. */
const MARK_SLOTS: readonly [number, number][] = [
  [0.12, -0.12],
  [0.19, -0.12],
  [0.12, -0.05],
  [0.19, -0.05],
  [0.12, 0.02],
];

type Motion = Placement & { pop: SpringState };

/**
 * Folder box whose sides sample the worn card edge of its atlas cell, so a whole folder is one
 * material and one draw call. Thin and low, so it casts no shadow.
 */
function createFolderGeometry(): BoxGeometry {
  const geometry = new BoxGeometry(FOLDER_SIZE.width, FOLDER_SIZE.thickness, FOLDER_SIZE.depth);
  const uv = geometry.getAttribute('uv');
  // Faces are +x, -x, +y (cover), -y, +z, -z with four vertices each.
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
  const items = useGame(useShallow((s) => s.folders.map((f) => `${f.id}\n${f.storyId}`)));
  const atlas = useMemo(createFolderAtlas, []);
  const geometry = useMemo(createFolderGeometry, []);
  const markGeometry = useMemo(() => ring(0.022, 0.006, { rx: Math.PI / 2 }), []);
  useEffect(
    () => () => {
      atlas.dispose();
      geometry.dispose();
      markGeometry.dispose();
    },
    [atlas, geometry, markGeometry],
  );

  const fixtures = useMemo(() => new Map(runtime.map.fixtures.map((f) => [f.id, f])), []);
  const groups = useRef(new Map<string, Group>());
  const motion = useRef(new Map<string, Motion>());
  const marks = useRef<InstancedMesh>(null);
  const scratch = useMemo(() => ({ local: new Object3D(), matrix: new Matrix4() }), []);

  const register = useMemo(
    () => (id: string, group: Group | null) => {
      if (group) {
        groups.current.set(id, group);
      } else {
        groups.current.delete(id);
        motion.current.delete(id);
      }
    },
    [],
  );

  useLayoutEffect(() => {
    if (marks.current) {
      marks.current.count = 0;
    }
  }, []);

  useFrame((_, delta) => {
    const reducedMotion = useSettings.getState().reducedMotion;
    const carrier = (playerId: string) => renderState.players.get(playerId);
    let markCount = 0;
    const markMesh = marks.current;

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
        m = { ...target, pop: { value: reducedMotion ? 1 : 0.35, velocity: 0 } };
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
      const scale = reducedMotion ? 1 : m.pop.value;

      group.visible = true;
      group.position.set(m.x, m.height, m.y);
      group.rotation.set(m.pitch, m.yaw, 0, 'YXZ');
      group.scale.setScalar(scale);
      group.updateMatrixWorld();

      if (!markMesh) {
        continue;
      }
      const stamps = stampMarkCount(folder);
      for (let i = 0; i < stamps && markCount < MARK_CAPACITY; i++) {
        const slot = MARK_SLOTS[i];
        if (!slot) {
          break;
        }
        scratch.local.position.set(slot[0], FOLDER_SIZE.thickness / 2 + 0.004, slot[1]);
        scratch.local.rotation.set(0, i * 0.7, 0);
        scratch.local.updateMatrix();
        scratch.matrix.multiplyMatrices(group.matrixWorld, scratch.local.matrix);
        markMesh.setMatrixAt(markCount, scratch.matrix);
        markCount++;
      }
    }

    if (markMesh) {
      markMesh.count = markCount;
      markMesh.instanceMatrix.needsUpdate = true;
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
        <meshLambertMaterial color={palette.ink} />
      </instancedMesh>
    </>
  );
}
