// Greybox modelling helpers: primitives placed in a model's local space and painted with a
// palette colour (vertex colours), then merged so a whole prop costs a single draw call.
import { useEffect, useState } from 'react';
import {
  BoxGeometry,
  BufferAttribute,
  type BufferGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  TorusGeometry,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export type Placed = { x?: number; y?: number; z?: number; rx?: number; ry?: number; rz?: number };

function place(geometry: BufferGeometry, at: Placed): BufferGeometry {
  if (at.rx) geometry.rotateX(at.rx);
  if (at.rz) geometry.rotateZ(at.rz);
  if (at.ry) geometry.rotateY(at.ry);
  geometry.translate(at.x ?? 0, at.y ?? 0, at.z ?? 0);
  return geometry;
}

/** Box of size w × h × d centred at the given point. */
export function box(w: number, h: number, d: number, at: Placed = {}): BufferGeometry {
  return place(new BoxGeometry(w, h, d), at);
}

export function cylinder(
  radius: number,
  height: number,
  at: Placed = {},
  segments = 10,
): BufferGeometry {
  return place(new CylinderGeometry(radius, radius, height, segments), at);
}

export function cone(radius: number, height: number, at: Placed = {}): BufferGeometry {
  return place(new ConeGeometry(radius, height, 10), at);
}

export function ring(radius: number, tube: number, at: Placed = {}): BufferGeometry {
  return place(new TorusGeometry(radius, tube, 5, 16), at);
}

/** Gives every vertex of the part one colour (a palette token); use with `vertexColors`. */
export function paint(geometry: BufferGeometry, color: string): BufferGeometry {
  const c = new Color(color);
  const count = geometry.getAttribute('position').count;
  const colors = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  geometry.setAttribute('color', new BufferAttribute(colors, 3));
  return geometry;
}

/** Paints each group of parts and merges everything into one vertex-coloured geometry. */
export function mergePainted(
  groups: readonly [string, readonly BufferGeometry[]][],
): BufferGeometry {
  return merge(groups.flatMap(([color, parts]) => parts.map((part) => paint(part, color))));
}

/** Merges parts into one geometry (the parts are disposed). */
export function merge(parts: BufferGeometry[]): BufferGeometry {
  // Cylinders/cones carry no groups that matter here; strip them so the merge is a plain mesh.
  for (const part of parts) {
    part.clearGroups();
  }
  const merged = mergeGeometries(parts, false);
  for (const part of parts) {
    part.dispose();
  }
  if (!merged) {
    throw new Error('Greybox parts have incompatible attributes');
  }
  return merged;
}

/** Builds geometries once per mount and disposes them on unmount. */
export function useGeometries<T extends Record<string, BufferGeometry>>(build: () => T): T {
  // Lazy state initialiser: runs once per mount, like a memo without dependencies.
  const [geometries] = useState(build);
  useEffect(
    () => () => {
      for (const geometry of Object.values(geometries)) {
        geometry.dispose();
      }
    },
    [geometries],
  );
  return geometries;
}
