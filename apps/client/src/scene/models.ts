// Toy-model building blocks for the scene's furniture: chunky primitives painted with palette
// tokens (vertex colours) and, for the main bodies, a thick navy outline. The outline is an
// "inverted hull" merged into the SAME geometry: an inflated copy of the part with flipped
// triangles, so it only shows around the silhouette (like the characters' outline) and costs no
// extra draw call. A whole prop is one geometry, repeated props are one instanced draw.
import { BufferGeometry } from 'three';
import { colors } from '../ui/tokens.ts';
import type { Placed } from './geometry.ts';
import { box, cylinder, merge, paint, ring } from './geometry.ts';

/** How far the navy hull sticks out of a part (world units; ≈ 2 px at the default camera). */
export const OUTLINE = 0.03;

export type Item = {
  color: string;
  /** Builds the part, inflated by `grow` on every side (0 = the visible fill). */
  make: (grow: number) => BufferGeometry;
  outline: boolean;
};

/** Outlined box. */
export function bx(color: string, w: number, h: number, d: number, at: Placed = {}): Item {
  return {
    color,
    make: (g) => box(w + 2 * g, h + 2 * g, d + 2 * g, at),
    outline: true,
  };
}

/** Box without an outline (small details that would only turn into a navy blob). */
export function bxd(color: string, w: number, h: number, d: number, at: Placed = {}): Item {
  return { color, make: () => box(w, h, d, at), outline: false };
}

/** Outlined cylinder (axis = y before `at` rotates it). */
export function cyl(
  color: string,
  radius: number,
  height: number,
  at: Placed = {},
  segments = 12,
): Item {
  return {
    color,
    make: (g) => cylinder(radius + g, height + 2 * g, at, segments),
    outline: true,
  };
}

export function cyld(
  color: string,
  radius: number,
  height: number,
  at: Placed = {},
  segments = 10,
): Item {
  return { color, make: () => cylinder(radius, height, at, segments), outline: false };
}

/** Outlined torus (a ring standing in the xy plane before `at` rotates it). */
export function tor(color: string, radius: number, tube: number, at: Placed = {}): Item {
  return { color, make: (g) => ring(radius, tube + g, at), outline: true };
}

/** Turns a geometry inside out (flipped winding and normals): visible only from behind. */
function inverted(geometry: BufferGeometry): BufferGeometry {
  const index = geometry.getIndex();
  if (index) {
    for (let i = 0; i < index.count; i += 3) {
      const b = index.getX(i + 1);
      index.setX(i + 1, index.getX(i + 2));
      index.setX(i + 2, b);
    }
  }
  const normal = geometry.getAttribute('normal');
  for (let i = 0; i < normal.count; i++) {
    normal.setXYZ(i, -normal.getX(i), -normal.getY(i), -normal.getZ(i));
  }
  return geometry;
}

/** Fill parts in their own colours, plus one navy inverted hull per outlined part. */
export function buildModel(items: readonly Item[], outlineWidth = OUTLINE): BufferGeometry {
  if (items.length === 0) {
    return new BufferGeometry();
  }
  const parts: BufferGeometry[] = items.map((item) => paint(item.make(0), item.color));
  for (const item of items) {
    if (item.outline) {
      parts.push(inverted(paint(item.make(outlineWidth), colors.outline)));
    }
  }
  return merge(parts);
}
