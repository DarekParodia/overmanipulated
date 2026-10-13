// Walking for the balance bots: distance fields over the tile map. A field gives, for every
// floor tile, the walking cost (in tiles, octile metric) to the nearest tile from which a given
// fixture can be reached (a floor tile directly next to it). Bots follow the field downhill, so
// they use real map distances and never walk through walls or furniture.
import {
  isSolid,
  PLAYER_SPEED_TILES_PER_S,
  type TileMap,
  type Vec2,
} from '../../packages/shared/src/index.ts';

const SQRT2 = Math.SQRT2;
const NEIGHBOURS: readonly (readonly [number, number])[] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1],
];

export type NavField = { width: number; height: number; dist: Float64Array };

const cache = new WeakMap<TileMap, Map<string, NavField>>();

function floor(map: TileMap, col: number, row: number): boolean {
  return !isSolid(map, col, row);
}

/** A diagonal step is allowed only when both orthogonal neighbours are floor (no corner cutting). */
function canStep(map: TileMap, col: number, row: number, dc: number, dr: number): boolean {
  if (!floor(map, col + dc, row + dr)) {
    return false;
  }
  return dc === 0 || dr === 0 || (floor(map, col + dc, row) && floor(map, col, row + dr));
}

/** Walking-cost field towards the stand tiles of one fixture. */
export function navField(map: TileMap, fixtureId: string): NavField {
  let perMap = cache.get(map);
  if (!perMap) {
    perMap = new Map();
    cache.set(map, perMap);
  }
  const cached = perMap.get(fixtureId);
  if (cached) {
    return cached;
  }
  const fixture = map.fixtures.find((f) => f.id === fixtureId);
  if (!fixture) {
    throw new Error(`Unknown fixture ${fixtureId}`);
  }
  const { width, height } = map;
  const dist = new Float64Array(width * height).fill(Number.POSITIVE_INFINITY);
  const queue: number[] = [];
  for (const [dc, dr] of NEIGHBOURS.slice(0, 4)) {
    const col = fixture.col + dc;
    const row = fixture.row + dr;
    if (floor(map, col, row)) {
      dist[row * width + col] = 0;
      queue.push(row * width + col);
    }
  }
  // Label-correcting search; the grids are tiny.
  while (queue.length > 0) {
    const index = queue.shift() as number;
    const col = index % width;
    const row = Math.floor(index / width);
    const here = dist[index] as number;
    for (const [dc, dr] of NEIGHBOURS) {
      if (!canStep(map, col, row, dc, dr)) {
        continue;
      }
      const next = (row + dr) * width + (col + dc);
      const cost = here + (dc !== 0 && dr !== 0 ? SQRT2 : 1);
      if (cost < (dist[next] as number)) {
        dist[next] = cost;
        queue.push(next);
      }
    }
  }
  const field = { width, height, dist };
  perMap.set(fixtureId, field);
  return field;
}

export function fieldAt(field: NavField, col: number, row: number): number {
  if (col < 0 || row < 0 || col >= field.width || row >= field.height) {
    return Number.POSITIVE_INFINITY;
  }
  return field.dist[row * field.width + col] as number;
}

/** Seconds a walk of `tiles` takes at full speed. */
export function walkSeconds(tiles: number): number {
  return tiles / PLAYER_SPEED_TILES_PER_S;
}

/** Walking cost in tiles from a body position to the fixture's stand tiles. */
export function distanceTo(map: TileMap, fixtureId: string, at: Vec2): number {
  return fieldAt(navField(map, fixtureId), Math.floor(at.x), Math.floor(at.y));
}

/**
 * The point the bot should walk to next, or `null` when it stands on a stand tile already.
 * On a stand tile the target is the tile centre so the front tile check hits the fixture.
 */
export function nextWaypoint(map: TileMap, fixtureId: string, at: Vec2): Vec2 | 'arrived' | null {
  const field = navField(map, fixtureId);
  const col = Math.floor(at.x);
  const row = Math.floor(at.y);
  const here = fieldAt(field, col, row);
  if (!Number.isFinite(here)) {
    return null;
  }
  if (here === 0) {
    const centre = { x: col + 0.5, y: row + 0.5 };
    return Math.hypot(centre.x - at.x, centre.y - at.y) < 0.06 ? 'arrived' : centre;
  }
  let best: { col: number; row: number } | undefined;
  let bestValue = here;
  for (const [dc, dr] of NEIGHBOURS) {
    if (!canStep(map, col, row, dc, dr)) {
      continue;
    }
    const value = fieldAt(field, col + dc, row + dr);
    if (value < bestValue) {
      bestValue = value;
      best = { col: col + dc, row: row + dr };
    }
  }
  return best ? { x: best.col + 0.5, y: best.row + 0.5 } : null;
}

/** Unit axis direction from a stand tile to the fixture next to it. */
export function directionToFixture(map: TileMap, fixtureId: string, at: Vec2): Vec2 {
  const fixture = map.fixtures.find((f) => f.id === fixtureId);
  if (!fixture) {
    return { x: 0, y: 0 };
  }
  const dc = fixture.col - Math.floor(at.x);
  const dr = fixture.row - Math.floor(at.y);
  if (Math.abs(dc) + Math.abs(dr) === 1) {
    return { x: dc, y: dr };
  }
  return { x: Math.sign(fixture.col + 0.5 - at.x), y: Math.sign(fixture.row + 0.5 - at.y) };
}
