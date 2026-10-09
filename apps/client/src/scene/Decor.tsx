// Wall and floor decor of the newsroom set (S5-01): windows with a per-level view (storm with
// falling rain, night skyline, dusk), posters, a pennant string and a trimmed rug under the
// editorial desk. Placement comes from decor-layout.ts (free back-wall columns only), looks from
// the level theme (theme.ts). Everything is merged: one vertex-coloured mesh for frames, rug and
// pennants, one flat textured mesh for the art, one more for the rain, so the whole layer is 2-3
// draw calls. Quiet by design: stations and folders must stay the loudest things in the room.
import { useFrame } from '@react-three/fiber';
import type { TileMap } from '@redakcja/shared';
import { useEffect, useMemo } from 'react';
import { type BufferGeometry, ConeGeometry, PlaneGeometry } from 'three';
import { runtime } from '../net/session.ts';
import { useSettings } from '../store/settings.ts';
import { colors } from '../ui/tokens.ts';
import { type AtlasCell, cellUv, createDecorAtlas, createRainTexture } from './decor-art.ts';
import { type DecorSlot, decorSlots } from './decor-layout.ts';
import { merge, paint } from './geometry.ts';
import { buildModel, bxd } from './models.ts';
import { useQuality } from './quality.ts';
import type { Theme } from './theme.ts';

/** Back wall front face (the wall block ends at z = 1) and art heights. */
const WALL_FACE = 1;
const ART_Y = 1.28;
const WINDOW_W = 1.1;
const WINDOW_H = 0.8;
const POSTER = 0.84;
const RAIN_SCROLL = 0.8;

/** A flat quad with its UVs mapped to an atlas cell (or the whole texture). */
function quad(
  w: number,
  h: number,
  at: { x: number; y: number; z: number },
  cell?: AtlasCell,
): BufferGeometry {
  const geometry = new PlaneGeometry(w, h);
  if (cell) {
    const { u0, v0, u1, v1 } = cellUv(cell);
    const uv = geometry.getAttribute('uv');
    for (let i = 0; i < uv.count; i++) {
      uv.setXY(i, uv.getX(i) < 0.5 ? u0 : u1, uv.getY(i) < 0.5 ? v0 : v1);
    }
  }
  return geometry.translate(at.x, at.y, at.z);
}

type Layer = { solid: BufferGeometry; art: BufferGeometry | null; rain: BufferGeometry | null };

/** Triangular pennant, point down, flat against the wall. */
function pennant(x: number, y: number, color: string): BufferGeometry {
  const flag = new ConeGeometry(0.11, 0.24, 3);
  flag.rotateZ(Math.PI);
  flag.scale(1, 1, 0.12);
  flag.translate(x, y, WALL_FACE + 0.015);
  return paint(flag, color);
}

function pennantString(theme: Theme, width: number): BufferGeometry[] {
  const parts: BufferGeometry[] = [];
  const from = 1.5;
  const to = width - 1.5;
  const count = Math.floor((to - from) / 0.42);
  const sag = (t: number) => 1.66 - 0.16 * Math.sin(Math.PI * t);
  for (let i = 0; i < count; i++) {
    const t = (i + 0.5) / count;
    const color = theme.pennants[i % theme.pennants.length] ?? colors.yellow;
    parts.push(pennant(from + t * (to - from), sag(t) - 0.12, color));
    const t0 = i / count;
    const t1 = (i + 1) / count;
    const x0 = from + t0 * (to - from);
    const x1 = from + t1 * (to - from);
    const y0 = sag(t0);
    const y1 = sag(t1);
    const length = Math.hypot(x1 - x0, y1 - y0);
    parts.push(
      buildModel([
        bxd(colors.outline, length, 0.025, 0.025, {
          x: (x0 + x1) / 2,
          y: (y0 + y1) / 2,
          z: WALL_FACE + 0.012,
          rz: Math.atan2(y1 - y0, x1 - x0),
        }),
      ]),
    );
  }
  return parts;
}

/** Rug under the editorial desk: floor-dark body, accent trim, navy edge. */
function rug(map: TileMap, theme: Theme, detail: boolean) {
  const desks = map.fixtures.filter((f) => f.kind === 'desk');
  if (desks.length === 0) {
    return [];
  }
  const minCol = Math.min(...desks.map((d) => d.col));
  const maxCol = Math.max(...desks.map((d) => d.col)) + 1;
  const minRow = Math.min(...desks.map((d) => d.row));
  const maxRow = Math.max(...desks.map((d) => d.row)) + 1;
  const x0 = minCol - 1.1;
  const x1 = maxCol + 1.1;
  const z0 = minRow - 0.9;
  const z1 = maxRow + 0.7;
  const cx = (x0 + x1) / 2;
  const cz = (z0 + z1) / 2;
  const w = x1 - x0;
  const d = z1 - z0;
  const items = [bxd(colors.floorDark, w, 0.004, d, { x: cx, y: 0.0055, z: cz })];
  if (detail) {
    const trim = 0.1;
    const inset = 0.16;
    items.push(
      bxd(theme.accent, w - inset * 2, 0.004, trim, { x: cx, y: 0.0075, z: z0 + inset }),
      bxd(theme.accent, w - inset * 2, 0.004, trim, { x: cx, y: 0.0075, z: z1 - inset }),
      bxd(theme.accent, trim, 0.004, d - inset * 2, { x: x0 + inset, y: 0.0075, z: cz }),
      bxd(theme.accent, trim, 0.004, d - inset * 2, { x: x1 - inset, y: 0.0075, z: cz }),
    );
  }
  return items;
}

function frameItems(slot: DecorSlot, theme: Theme) {
  const z = WALL_FACE + 0.03;
  if (slot.kind === 'window') {
    return [
      bxd(colors.outline, WINDOW_W + 0.14, WINDOW_H + 0.14, 0.05, { x: slot.x, y: ART_Y, z }),
      // Cross bars and a pale sill.
      bxd(colors.outline, 0.04, WINDOW_H, 0.03, { x: slot.x, y: ART_Y, z: z + 0.045 }),
      bxd(colors.outline, WINDOW_W, 0.04, 0.03, { x: slot.x, y: ART_Y, z: z + 0.045 }),
      bxd(theme.wallCap, WINDOW_W + 0.3, 0.06, 0.16, {
        x: slot.x,
        y: ART_Y - WINDOW_H / 2 - 0.1,
        z: z + 0.04,
      }),
    ];
  }
  const wood = slot.poster === 'news';
  return [
    bxd(wood ? colors.furniture : colors.outline, POSTER + 0.1, POSTER + 0.1, 0.04, {
      x: slot.x,
      y: ART_Y,
      z,
    }),
  ];
}

function buildLayer(map: TileMap, theme: Theme, detail: boolean): Layer {
  const slots = decorSlots(map, theme);
  const solidItems = slots.flatMap((slot) => frameItems(slot, theme));
  solidItems.push(...rug(map, theme, detail));
  const solidParts: BufferGeometry[] = [buildModel(solidItems)];
  if (detail && theme.pennants.length > 0) {
    solidParts.push(...pennantString(theme, map.width));
  }
  const arts: BufferGeometry[] = [];
  const rains: BufferGeometry[] = [];
  const zArt = WALL_FACE + 0.07;
  for (const slot of slots) {
    if (slot.kind === 'window') {
      arts.push(quad(WINDOW_W, WINDOW_H, { x: slot.x, y: ART_Y, z: zArt }, `view:${theme.view}`));
      if (theme.rain) {
        rains.push(quad(WINDOW_W, WINDOW_H, { x: slot.x, y: ART_Y, z: zArt + 0.01 }));
      }
    } else {
      arts.push(quad(POSTER, POSTER, { x: slot.x, y: ART_Y, z: zArt }, slot.poster));
    }
  }
  return {
    solid: merge(solidParts),
    art: arts.length > 0 ? merge(arts) : null,
    rain: rains.length > 0 ? merge(rains) : null,
  };
}

export function Decor({ theme }: { theme: Theme }) {
  const detail = useQuality((s) => s.profile.detail);
  const layer = useMemo(() => buildLayer(runtime.map, theme, detail), [theme, detail]);
  const atlas = useMemo(createDecorAtlas, []);
  const rainTexture = useMemo(() => (layer.rain ? createRainTexture() : null), [layer.rain]);
  useEffect(
    () => () => {
      layer.solid.dispose();
      layer.art?.dispose();
      layer.rain?.dispose();
    },
    [layer],
  );
  useEffect(
    () => () => {
      atlas.dispose();
      rainTexture?.dispose();
    },
    [atlas, rainTexture],
  );
  useFrame((_, delta) => {
    if (rainTexture && detail && !useSettings.getState().reducedMotion) {
      rainTexture.offset.y = (rainTexture.offset.y + delta * RAIN_SCROLL) % 1;
    }
  });
  return (
    <group>
      <mesh geometry={layer.solid}>
        <meshLambertMaterial vertexColors />
      </mesh>
      {layer.art && (
        <mesh geometry={layer.art}>
          <meshBasicMaterial map={atlas} />
        </mesh>
      )}
      {layer.rain && rainTexture && (
        <mesh geometry={layer.rain}>
          <meshBasicMaterial map={rainTexture} alphaTest={0.5} />
        </mesh>
      )}
    </group>
  );
}
