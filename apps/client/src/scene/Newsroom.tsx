// The newsroom shell from the shared tile map, in the cartoon style (design-rules §7): a warm
// plank floor (one textured plane), outlined instanced walls with a light cap, a baseboard and a
// theme-coloured stripe (tall at the back, cut away at the front so players stay visible) and
// instanced orange-brown decorative desks with drawers. Wall art and the rug come from Decor.tsx,
// interactive fixtures (conveyor, stations, desk, tables) from Fixtures.tsx.

import { fixtureAt, tileAt } from '@redakcja/shared';
import { useLayoutEffect, useMemo, useRef } from 'react';
import {
  type BufferGeometry,
  CanvasTexture,
  type InstancedMesh,
  LinearMipmapLinearFilter,
  Object3D,
  RepeatWrapping,
  SRGBColorSpace,
} from 'three';
import { runtime } from '../net/session.ts';
import { useApp } from '../store/app.ts';
import { colors } from '../ui/tokens.ts';
import { Decor } from './Decor.tsx';
import { useGeometries } from './geometry.ts';
import { buildModel, bx, bxd, type Item } from './models.ts';
import { type Theme, themeForLevel } from './theme.ts';

const BACK_WALL_HEIGHT = 1.8;
const SIDE_WALL_HEIGHT = 0.9;
const FRONT_WALL_HEIGHT = 0.22;
const DESK_HEIGHT = 0.72;
const DESK_TOP = 0.06;
/** Light cap on every wall block, so the wall silhouette reads from above. */
const WALL_CAP = 0.06;

/** Plank floor drawn once into a canvas: calm warm planks with darker seams and butt joints. */
function createFloorTexture(): CanvasTexture {
  const px = 64;
  const canvas = document.createElement('canvas');
  canvas.width = px * 4;
  canvas.height = px * 4;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const planks = 8;
    const plankH = canvas.height / planks;
    ctx.fillStyle = colors.floor;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    for (let i = 0; i < planks; i++) {
      const top = i * plankH;
      // Every other plank a touch darker, so the boards read without getting busy.
      if (i % 2 === 1) {
        ctx.globalAlpha = 0.35;
        ctx.fillStyle = colors.floorDark;
        ctx.fillRect(0, top, canvas.width, plankH);
        ctx.globalAlpha = 1;
      }
      ctx.fillStyle = colors.floorDark;
      ctx.fillRect(0, top, canvas.width, 3);
      const seam = ((i * 3) % 4) * px + px / 2;
      ctx.fillRect(seam, top, 3, plankH);
    }
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  texture.minFilter = LinearMipmapLinearFilter;
  texture.anisotropy = 4;
  return texture;
}

type Block = { x: number; z: number; height: number };

function collectBlocks() {
  const { width, height } = runtime.map;
  const back: Block[] = [];
  const side: Block[] = [];
  const front: Block[] = [];
  const desks: Block[] = [];
  for (let row = 0; row < height; row++) {
    for (let col = 0; col < width; col++) {
      const kind = tileAt(runtime.map, col, row);
      const at = { x: col + 0.5, z: row + 0.5 };
      if (kind === 'wall') {
        if (row === 0) {
          back.push({ ...at, height: BACK_WALL_HEIGHT });
        } else if (row === height - 1) {
          front.push({ ...at, height: FRONT_WALL_HEIGHT });
        } else {
          side.push({ ...at, height: SIDE_WALL_HEIGHT });
        }
      } else if (kind === 'furniture' && !fixtureAt(runtime.map, col, row)) {
        desks.push({ ...at, height: DESK_HEIGHT });
      }
    }
  }
  return { back, side, front, desks };
}

/** One wall block: outlined body, light cap, baseboard and a theme stripe wrapping all faces. */
function wallGeometry(h: number, theme: Theme): BufferGeometry {
  const items: Item[] = [
    bx(theme.wall, 1, h, 1, { y: h / 2 }),
    bxd(theme.wallCap, 1.01, WALL_CAP, 1.01, { y: h + WALL_CAP / 2 }),
  ];
  if (h > 0.5) {
    items.push(
      bxd(theme.accentDark, 1.006, 0.14, 1.006, { y: 0.07 }),
      bxd(theme.accent, 1.012, 0.07, 1.012, { y: h * 0.5 }),
    );
  }
  // The cap is part of the block: lift the body so it ends under it.
  return buildModel(items);
}

/** Decorative desk: outlined body and top, two drawer fronts with knobs. */
function deskGeometry(): BufferGeometry {
  return buildModel([
    bx(colors.furniture, 0.98, DESK_HEIGHT - DESK_TOP, 0.98, { y: (DESK_HEIGHT - DESK_TOP) / 2 }),
    bx(colors.furnitureTop, 1.02, DESK_TOP, 1.02, { y: DESK_HEIGHT - DESK_TOP / 2 }),
    bxd(colors.orangeDark, 0.4, 0.3, 0.02, { x: -0.24, y: 0.34, z: 0.49 }),
    bxd(colors.orangeDark, 0.4, 0.3, 0.02, { x: 0.24, y: 0.34, z: 0.49 }),
    bxd(colors.outline, 0.1, 0.035, 0.03, { x: -0.24, y: 0.42, z: 0.5 }),
    bxd(colors.outline, 0.1, 0.035, 0.03, { x: 0.24, y: 0.42, z: 0.5 }),
  ]);
}

function Instances({
  geometry,
  blocks,
  shadows,
}: {
  geometry: BufferGeometry;
  blocks: readonly Block[];
  shadows: boolean;
}) {
  const ref = useRef<InstancedMesh>(null);
  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) {
      return;
    }
    const dummy = new Object3D();
    blocks.forEach((block, i) => {
      dummy.position.set(block.x, 0, block.z);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [blocks]);
  if (blocks.length === 0) {
    return null;
  }
  return (
    <instancedMesh
      ref={ref}
      args={[geometry, undefined, blocks.length]}
      castShadow={shadows}
      receiveShadow={shadows}
    >
      <meshLambertMaterial vertexColors />
    </instancedMesh>
  );
}

export function Newsroom({ shadows }: { shadows: boolean }) {
  const { width, height } = runtime.map;
  const floor = useMemo(createFloorTexture, []);
  const theme = useMemo(() => themeForLevel(useApp.getState().room?.levelId ?? ''), []);
  const blocks = useMemo(collectBlocks, []);
  const g = useGeometries(() => ({
    back: wallGeometry(BACK_WALL_HEIGHT, theme),
    side: wallGeometry(SIDE_WALL_HEIGHT, theme),
    front: wallGeometry(FRONT_WALL_HEIGHT, theme),
    desk: deskGeometry(),
  }));

  useLayoutEffect(() => {
    floor.repeat.set(width / 4, height / 4);
  }, [floor, width, height]);
  useLayoutEffect(() => () => floor.dispose(), [floor]);

  return (
    <group>
      <mesh rotation-x={-Math.PI / 2} position={[width / 2, 0, height / 2]} receiveShadow={shadows}>
        <planeGeometry args={[width, height]} />
        <meshLambertMaterial map={floor} />
      </mesh>
      <Instances geometry={g.back} blocks={blocks.back} shadows={shadows} />
      <Instances geometry={g.side} blocks={blocks.side} shadows={shadows} />
      <Instances geometry={g.front} blocks={blocks.front} shadows={shadows} />
      <Instances geometry={g.desk} blocks={blocks.desks} shadows={shadows} />
      <Decor />
    </group>
  );
}
