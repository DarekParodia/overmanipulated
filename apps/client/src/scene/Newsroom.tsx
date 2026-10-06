// Greybox newsroom from the shared tile map: plank floor (one textured plane), instanced walls
// (tall at the back, cut away at the front so players stay visible) and instanced desks.

import { tileAt } from '@redakcja/shared';
import { useLayoutEffect, useMemo, useRef } from 'react';
import {
  CanvasTexture,
  type InstancedMesh,
  LinearMipmapLinearFilter,
  Object3D,
  RepeatWrapping,
  SRGBColorSpace,
} from 'three';
import { runtime } from '../net/session.ts';
import { palette } from '../ui/tokens.ts';

const BACK_WALL_HEIGHT = 1.5;
const SIDE_WALL_HEIGHT = 0.9;
const FRONT_WALL_HEIGHT = 0.22;
const DESK_HEIGHT = 0.72;
const DESK_TOP = 0.06;

/** Plank floor drawn once into a canvas: two tones from the palette, seams and grain lines. */
function createFloorTexture(): CanvasTexture {
  const px = 64;
  const canvas = document.createElement('canvas');
  canvas.width = px * 4;
  canvas.height = px * 4;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const planks = 8;
    const plankH = canvas.height / planks;
    for (let i = 0; i < planks; i++) {
      ctx.fillStyle = i % 2 === 0 ? palette.floor : palette.paperDeep;
      ctx.fillRect(0, i * plankH, canvas.width, plankH);
      ctx.fillStyle = palette.wood;
      ctx.globalAlpha = 0.35;
      ctx.fillRect(0, i * plankH, canvas.width, 2);
      const seam = ((i * 97) % 4) * px + px / 2;
      ctx.fillRect(seam, i * plankH, 2, plankH);
      ctx.globalAlpha = 0.08;
      for (let g = 0; g < 3; g++) {
        ctx.fillRect(0, i * plankH + 6 + g * 7 + ((i * 3) % 4), canvas.width, 1);
      }
      ctx.globalAlpha = 1;
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
  const walls: Block[] = [];
  const desks: Block[] = [];
  for (let row = 0; row < height; row++) {
    for (let col = 0; col < width; col++) {
      const kind = tileAt(runtime.map, col, row);
      if (kind === 'wall') {
        const h =
          row === 0 ? BACK_WALL_HEIGHT : row === height - 1 ? FRONT_WALL_HEIGHT : SIDE_WALL_HEIGHT;
        walls.push({ x: col + 0.5, z: row + 0.5, height: h });
      } else if (kind === 'furniture') {
        desks.push({ x: col + 0.5, z: row + 0.5, height: DESK_HEIGHT });
      }
    }
  }
  return { walls, desks };
}

function useInstances(
  blocks: Block[],
  yOffset: (b: Block) => number,
  scaleY: (b: Block) => number,
) {
  const ref = useRef<InstancedMesh>(null);
  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) {
      return;
    }
    const dummy = new Object3D();
    blocks.forEach((block, i) => {
      dummy.position.set(block.x, yOffset(block), block.z);
      dummy.scale.set(1, scaleY(block), 1);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [blocks, yOffset, scaleY]);
  return ref;
}

const wallY = (b: Block) => b.height / 2;
const wallScale = (b: Block) => b.height;
const deskY = (b: Block) => (b.height - DESK_TOP) / 2;
const deskScale = (b: Block) => b.height - DESK_TOP;
const topY = (b: Block) => b.height - DESK_TOP / 2;
const topScale = () => DESK_TOP;

export function Newsroom({ shadows }: { shadows: boolean }) {
  const { width, height } = runtime.map;
  const floor = useMemo(createFloorTexture, []);
  const { walls, desks } = useMemo(collectBlocks, []);
  const wallRef = useInstances(walls, wallY, wallScale);
  const deskRef = useInstances(desks, deskY, deskScale);
  const topRef = useInstances(desks, topY, topScale);

  useLayoutEffect(() => {
    floor.repeat.set(width / 4, height / 4);
  }, [floor, width, height]);

  return (
    <group>
      <mesh rotation-x={-Math.PI / 2} position={[width / 2, 0, height / 2]} receiveShadow={shadows}>
        <planeGeometry args={[width, height]} />
        <meshLambertMaterial map={floor} />
      </mesh>
      <instancedMesh
        ref={wallRef}
        args={[undefined, undefined, walls.length]}
        castShadow={shadows}
        receiveShadow={shadows}
      >
        <boxGeometry args={[1, 1, 1]} />
        <meshLambertMaterial color={palette.wall} />
      </instancedMesh>
      <instancedMesh ref={deskRef} args={[undefined, undefined, desks.length]} castShadow={shadows}>
        <boxGeometry args={[0.98, 1, 0.98]} />
        <meshLambertMaterial color={palette.furniture} />
      </instancedMesh>
      <instancedMesh
        ref={topRef}
        args={[undefined, undefined, desks.length]}
        receiveShadow={shadows}
      >
        <boxGeometry args={[1.02, 1, 1.02]} />
        <meshLambertMaterial color={palette.furnitureTop} />
      </instancedMesh>
    </group>
  );
}
