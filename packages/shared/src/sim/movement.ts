// Player movement with axis-separated AABB collision against solid tiles. Shared by the server
// (authoritative) and the client (prediction of the local player), so it must stay pure.
import { PLAYER_HALF_SIZE, PLAYER_SPEED_TILES_PER_S, POSITION_QUANTUM } from '../constants.ts';
import type { MoveVector } from '../protocol.ts';
import { isSolid, type TileMap } from './map.ts';

export type Body = { x: number; y: number };

/** Clamps each axis to [-1, 1] and scales the vector down to length 1 if longer (diagonals). */
export function normalizeMove(move: MoveVector): MoveVector {
  const x = clampUnit(move.x);
  const y = clampUnit(move.y);
  const length = Math.hypot(x, y);
  if (length > 1) {
    return { x: x / length, y: y / length };
  }
  return { x, y };
}

export function quantize(value: number): number {
  return Math.round(value / POSITION_QUANTUM) * POSITION_QUANTUM;
}

/** Moves a body by the input for dtMs, sliding along walls. Returns a new body. */
export function moveBody(body: Body, move: MoveVector, dtMs: number, map: TileMap): Body {
  const dir = normalizeMove(move);
  const distance = (PLAYER_SPEED_TILES_PER_S * dtMs) / 1000;
  const x = resolveAxis(body.x, body.y, dir.x * distance, 'x', map);
  const y = resolveAxis(x, body.y, dir.y * distance, 'y', map);
  return { x, y };
}

/** Tolerance for treating a box edge that touches a tile edge as not overlapping it. */
const EDGE_EPSILON = 1e-4;

/**
 * Moves along one axis and stops the box at the first solid tile beyond its leading edge.
 * Only tiles ahead of the leading edge are checked, so a box resting against a wall is never
 * pushed sideways by it. Steps are small (≤ 0.25 tile per tick), so tunnelling is impossible.
 * The result is quantised; on contact it is rounded away from the wall so it never overlaps.
 */
function resolveAxis(x: number, y: number, delta: number, axis: 'x' | 'y', map: TileMap): number {
  const start = axis === 'x' ? x : y;
  if (delta === 0) {
    return start;
  }
  const h = PLAYER_HALF_SIZE;
  const other = axis === 'x' ? y : x;
  const moved = start + delta;
  const crossMin = Math.floor(other - h + EDGE_EPSILON);
  const crossMax = Math.floor(other + h - EDGE_EPSILON);
  const forward = delta > 0;
  // Range of tile indices along the axis newly covered by the leading edge.
  const from = forward
    ? Math.floor(start + h + EDGE_EPSILON)
    : Math.floor(moved - h + EDGE_EPSILON);
  const to = forward ? Math.floor(moved + h - EDGE_EPSILON) : Math.floor(start - h - EDGE_EPSILON);
  const first = forward ? from : to;
  const last = forward ? to : from;
  const stepDir = forward ? 1 : -1;
  for (let i = first; forward ? i <= last : i >= last; i += stepDir) {
    for (let j = crossMin; j <= crossMax; j++) {
      const solid = axis === 'x' ? isSolid(map, i, j) : isSolid(map, j, i);
      if (solid) {
        const contact = forward ? i - h : i + 1 + h;
        return forward ? quantizeDown(contact) : quantizeUp(contact);
      }
    }
  }
  return quantize(moved);
}

function quantizeDown(value: number): number {
  return Math.floor(value / POSITION_QUANTUM) * POSITION_QUANTUM;
}

function quantizeUp(value: number): number {
  return Math.ceil(value / POSITION_QUANTUM) * POSITION_QUANTUM;
}

/** Facing angle for a move vector, or the previous facing when not moving. */
export function facingFor(move: MoveVector, previous: number): number {
  const dir = normalizeMove(move);
  if (dir.x === 0 && dir.y === 0) {
    return previous;
  }
  return Math.atan2(dir.y, dir.x);
}

export function isMoving(move: MoveVector): boolean {
  return move.x !== 0 || move.y !== 0;
}

function clampUnit(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(-1, Math.min(1, value));
}
