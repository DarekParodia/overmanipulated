// The sun: one directional light aimed at the room centre, with its shadow box fitted to the map
// so every tile casts and receives shadows on the high preset, whatever the room size (from the
// 20x12 campaign rooms to the 24x14 endless room). Pure maths; SunLight.tsx makes the light.

/** Light position relative to its target. It fixes the light direction for every room. */
export const SUN_OFFSET = { x: 4, y: 12, z: 6 } as const;
/** Tiles added around the room box on each side of the shadow camera. */
export const SUN_MARGIN = 1;
/**
 * Height of the room box the shadow camera must hold, in tiles: players, stations and furniture.
 * The taller back wall (1.8 plus its cap) still fits inside the margin; sun.test checks it.
 */
export const SUN_TALLEST_PROP = 1.4;

type Vec3 = { x: number; y: number; z: number };

export type SunFrame = {
  /** Room centre on the floor; the light looks at it. */
  target: [number, number, number];
  /** target + SUN_OFFSET. */
  position: [number, number, number];
  /** Half-extents of the orthographic shadow camera (left/right = ∓x, top/bottom = ±y). */
  half: { x: number; y: number };
};

const UP: Vec3 = { x: 0, y: 1, z: 0 };

function normalize(v: Vec3): Vec3 {
  const length = Math.hypot(v.x, v.y, v.z);
  return { x: v.x / length, y: v.y / length, z: v.z / length };
}

function cross(a: Vec3, b: Vec3): Vec3 {
  return { x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x };
}

function dot(a: Vec3, b: Vec3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

/** Light frame for a `width` x `height` tile room spanning (0..width, 0..height) on the floor. */
export function sunFrame(width: number, height: number): SunFrame {
  const centre: Vec3 = { x: width / 2, y: 0, z: height / 2 };
  // The shadow camera's axes, built the way three's lookAt builds them: it looks from the light
  // to the target, so its z axis points along the offset.
  const axisZ = normalize(SUN_OFFSET);
  const axisX = normalize(cross(UP, axisZ));
  const axisY = cross(axisZ, axisX);
  let halfX = 0;
  let halfY = 0;
  for (const dx of [-width / 2, width / 2]) {
    for (const dy of [0, SUN_TALLEST_PROP]) {
      for (const dz of [-height / 2, height / 2]) {
        const corner: Vec3 = { x: dx, y: dy, z: dz };
        halfX = Math.max(halfX, Math.abs(dot(corner, axisX)));
        halfY = Math.max(halfY, Math.abs(dot(corner, axisY)));
      }
    }
  }
  return {
    target: [centre.x, centre.y, centre.z],
    position: [centre.x + SUN_OFFSET.x, centre.y + SUN_OFFSET.y, centre.z + SUN_OFFSET.z],
    half: { x: halfX + SUN_MARGIN, y: halfY + SUN_MARGIN },
  };
}
